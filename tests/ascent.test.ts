import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';
import { getDatabase, initDatabase, closeDatabase } from '../db';
import { setDb } from '../services';

let server: TestServer;

async function createClient(emailPrefix = 'ascent'): Promise<{ client: Api; userId: string; topicId: string }> {
  const client = new Api(server.baseUrl);
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { token, user } = await client.register(email, 'secret123');
  client.token = token;

  const topicsRes = await client.request('/api/topics', {
    method: 'POST',
    body: { name: 'Algorithms & Focus', priority: 5, weightage: 20 },
  });
  assert.strictEqual(topicsRes.status, 201);
  const topicId = topicsRes.json.topics[0].id;

  return { client, userId: user.id, topicId };
}

describe('YOUR ASCENT — Progression & Motion Backend', () => {
  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('requires authentication for /api/ascent', async () => {
    const anon = new Api(server.baseUrl);
    const res = await anon.request('/api/ascent');
    assert.strictEqual(res.status, 401);
  });

  it('logging in alone does NOT create progress: starts at basecamp (0.05, STARTING)', async () => {
    const { client } = await createClient('fresh-user');
    const res = await client.request('/api/ascent');
    assert.strictEqual(res.status, 200);

    const ascent = res.json.ascent;
    assert.strictEqual(ascent.progress, 0.05);
    assert.strictEqual(ascent.stage, 'STARTING');
    assert.strictEqual(ascent.totalCompleted, 0);
    assert.strictEqual(ascent.totalMissed, 0);
    assert.strictEqual(ascent.elevationMeters, 222);
    assert.strictEqual(ascent.tomorrowCommitment, null);
  });

  it('completing a scheduled commitment moves the user upward', async () => {
    const { client, topicId } = await createClient('climb-user');

    // Action: complete a commitment
    const actionRes = await client.request('/api/ascent/action', {
      method: 'POST',
      body: { action: 'complete' },
    });
    assert.strictEqual(actionRes.status, 200);

    const ascent = actionRes.json.ascent;
    assert.strictEqual(ascent.totalCompleted, 1);
    assert.strictEqual(ascent.totalMissed, 0);
    assert.ok(ascent.progress > 0.05, `Expected progress > 0.05, got ${ascent.progress}`);
    assert.strictEqual(ascent.progress, 0.135);
    assert.ok(ascent.elevationMeters > 222, `Expected elevation > 222m, got ${ascent.elevationMeters}m`);
  });

  it('progresses through stages: STARTING -> BUILDING -> CONSISTENT -> MOMENTUM -> MASTERY', async () => {
    const { client } = await createClient('stage-climber');

    // 1st completion: progress 0.135 -> STARTING
    let res = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(res.json.ascent.stage, 'STARTING');

    // 2nd completion: progress 0.22 -> enters BUILDING (>= 0.20)
    res = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(res.json.ascent.stage, 'BUILDING');
    assert.strictEqual(res.json.ascent.progress, 0.22);

    // 3 more completions: reach >= 0.40 -> CONSISTENT
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    res = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(res.json.ascent.stage, 'CONSISTENT');
    assert.ok(res.json.ascent.progress >= 0.40);

    // 3 more completions: reach >= 0.65 -> MOMENTUM
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    res = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(res.json.ascent.stage, 'MOMENTUM');
    assert.ok(res.json.ascent.progress >= 0.65);

    // 3 more completions: reach >= 0.85 -> MASTERY
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    res = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(res.json.ascent.stage, 'MASTERY');
    assert.ok(res.json.ascent.progress >= 0.85);
    assert.ok(res.json.ascent.elevationMeters >= 1840);
  });

  it('missing a commitment moves the user downward without falling off', async () => {
    const { client } = await createClient('miss-user');

    // Advance to BUILDING with 2 completed commitments
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    const climbRes = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(climbRes.json.ascent.progress, 0.22);
    assert.strictEqual(climbRes.json.ascent.stage, 'BUILDING');

    // Miss a commitment: progress must decrease
    const missRes = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'miss' } });
    assert.strictEqual(missRes.status, 200);

    const afterMiss = missRes.json.ascent;
    assert.strictEqual(afterMiss.totalMissed, 1);
    assert.ok(afterMiss.progress < 0.22, `Expected progress < 0.22, got ${afterMiss.progress}`);
    assert.strictEqual(afterMiss.progress, 0.155);
    assert.strictEqual(afterMiss.stage, 'STARTING'); // Reverted gracefully to STARTING
    assert.ok(afterMiss.progress >= 0.04, 'Progress must never drop below basecamp bounds');
  });

  it('recovery works: completing a commitment after a miss rebuilds progress', async () => {
    const { client } = await createClient('recovery-user');

    // Start with 1 completion then 1 miss
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    const missRes = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'miss' } });
    assert.strictEqual(missRes.json.ascent.totalMissed, 1);
    const progressAfterMiss = missRes.json.ascent.progress;

    // Now recover: complete commitment
    const recoverRes = await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    assert.strictEqual(recoverRes.status, 200);

    const recovered = recoverRes.json.ascent;
    assert.ok(recovered.progress > progressAfterMiss, `Expected ${recovered.progress} > ${progressAfterMiss}`);
    assert.strictEqual(recovered.totalMissed, 0); // Missed commitment was successfully completed and recovered!
  });

  it("tomorrow's commitment persists to SQLite schedule_blocks and appears in ascent", async () => {
    const { client } = await createClient('tomorrow-user');

    const commitRes = await client.request('/api/ascent/commit-tomorrow', {
      method: 'POST',
      body: {
        title: 'Complete 2 LeetCode problems',
        startTime: '19:00',
        durationMinutes: 60,
      },
    });
    assert.strictEqual(commitRes.status, 201);
    assert.strictEqual(commitRes.json.block.title, 'Complete 2 LeetCode problems');
    assert.strictEqual(commitRes.json.block.startTime, '19:00');
    assert.strictEqual(commitRes.json.block.durationMinutes, 60);

    const ascent = commitRes.json.ascent;
    assert.ok(ascent.tomorrowCommitment !== null, 'Expected tomorrowCommitment to be populated');
    assert.strictEqual(ascent.tomorrowCommitment.title, 'Complete 2 LeetCode problems');
    assert.strictEqual(ascent.tomorrowCommitment.startTime, '19:00');

    // Verify it is also visible in standard schedule-blocks API
    const blocksRes = await client.request('/api/schedule-blocks');
    const matched = blocksRes.json.scheduleBlocks.find((b: any) => b.title === 'Complete 2 LeetCode problems');
    assert.ok(matched, 'Expected tomorrow commitment in scheduleBlocks');
  });

  it('survives database reload: refreshing the page preserves exact ascent state', async () => {
    const { client, userId } = await createClient('persist-user');

    // Create 3 completions and a tomorrow commitment
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await client.request('/api/ascent/commit-tomorrow', {
      method: 'POST',
      body: { title: 'Revise Dynamic Programming', startTime: '20:00', durationMinutes: 45 },
    });

    const beforeReload = (await client.request('/api/ascent')).json.ascent;

    // Simulate database close and reload
    closeDatabase();
    await initDatabase();
    const freshDb = await getDatabase();
    setDb(freshDb);

    // Fetch after reload
    const afterReload = (await client.request('/api/ascent')).json.ascent;
    assert.strictEqual(afterReload.progress, beforeReload.progress);
    assert.strictEqual(afterReload.stage, beforeReload.stage);
    assert.strictEqual(afterReload.elevationMeters, beforeReload.elevationMeters);
    assert.strictEqual(afterReload.totalCompleted, beforeReload.totalCompleted);
    assert.strictEqual(afterReload.tomorrowCommitment.title, 'Revise Dynamic Programming');
  });

  it('multi-user isolation: user progress is strictly separated', async () => {
    const { client: alice } = await createClient('alice-climber');
    const { client: bob } = await createClient('bob-climber');

    // Alice climbs to BUILDING
    await alice.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });
    await alice.request('/api/ascent/action', { method: 'POST', body: { action: 'complete' } });

    const aliceAscent = (await alice.request('/api/ascent')).json.ascent;
    const bobAscent = (await bob.request('/api/ascent')).json.ascent;

    assert.strictEqual(aliceAscent.stage, 'BUILDING');
    assert.strictEqual(aliceAscent.totalCompleted, 2);

    // Bob must remain untouched at basecamp
    assert.strictEqual(bobAscent.stage, 'STARTING');
    assert.strictEqual(bobAscent.totalCompleted, 0);
    assert.strictEqual(bobAscent.progress, 0.05);
  });
});
