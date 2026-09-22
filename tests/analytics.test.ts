import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { closeDatabase, getDatabase, initDatabase } from '../db';
import { getDashboardAnalytics, setDb } from '../services';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

const dateKey = (offsetDays: number): string => {
  const now = new Date();
  const base = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
};

async function seedTopic(client: Api, name: string): Promise<string> {
  const res = await client.request('/api/topics', { method: 'POST', body: { name, priority: 8, weightage: 40 } });
  return res.json.topics[0].id;
}

async function createBlock(client: Api, topicId: string, date: string, startTime: string, durationMinutes: number, completed = false) {
  const res = await client.request('/api/schedule-blocks', {
    method: 'POST',
    body: { topicId, title: `Study ${date} ${startTime}`, date, startTime, durationMinutes, completed },
  });
  assert.strictEqual(res.status, 201);
}

describe('legacy block analytics', () => {
  let server: TestServer;
  let alice: Api;
  let bob: Api;

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const { token } = await alice.register('alice@analytics.com', 'secret123');
    alice.token = token;
    bob = new Api(server.baseUrl);
    const { token: bobToken } = await bob.register('bob@analytics.com', 'secret123');
    bob.token = bobToken;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('returns all zeros for an empty user', async () => {
    const { status, json } = await bob.request('/api/analytics');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.analytics.plannedMinutes, 0);
    assert.strictEqual(json.analytics.completedMinutes, 0);
    assert.strictEqual(json.analytics.completedCount, 0);
    assert.strictEqual(json.analytics.missedCount, 0);
    assert.strictEqual(json.analytics.completionRate, 0);
    assert.strictEqual(json.analytics.upcomingWorkloadMinutes, 0);
    assert.deepStrictEqual(json.analytics.topicProgress, []);
  });

  it('requires authentication', async () => {
    const anonymous = new Api(server.baseUrl);
    assert.strictEqual((await anonymous.request('/api/analytics')).status, 401);
  });

  it('computes planned/completed/missed/upcoming/workload from persisted blocks', async () => {
    const graphs = await seedTopic(alice, 'Graphs');
    const dp = await seedTopic(alice, 'DP');

    await createBlock(alice, graphs, dateKey(-1), '09:00', 60, true);   // completed (past)
    await createBlock(alice, graphs, dateKey(0), '09:00', 30, true);    // completed (today)
    await createBlock(alice, dp, dateKey(-1), '14:00', 45);             // missed
    await createBlock(alice, dp, dateKey(-2), '14:00', 90);             // missed
    await createBlock(alice, graphs, dateKey(1), '09:00', 120);         // upcoming
    await createBlock(alice, dp, dateKey(0), '11:00', 60);              // upcoming (today)
    await createBlock(alice, graphs, dateKey(7), '09:00', 80);          // upcoming

    const { json } = await alice.request('/api/analytics');
    const a = json.analytics;
    assert.strictEqual(a.today, dateKey(0));
    assert.strictEqual(a.plannedMinutes, 485);
    assert.strictEqual(a.completedMinutes, 90);
    assert.strictEqual(a.completedCount, 2);
    assert.strictEqual(a.missedCount, 2);
    assert.strictEqual(a.completionRate, 0.5);
    assert.strictEqual(a.upcomingWorkloadMinutes, 260);

    const graphsProgress = a.topicProgress.find((t: any) => t.topicId === graphs);
    const dpProgress = a.topicProgress.find((t: any) => t.topicId === dp);
    assert.strictEqual(graphsProgress.topicName, 'Graphs');
    assert.strictEqual(graphsProgress.totalBlocks, 4);
    assert.strictEqual(graphsProgress.completedBlocks, 2);
    assert.strictEqual(graphsProgress.completionRate, 0.5);
    assert.strictEqual(dpProgress.totalBlocks, 3);
    assert.strictEqual(dpProgress.completedBlocks, 0);
    assert.strictEqual(dpProgress.completionRate, 0);
  });

  it('analytics are scoped to the authenticated user', async () => {
    await createBlock(bob, await seedTopic(bob, 'BobTopic'), dateKey(0), '09:00', 30, true);

    const aliceAnalytics = (await alice.request('/api/analytics')).json.analytics;
    assert.strictEqual(aliceAnalytics.plannedMinutes, 485, "alice's numbers are unaffected by bob");

    const bobAnalytics = (await bob.request('/api/analytics')).json.analytics;
    assert.strictEqual(bobAnalytics.plannedMinutes, 30);
    assert.strictEqual(bobAnalytics.completedMinutes, 30);
    assert.strictEqual(bobAnalytics.completedCount, 1);
    assert.strictEqual(bobAnalytics.missedCount, 0);
    assert.strictEqual(bobAnalytics.completionRate, 1);
    assert.strictEqual(bobAnalytics.upcomingWorkloadMinutes, 0);
    assert.strictEqual(bobAnalytics.topicProgress.length, 1);
  });
});

