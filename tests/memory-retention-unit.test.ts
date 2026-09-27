import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { getDatabase } from '../db';
import {
  buildMemoryRefreshPlan,
  DEFAULT_MEMORY_STRENGTH_DAYS,
  memoryAtlas,
  MEMORY_DUE_THRESHOLD,
  MEMORY_STABLE_THRESHOLD,
  MEMORY_STRENGTH_EXPOSURE_BONUS,
  MEMORY_STRENGTH_EXPOSURE_CAP,
  MIN_MEANINGFUL_STUDY_SECONDS,
} from '../services';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

// White-box and boundary coverage for the retention model in services.ts.
//
// The verified model is:
//   MIN_MEANINGFUL_STUDY_SECONDS = 60        a session must reach 60 actual seconds
//   strengthDays(n) = 7 * (1 + 0.35 * min(n - 1, 6))
//   predictedRetention = clamp(exp(-elapsedDays / strengthDays), 0, 1)
//   retentionStatus: >= 0.7 stable, >= 0.5 fading, otherwise due
//   dueAt = lastStudiedAt + strengthDays * ln(1 / 0.5) days
//
// Every threshold below is imported from services.ts rather than hard-coded, so the test states
// the boundary explicitly instead of duplicating a magic number. `memoryAtlas` accepts an
// injected clock, which makes each retention figure exact instead of wall-clock dependent.

const DAY_MS = 86_400_000;
const BASE = Date.parse('2026-09-14T09:00:00.000Z');

/** Elapsed time, in days, at which a given strength crosses a retention threshold. */
const daysToRetention = (strengthDays: number, threshold: number): number => strengthDays * Math.log(1 / threshold);

describe('RET retention constants (services.ts)', () => {
  // The CSE312 test plan quotes 60 seconds, 0.5 and 0.7. This pins the values the code actually
  // uses, so a later constant change fails loudly instead of silently weakening the tests below.
  it('RET-01 pins the exported retention constants', () => {
    assert.strictEqual(MIN_MEANINGFUL_STUDY_SECONDS, 60);
    assert.strictEqual(MEMORY_STABLE_THRESHOLD, 0.7);
    assert.strictEqual(MEMORY_DUE_THRESHOLD, 0.5);
    assert.strictEqual(DEFAULT_MEMORY_STRENGTH_DAYS, 7);
    assert.strictEqual(MEMORY_STRENGTH_EXPOSURE_CAP, 6);
    assert.strictEqual(MEMORY_STRENGTH_EXPOSURE_BONUS, 0.35);
  });
});

