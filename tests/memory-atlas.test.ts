import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

function futureDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Memory Atlas', () => {
  let server: TestServer;
  let alice: Api;
  let bob: Api;
  let studiedTopicId: string;
  let insignificantTopicId: string;
  let secondTopicId: string;

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const aliceAccount = await alice.register('memory-alice@example.com', 'secret123');
    alice.token = aliceAccount.token;
    bob = new Api(server.baseUrl);
    const bobAccount = await bob.register('memory-bob@example.com', 'secret123');
    bob.token = bobAccount.token;
    const topics = await alice.request('/api/topics/bulk', { method: 'POST', body: { topics: [
      { name: 'Memory Graphs', priority: 9, weightage: 40, hasWeightage: true },
      { name: 'Brief Reading', priority: 4, weightage: 10 },
      { name: 'Memory Dynamic Programming', priority: 7, weightage: 20, hasWeightage: true },
    ] } });
    studiedTopicId = topics.json.topics.find((topic: any) => topic.name === 'Memory Graphs').id;
    insignificantTopicId = topics.json.topics.find((topic: any) => topic.name === 'Brief Reading').id;
    secondTopicId = topics.json.topics.find((topic: any) => topic.name === 'Memory Dynamic Programming').id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function complete(client: Api, topicId: string, title: string, seconds: number, dayOffset: number) {
    const blockResponse = await client.request('/api/schedule-blocks', { method: 'POST', body: {
      topicId, title, date: futureDate(dayOffset), startTime: `${String(8 + dayOffset).padStart(2, '0')}:00`, durationMinutes: 30,
    } });
    assert.strictEqual(blockResponse.status, 201);
    const block = blockResponse.json.scheduleBlocks.find((item: any) => item.title === title);
    const sessionResponse = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: block.id, durationMinutes: 30 } });
    assert.strictEqual(sessionResponse.status, 201);
    const sessionId = sessionResponse.json.studySession.id;
    assert.strictEqual((await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'completed', actualDurationSeconds: seconds } })).status, 200);
    return { block, sessionId };
  }

  it('excludes scheduled-only and insignificant completed sessions', async () => {
    const scheduled = await alice.request('/api/schedule-blocks', { method: 'POST', body: {
      topicId: secondTopicId, title: 'Scheduled only', date: futureDate(5), startTime: '18:00', durationMinutes: 30,
    } });
    assert.strictEqual(scheduled.status, 201);
    await complete(alice, insignificantTopicId, 'Accidental completion', 59, 1);
    const response = await alice.request('/api/memory/topics');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.json.memory.summary.studiedTopicCount, 0);
    assert.strictEqual(response.json.memory.summary.unexploredCount, 3);
  });

  it('creates a memory trace, calculates forecast decay, and aggregates actual time', async () => {
    await complete(alice, studiedTopicId, 'Meaningful Graphs', 600, 2);
    const today = await alice.request('/api/memory/topics?forecastDays=0');
    const future = await alice.request('/api/memory/topics?forecastDays=14');
    assert.strictEqual(today.status, 200);
    const current = today.json.memory.topics.find((topic: any) => topic.topicId === studiedTopicId);
    const forecast = future.json.memory.topics.find((topic: any) => topic.topicId === studiedTopicId);
    assert.ok(current);
    assert.strictEqual(current.qualifyingSessionCount, 1);
    assert.strictEqual(current.totalActualStudySeconds, 600);
    assert.strictEqual(current.memoryStrengthDays, 7);
    assert.ok(current.predictedRetention > forecast.predictedRetention);
    assert.strictEqual(forecast.status, 'due');
    assert.ok(Date.parse(current.dueAt) > Date.parse(current.lastStudiedAt));
    assert.strictEqual(today.json.memory.courses[0].studiedTopicCount, 1);
  });

  it('strengthens repeated meaningful completions and resets the latest decay origin', async () => {
    const before = (await alice.request('/api/memory/topics')).json.memory.topics.find((topic: any) => topic.topicId === studiedTopicId);
    await complete(alice, studiedTopicId, 'Graphs revision evidence', 300, 3);
    const after = (await alice.request('/api/memory/topics')).json.memory.topics.find((topic: any) => topic.topicId === studiedTopicId);
    assert.strictEqual(after.qualifyingSessionCount, 2);
    assert.strictEqual(after.totalActualStudySeconds, 900);
    assert.ok(after.memoryStrengthDays > before.memoryStrengthDays);
    assert.ok(Date.parse(after.lastStudiedAt) >= Date.parse(before.lastStudiedAt));
    assert.ok(after.predictedRetention >= before.predictedRetention);
  });

  it('keeps Memory Atlas user-scoped', async () => {
    const bobTopic = await bob.request('/api/topics', { method: 'POST', body: { name: 'Bob private memory' } });
    await complete(bob, bobTopic.json.topics[0].id, 'Bob completion', 120, 4);
    const aliceMemory = await alice.request('/api/memory/topics');
    const bobMemory = await bob.request('/api/memory/topics');
    assert.ok(!aliceMemory.json.memory.topics.some((topic: any) => topic.topicName === 'Bob private memory'));
    assert.strictEqual(bobMemory.json.memory.topics.length, 1);
    assert.strictEqual((await new Api(server.baseUrl).request('/api/memory/topics')).status, 401);
  });

  it('builds a conflict-safe refresh plan, persists revision blocks once, and uses completion as another exposure', async () => {
    const planResponse = await alice.request('/api/memory/refresh-plan', { method: 'POST', body: { topicId: studiedTopicId } });
    assert.strictEqual(planResponse.status, 200);
    const plan = planResponse.json.refreshPlan;
    assert.strictEqual(plan.items.length, 1);
    const item = plan.items[0];
    const blocker = await alice.request('/api/schedule-blocks', { method: 'POST', body: {
      topicId: secondTopicId, title: 'Post-plan conflict', date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes,
    } });
    assert.strictEqual(blocker.status, 201);
    const staleAcceptance = await alice.request('/api/memory/refresh-plan/accept', { method: 'POST', body: { topicId: studiedTopicId, items: plan.items } });
    assert.strictEqual(staleAcceptance.status, 409);

    const rebuilt = (await alice.request('/api/memory/refresh-plan', { method: 'POST', body: { topicId: studiedTopicId } })).json.refreshPlan;
    assert.strictEqual(rebuilt.items.length, 1);
    const accepted = await alice.request('/api/memory/refresh-plan/accept', { method: 'POST', body: { topicId: studiedTopicId, items: rebuilt.items } });
    assert.strictEqual(accepted.status, 201);
    const revision = accepted.json.scheduleBlocks[0];
    assert.strictEqual(revision.blockType, 'revision');
    const duplicate = await alice.request('/api/memory/refresh-plan/accept', { method: 'POST', body: { topicId: studiedTopicId, items: rebuilt.items } });
    assert.strictEqual(duplicate.status, 409);

    const session = await alice.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: revision.id, durationMinutes: revision.durationMinutes } });
    assert.strictEqual(session.status, 201);
    assert.strictEqual((await alice.request(`/api/study-sessions/${session.json.studySession.id}`, { method: 'PATCH', body: { status: 'completed', actualDurationSeconds: 120 } })).status, 200);
    const memory = (await alice.request('/api/memory/topics')).json.memory.topics.find((topic: any) => topic.topicId === studiedTopicId);
    assert.strictEqual(memory.qualifyingSessionCount, 3);
    assert.strictEqual(memory.totalActualStudySeconds, 1020);
  });
});