describe('dashboard analytics', () => {
  const currentTime = new Date('2026-09-14T12:00:00.000Z');
  let server: TestServer;
  let alice: Api;
  let aliceId: string;
  let topicOne: string;
  let topicTwo: string;
  let completedBlockId: string;
  let stoppedBlockId: string;

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const { token, user } = await alice.register('analytics-alice@example.com', 'secret123');
    alice.token = token;
    aliceId = user.id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function createSession(blockId: string, durationMinutes: number) {
    const created = await alice.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: blockId, durationMinutes } });
    assert.strictEqual(created.status, 201);
    return created.json.studySession.id as string;
  }

  async function patch(sessionId: string, status: string, actualDurationSeconds: number) {
    const response = await alice.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status, actualDurationSeconds } });
    assert.strictEqual(response.status, 200);
  }

  it('returns a truthful empty state for a new account', async () => {
    const empty = new Api(server.baseUrl);
    const { token } = await empty.register('analytics-empty@example.com', 'secret123');
    empty.token = token;
    const response = await empty.request('/api/analytics/dashboard');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.json.analytics.summary, {
      plannedMinutes: 0, actualSeconds: 0, completedSessions: 0, stoppedSessions: 0,
      completionRate: 0, upcomingBlocks: 0, upcomingMinutes: 0,
    });
    assert.deepStrictEqual(response.json.analytics.topics, []);
    assert.deepStrictEqual(response.json.analytics.feedback, {
      averageFocus: null, averageDifficulty: null, averageProgress: null, responseCount: 0,
    });
  });

  it('aggregates planned blocks, persisted durations, terminal statuses, workload, topics, and feedback', async () => {
    const topics = await alice.request('/api/topics/bulk', { method: 'POST', body: { topics: [{ name: 'Analytics DBMS' }, { name: 'Analytics OS' }] } });
    topicOne = topics.json.topics.find((topic: any) => topic.name === 'Analytics DBMS').id;
    topicTwo = topics.json.topics.find((topic: any) => topic.name === 'Analytics OS').id;
    const blocks = await alice.request('/api/schedule-blocks/bulk', { method: 'POST', body: { scheduleBlocks: [
      { topicId: topicOne, title: 'Completed block', date: '2026-09-15', startTime: '08:00', durationMinutes: 90 },
      { topicId: topicOne, title: 'Extra completed block', date: '2026-09-15', startTime: '10:00', durationMinutes: 30 },
      { topicId: topicTwo, title: 'Stopped block', date: '2026-09-16', startTime: '08:00', durationMinutes: 30 },
      { topicId: topicTwo, title: 'Upcoming block', date: '2026-09-17', startTime: '08:00', durationMinutes: 60 },
    ] } });
    assert.strictEqual(blocks.status, 201);
    completedBlockId = blocks.json.scheduleBlocks.find((block: any) => block.title === 'Completed block').id;
    stoppedBlockId = blocks.json.scheduleBlocks.find((block: any) => block.title === 'Stopped block').id;
    const completed = await createSession(completedBlockId, 120);
    await patch(completed, 'completed', 3600);
    const extraCompletedBlockId = blocks.json.scheduleBlocks.find((block: any) => block.title === 'Extra completed block').id;
    const extraCompleted = await createSession(extraCompletedBlockId, 30);
    await patch(extraCompleted, 'completed', 120);
    const stopped = await createSession(stoppedBlockId, 30);
    await patch(stopped, 'stopped', 600);
    assert.strictEqual((await alice.request(`/api/study-sessions/${completed}/feedback`, {
      method: 'POST', body: { focusRating: 4, difficultyRating: 5, progressRating: 3, notes: 'Real evidence' },
    })).status, 201);
    // Keep the rolling-window assertion independent of the machine clock.
    (await getDatabase()).prepare('UPDATE study_sessions SET started_at = ? WHERE user_id = ?').run('2026-09-13T10:00:00.000Z', aliceId);

    const analytics = getDashboardAnalytics(aliceId, currentTime);
    assert.deepStrictEqual(analytics.summary, {
      plannedMinutes: 210, actualSeconds: 4320, completedSessions: 2, stoppedSessions: 1,
      completionRate: 2 / 3, upcomingBlocks: 2, upcomingMinutes: 90,
    });
    assert.strictEqual(analytics.sevenDay.plannedMinutes, 0);
    assert.strictEqual(analytics.sevenDay.actualSeconds, 4320);
    assert.strictEqual(analytics.sevenDay.completedSessions, 2);
    assert.strictEqual(analytics.sevenDay.stoppedSessions, 1);
    assert.deepStrictEqual(analytics.feedback, {
      averageFocus: 4, averageDifficulty: 5, averageProgress: 3, responseCount: 1,
    });
    const dbms = analytics.topics.find((topic) => topic.topicId === topicOne)!;
    const os = analytics.topics.find((topic) => topic.topicId === topicTwo)!;
    assert.deepStrictEqual(dbms, { topicId: topicOne, topicName: 'Analytics DBMS', plannedMinutes: 120, actualSeconds: 3720, completedSessions: 2, stoppedSessions: 0 });
    assert.deepStrictEqual(os, { topicId: topicTwo, topicName: 'Analytics OS', plannedMinutes: 90, actualSeconds: 600, completedSessions: 0, stoppedSessions: 1 });
  });

  it('does not fabricate paused or active time and keeps users isolated', async () => {
    const active = await createSession(stoppedBlockId, 30);
    await patch(active, 'paused', 0);
    const aliceAnalytics = getDashboardAnalytics(aliceId, currentTime);
    assert.strictEqual(aliceAnalytics.summary.actualSeconds, 4320);

    const bob = new Api(server.baseUrl);
    const { token, user } = await bob.register('analytics-bob@example.com', 'secret123');
    bob.token = token;
    const topic = await bob.request('/api/topics', { method: 'POST', body: { name: 'Bob Topic' } });
    const block = await bob.request('/api/schedule-blocks', { method: 'POST', body: { topicId: topic.json.topics[0].id, title: 'Bob block', date: '2026-09-16', startTime: '08:00', durationMinutes: 30 } });
    const bobBlock = block.json.scheduleBlocks.find((item: any) => item.title === 'Bob block');
    const bobSession = await bob.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: bobBlock.id, durationMinutes: 30 } });
    assert.strictEqual((await bob.request(`/api/study-sessions/${bobSession.json.studySession.id}`, { method: 'PATCH', body: { status: 'completed', actualDurationSeconds: 600 } })).status, 200);
    const bobAnalytics = getDashboardAnalytics(user.id, currentTime);
    assert.strictEqual(bobAnalytics.summary.plannedMinutes, 30);
    assert.strictEqual(bobAnalytics.summary.actualSeconds, 600);
    assert.strictEqual(bobAnalytics.summary.completedSessions, 1);
    assert.strictEqual(aliceAnalytics.summary.plannedMinutes, 210);
  });

  it('survives database restart because analytics derives from persisted records', async () => {
    closeDatabase();
    await initDatabase();
    setDb(await getDatabase());
    const analytics = getDashboardAnalytics(aliceId, currentTime);
    assert.strictEqual(analytics.summary.plannedMinutes, 210);
    assert.strictEqual(analytics.summary.actualSeconds, 4320);
    assert.strictEqual(analytics.feedback.averageDifficulty, 5);
  });
});