describe('RET retention model (services.ts memoryAtlas)', () => {
  let server: TestServer;
  let seq = 0;

  before(async () => {
    server = await createTestServer();
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  interface Seeded {
    userId: string;
    email: string;
    topicId: string;
    topicName: string;
  }

  /** Creates a fresh user so each isolated case starts from an empty atlas. */
  async function newUser(): Promise<{ userId: string; email: string; client: Api }> {
    seq += 1;
    const client = new Api(server.baseUrl);
    const email = `ret-${seq}-${Date.now()}@example.com`;
    const account = await client.register(email, 'secret123');
    client.token = account.token;
    return { userId: account.user.id, email, client };
  }

  /** Adds a topic to an existing user. */
  async function addTopic(client: Api, name: string, options: { priority?: number; weightage?: number; hasWeightage?: boolean } = {}): Promise<Seeded> {
    const response = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name, priority: options.priority ?? 5, weightage: options.weightage ?? 5, hasWeightage: options.hasWeightage ?? false }] },
    });
    assert.strictEqual(response.status, 201);
    return { userId: '', email: '', topicId: response.json.topics[0].id, topicName: name };
  }

  /** Creates a fresh user owning exactly one topic. */
  async function newTopic(name: string, options: { priority?: number; weightage?: number; hasWeightage?: boolean } = {}): Promise<Seeded> {
    const user = await newUser();
    const topic = await addTopic(user.client, name, options);
    return { userId: user.userId, email: user.email, topicId: topic.topicId, topicName: name };
  }

  /**
   * Completes `count` sessions for a topic and pins the decay origin to `lastStudiedAt`.
   * Pinning `ended_at` directly is what makes the retention figures exact instead of racy.
   */
  async function completeSessions(seed: Seeded, seconds: number[], lastStudiedAt: number, startHour = 8): Promise<void> {
    const client = new Api(server.baseUrl);
    client.token = (await client.login(seed.email, 'secret123')).token;
    const iso = new Date(lastStudiedAt).toISOString();

    for (let index = 0; index < seconds.length; index += 1) {
      const hour = startHour + index;
      const title = `Session ${index} ${Date.now()}`;
      const block = await client.request('/api/schedule-blocks', {
        method: 'POST',
        body: { topicId: seed.topicId, title, date: '2026-09-14', startTime: `${String(hour).padStart(2, '0')}:00`, durationMinutes: 30 },
      });
      assert.strictEqual(block.status, 201, `block ${index} should be created`);
      const blockId = block.json.scheduleBlocks.find((item: any) => item.title === title).id;
      const created = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: blockId, durationMinutes: 30 } });
      assert.strictEqual(created.status, 201);
      const sessionId = created.json.studySession.id;
      const patched = await client.request(`/api/study-sessions/${sessionId}`, {
        method: 'PATCH',
        body: { status: 'completed', actualDurationSeconds: seconds[index] },
      });
      assert.strictEqual(patched.status, 200);
      (await getDatabase())
        .prepare('UPDATE study_sessions SET started_at = ?, ended_at = ? WHERE id = ?')
        .run(iso, iso, sessionId);
    }
  }

  const atlasFor = (userId: string, evaluatedAt: number) => memoryAtlas(userId, 0, new Date(evaluatedAt));

  // UT-RET-01 - the qualifying-session filter is `actual_duration_seconds >= 60`. A session one
  // second short is not memory evidence, so the topic stays unexplored.
  it('UT-RET-01 excludes a topic whose only session is 59 seconds', async () => {
    const seed = await newTopic('Below Threshold');
    await completeSessions(seed, [MIN_MEANINGFUL_STUDY_SECONDS - 1], BASE);
    const atlas = atlasFor(seed.userId, BASE);
    assert.strictEqual(atlas.topics.length, 0);
    assert.strictEqual(atlas.summary.studiedTopicCount, 0);
    assert.strictEqual(atlas.summary.unexploredCount, 1);
  });

  // UT-RET-02 - the inclusive side of the same comparison. A session of exactly 60 seconds does
  // qualify. This 59/60 pair is the boundary the test plan calls for and no prior suite covered it.
  it('UT-RET-02 admits a topic whose session is exactly 60 seconds', async () => {
    const seed = await newTopic('At Threshold');
    await completeSessions(seed, [MIN_MEANINGFUL_STUDY_SECONDS], BASE);
    const atlas = atlasFor(seed.userId, BASE);
    assert.strictEqual(atlas.topics.length, 1);
    assert.strictEqual(atlas.topics[0].qualifyingSessionCount, 1);
    assert.strictEqual(atlas.topics[0].totalActualStudySeconds, 60);
    assert.strictEqual(atlas.summary.studiedTopicCount, 1);
    assert.strictEqual(atlas.summary.unexploredCount, 0);
  });

  // UT-RET-03 - first exposure. With no prior successful exposure the bonus term is zero, so the
  // strength is exactly the 7-day default.
  it('UT-RET-03 gives a single exposure the default strength and full retention', async () => {
    const seed = await newTopic('First Exposure');
    await completeSessions(seed, [600], BASE);
    const state = atlasFor(seed.userId, BASE).topics[0];
    assert.strictEqual(state.memoryStrengthDays, 7);
    assert.strictEqual(state.qualifyingSessionCount, 1);
    // Retention is evaluated at the instant of study, so the model starts at exactly 1.
    assert.strictEqual(state.predictedRetention, 1);
    assert.strictEqual(state.status, 'stable');
    assert.strictEqual(state.lastStudiedAt, new Date(BASE).toISOString());
  });

  // UT-RET-04 - repeated exposures lengthen the strength by the fixed bonus per prior exposure.
  it('UT-RET-04 lengthens strength by the exposure bonus for each extra session', async () => {
    const cases: Array<[number, number]> = [
      [1, 7], [2, 9.45], [3, 11.9], [4, 14.35], [5, 16.8], [6, 19.25], [7, 21.7],
    ];
    for (const [exposures, expectedStrength] of cases) {
      const seed = await newTopic(`Strength ${exposures}`);
      await completeSessions(seed, new Array(exposures).fill(600), BASE);
      const state = atlasFor(seed.userId, BASE).topics[0];
      assert.strictEqual(state.qualifyingSessionCount, exposures);
      assert.strictEqual(
        state.memoryStrengthDays, expectedStrength,
        `${exposures} exposures should give ${expectedStrength} strength days`,
      );
    }
  });

  // UT-RET-05 - the exposure cap. The bonus is applied to at most 6 prior exposures, so strength
  // saturates at 7 * (1 + 0.35 * 6) = 21.7 days no matter how many further sessions happen.
  it('UT-RET-05 caps the exposure bonus at 6 prior exposures', async () => {
    for (const exposures of [MEMORY_STRENGTH_EXPOSURE_CAP + 1, MEMORY_STRENGTH_EXPOSURE_CAP + 2, MEMORY_STRENGTH_EXPOSURE_CAP + 5]) {
      const seed = await newTopic(`Capped ${exposures}`);
      await completeSessions(seed, new Array(exposures).fill(600), BASE);
      const state = atlasFor(seed.userId, BASE).topics[0];
      assert.strictEqual(state.qualifyingSessionCount, exposures);
      assert.strictEqual(
        state.memoryStrengthDays, 21.7,
        `${exposures} exposures must saturate at the 21.7 day ceiling`,
      );
    }
  });

  // WB-RET-01 - the `retention >= 0.7 -> stable` decision, driven through the real
  // `retentionStatus` inside `memoryAtlas`. One minute either side of the exact crossing time is
  // used so the assertion is not sensitive to floating-point representation.
  it('WB-RET-01 flips between stable and fading at the 0.7 threshold', async () => {
    const seed = await newTopic('Threshold 0.7');
    await completeSessions(seed, [600], BASE);
    const strength = 7;
    const crossing = daysToRetention(strength, MEMORY_STABLE_THRESHOLD) * DAY_MS;

    const justBefore = atlasFor(seed.userId, BASE + crossing - 60_000).topics[0];
    const justAfter = atlasFor(seed.userId, BASE + crossing + 60_000).topics[0];

    assert.ok(justBefore.predictedRetention > MEMORY_STABLE_THRESHOLD, 'one minute before the crossing retention must exceed 0.7');
    assert.ok(justAfter.predictedRetention < MEMORY_STABLE_THRESHOLD, 'one minute after the crossing retention must fall below 0.7');
    assert.strictEqual(justBefore.status, 'stable');
    assert.strictEqual(justAfter.status, 'fading');
  });

  // WB-RET-02 - the `retention >= 0.5 -> fading` decision and the fall-through to 'due'.
  it('WB-RET-02 flips between fading and due at the 0.5 threshold', async () => {
    const seed = await newTopic('Threshold 0.5');
    await completeSessions(seed, [600], BASE);
    const strength = 7;
    const crossing = daysToRetention(strength, MEMORY_DUE_THRESHOLD) * DAY_MS;

    const justBefore = atlasFor(seed.userId, BASE + crossing - 60_000).topics[0];
    const justAfter = atlasFor(seed.userId, BASE + crossing + 60_000).topics[0];

    assert.ok(justBefore.predictedRetention > MEMORY_DUE_THRESHOLD, 'one minute before the crossing retention must exceed 0.5');
    assert.ok(justAfter.predictedRetention < MEMORY_DUE_THRESHOLD, 'one minute after the crossing retention must fall below 0.5');
    assert.strictEqual(justBefore.status, 'fading');
    assert.strictEqual(justAfter.status, 'due');

    // Long after the crossing the exponential has decayed to a negligible positive value and
    // the status stays 'due'. The value never reaches exactly 0, so the floor clamp is asserted
    // through the elapsed-time floor instead (see the assertion below).
    const longAfter = atlasFor(seed.userId, BASE + 3650 * DAY_MS).topics[0];
    assert.ok(longAfter.predictedRetention >= 0 && longAfter.predictedRetention < 1e-200);
    assert.strictEqual(longAfter.status, 'due');

    // The elapsed-time floor: evaluating before the session started clamps elapsed time to zero,
    // so retention is exactly 1 and the topic is 'stable'.
    const beforeStudy = atlasFor(seed.userId, BASE - 30 * DAY_MS).topics[0];
    assert.strictEqual(beforeStudy.predictedRetention, 1);
    assert.strictEqual(beforeStudy.status, 'stable');
  });

  // WB-RET-03 - dueAt / nextRevisionAt / daysUntilDue. A topic is due when retention decays to
  // the 0.5 threshold, i.e. after strengthDays * ln(2) days.
  it('WB-RET-03 derives dueAt from the 0.5 decay point and reports daysUntilDue', async () => {
    const seed = await newTopic('Due Date');
    await completeSessions(seed, [600], BASE);
    const expectedDueOffset = 7 * Math.log(1 / MEMORY_DUE_THRESHOLD) * DAY_MS;
    const expectedDueAt = new Date(BASE + expectedDueOffset).toISOString();

    const fresh = atlasFor(seed.userId, BASE).topics[0];
    assert.strictEqual(fresh.dueAt, expectedDueAt);
    assert.strictEqual(fresh.nextRevisionAt, expectedDueAt);
    assert.strictEqual(fresh.daysUntilDue, 4.85);
    assert.strictEqual(fresh.status, 'stable');

    // Half a day later retention is exp(-0.5/7) = 0.9311, still stable, and one day less is due.
    const inTwoDays = atlasFor(seed.userId, BASE + 2 * DAY_MS).topics[0];
    assert.strictEqual(inTwoDays.status, 'stable');
    assert.strictEqual(inTwoDays.daysUntilDue, 2.85);

    const pastDue = atlasFor(seed.userId, BASE + expectedDueOffset + 3_600_000).topics[0];
    assert.strictEqual(pastDue.status, 'due');
    assert.ok(pastDue.daysUntilDue < 0, 'a topic evaluated an hour past dueAt must report a negative daysUntilDue');
  });

  // WB-RET-04 - the summary counters. The existing suite only ever produced a 'due' topic, so
  // the stable/fading tallies and the per-course retention average were never executed.
  it('WB-RET-04 tallies stable, fading and due topics and averages per course', async () => {
    // All three topics must belong to ONE user, because the atlas is user-scoped.
    const user = await newUser();
    const names = ['Summary Stable', 'Summary Fading', 'Summary Due'];
    const topicIds = new Map<string, string>();
    for (const name of names) {
      const topic = await addTopic(user.client, name);
      topicIds.set(name, topic.topicId);
      await completeSessions({ userId: user.userId, email: user.email, topicId: topic.topicId, topicName: name }, [600], BASE, 8 + names.indexOf(name) * 2);
    }

    // Each topic then gets a different decay origin, so that at one shared evaluation instant
    // (BASE + 4 days) the three otherwise-identical 7-day-strength topics land in three different
    // retention bands. Elapsed 1 day -> exp(-1/7) = 0.867 stable; 3 days -> exp(-3/7) = 0.651
    // fading; 6 days -> exp(-6/7) = 0.425 due.
    const origins: Record<string, number> = {
      'Summary Stable': BASE + 3 * DAY_MS,
      'Summary Fading': BASE + 1 * DAY_MS,
      'Summary Due': BASE - 2 * DAY_MS,
    };
    for (const name of names) await repinLastStudied(user.userId, topicIds.get(name)!, origins[name]);

    const atlas = memoryAtlas(user.userId, 0, new Date(BASE + 4 * DAY_MS));
    assert.strictEqual(atlas.topics.length, 3, 'all three topics must appear in the atlas');
    assert.strictEqual(atlas.summary.studiedTopicCount, 3);
    assert.strictEqual(atlas.summary.unexploredCount, 0);

    const statuses = new Map(atlas.topics.map((topic) => [topic.topicName, topic.status]));
    assert.strictEqual(statuses.get('Summary Stable'), 'stable');
    assert.strictEqual(statuses.get('Summary Fading'), 'fading');
    assert.strictEqual(statuses.get('Summary Due'), 'due');
    assert.strictEqual(atlas.summary.stableCount, 1);
    assert.strictEqual(atlas.summary.fadingCount, 1);
    assert.strictEqual(atlas.summary.dueCount, 1);

    // The course summary aggregates the same three counters and averages retention.
    const course = atlas.courses[0];
    assert.strictEqual(course.courseId, atlas.topics[0].courseId);
    assert.strictEqual(course.studiedTopicCount, 3);
    assert.strictEqual(course.stableCount, 1);
    assert.strictEqual(course.fadingCount, 1);
    assert.strictEqual(course.dueCount, 1);
    const mean = atlas.topics.reduce((total, topic) => total + topic.predictedRetention, 0) / 3;
    assert.ok(Math.abs(course.predictedRetention - mean) < 1e-9, 'course retention must be the mean of its topics');
  });

  async function repinLastStudied(userId: string, topicId: string, lastStudiedAt: number): Promise<void> {
    const iso = new Date(lastStudiedAt).toISOString();
    (await getDatabase())
      .prepare(`UPDATE study_sessions SET started_at = ?, ended_at = ? WHERE id IN (
        SELECT s.id FROM study_sessions s
        JOIN schedule_blocks b ON b.id = s.schedule_block_id
        WHERE b.topic_id = ? AND s.user_id = ? AND s.status = 'completed')`)
      .run(iso, iso, topicId, userId);
  }

  // WB-RET-05 - refresh duration. A due high-priority or high-weightage topic gets 20 minutes, a
  // due low-priority topic 15, and a not-yet-due topic 10. None of these were asserted before.
  it('WB-RET-05 sizes the refresh by status, priority and weightage', async () => {
    const strength = 7;
    const pastDueAt = BASE + daysToRetention(strength, MEMORY_DUE_THRESHOLD) * DAY_MS + DAY_MS;

    const highPriority = await newTopic('Refresh High Priority', { priority: 9, weightage: 5 });
    await completeSessions(highPriority, [600], BASE);
    const highPlan = buildMemoryRefreshPlan(highPriority.userId, highPriority.topicId, new Date(pastDueAt));
    assert.strictEqual(highPlan.items.length, 1);
    assert.strictEqual(highPlan.items[0].durationMinutes, 20);
    assert.strictEqual(highPlan.items[0].reason, 'Revision due based on the current memory estimate.');

    const highWeightage = await newTopic('Refresh High Weightage', { priority: 2, weightage: 25 });
    await completeSessions(highWeightage, [600], BASE);
    const weightagePlan = buildMemoryRefreshPlan(highWeightage.userId, highWeightage.topicId, new Date(pastDueAt));
    assert.strictEqual(weightagePlan.items[0].durationMinutes, 20);

    const lowPriority = await newTopic('Refresh Low Priority', { priority: 3, weightage: 5 });
    await completeSessions(lowPriority, [600], BASE);
    const lowPlan = buildMemoryRefreshPlan(lowPriority.userId, lowPriority.topicId, new Date(pastDueAt));
    assert.strictEqual(lowPlan.items[0].durationMinutes, 15);

    // A fading topic is not yet due, so it takes the 10-minute refresh and the other reason text.
    const fading = await newTopic('Refresh Fading', { priority: 3, weightage: 5 });
    await completeSessions(fading, [600], BASE);
    const fadingPlan = buildMemoryRefreshPlan(fading.userId, fading.topicId, new Date(BASE + 4 * DAY_MS));
    assert.strictEqual(fadingPlan.items[0].durationMinutes, 10);
    assert.strictEqual(fadingPlan.items[0].reason, 'Approaching the predicted revision threshold.');
  });

  // WB-RET-06 - refresh eligibility is `status === 'due' || daysUntilDue <= 7`. Because dueAt is
  // strengthDays * ln(2) out, a low-exposure topic becomes refresh-eligible almost immediately
  // while a heavily reinforced topic stays out of scope well past 7 days. That is the clause
  // doing real work, and it had no coverage.
  it('WB-RET-06 gates refresh eligibility on the 7-day look-ahead', async () => {
    const evaluatedAt = BASE + 2 * DAY_MS;

    // One exposure: strength 7 days, dueAt 4.85 days out, so 2.85 days remain -> eligible.
    const light = await newTopic('Eligibility Light');
    await completeSessions(light, [600], BASE);
    const lightState = atlasFor(light.userId, evaluatedAt).topics[0];
    assert.strictEqual(lightState.status, 'stable');
    assert.ok(lightState.daysUntilDue <= 7);
    assert.strictEqual(buildMemoryRefreshPlan(light.userId, light.topicId, new Date(evaluatedAt)).items.length, 1);

    // Eight exposures saturate the bonus at 21.7 strength days, pushing dueAt 15.04 days out.
    const reinforced = await newTopic('Eligibility Reinforced');
    await completeSessions(reinforced, new Array(8).fill(600), BASE);
    const reinforcedState = atlasFor(reinforced.userId, evaluatedAt).topics[0];
    assert.strictEqual(reinforcedState.status, 'stable');
    assert.ok(reinforcedState.daysUntilDue > 7, 'a reinforced topic should be more than 7 days from due');
    const skipped = buildMemoryRefreshPlan(reinforced.userId, reinforced.topicId, new Date(evaluatedAt));
    assert.deepStrictEqual(skipped.items, []);
    assert.strictEqual(skipped.totalMinutes, 0);
    assert.strictEqual(skipped.message, 'This topic does not currently need a refresh, or already has one scheduled.');
  });

  // WB-RET-07 - a topic with no qualifying evidence is not in the atlas at all, which is a
  // different outcome from "in the atlas but not due yet".
  it('WB-RET-07 rejects a refresh request for a topic with no qualifying evidence', async () => {
    const seed = await newTopic('Never Studied');
    assert.throws(
      () => buildMemoryRefreshPlan(seed.userId, seed.topicId, new Date(BASE)),
      (error: any) => error?.status === 404 && error?.message === 'No qualifying completed study evidence exists for this topic.',
      'a topic with no completed session evidence must be rejected with 404',
    );
  });

  // WB-RET-08 - the forecast horizon is clamped to 0..14 days before the retention model runs.
  it('WB-RET-08 clamps the forecast horizon to 0..14 days', async () => {
    const seed = await newTopic('Forecast Clamp');
    await completeSessions(seed, [600], BASE);
    assert.strictEqual(memoryAtlas(seed.userId, 0, new Date(BASE)).forecastDays, 0);
    assert.strictEqual(memoryAtlas(seed.userId, 14, new Date(BASE)).forecastDays, 14);
    assert.strictEqual(memoryAtlas(seed.userId, 99, new Date(BASE)).forecastDays, 14);
    assert.strictEqual(memoryAtlas(seed.userId, -5, new Date(BASE)).forecastDays, 0);
    assert.strictEqual(memoryAtlas(seed.userId, Number.NaN, new Date(BASE)).forecastDays, 0);
    // The clamp is applied by advancing the evaluation instant, so a forecast lowers retention.
    const now = memoryAtlas(seed.userId, 0, new Date(BASE)).topics[0];
    const forecast = memoryAtlas(seed.userId, 14, new Date(BASE)).topics[0];
    assert.ok(forecast.predictedRetention < now.predictedRetention);
    assert.strictEqual(forecast.status, 'due');
  });
});
