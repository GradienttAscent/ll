import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
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

describe('analytics', () => {
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