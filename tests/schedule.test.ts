import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

async function seedTopic(client: Api): Promise<string> {
  const res = await client.request('/api/topics', { method: 'POST', body: { name: 'Graphs', priority: 8, weightage: 40 } });
  assert.strictEqual(res.status, 201);
  return res.json.topics[0].id;
}

function blockBody(topicId: string, overrides: any = {}) {
  return {
    topicId,
    title: 'Study',
    date: '2026-10-01',
    startTime: '09:00',
    durationMinutes: 30,
    ...overrides,
  };
}

describe('schedule overlap, atomicity, and completed protection', () => {
  let server: TestServer;
  let alice: Api;
  let bob: Api;
  let topicId: string;
  let bobTopicId: string;

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const { token } = await alice.register('alice@schedule.com', 'secret123');
    alice.token = token;
    bob = new Api(server.baseUrl);
    const { token: bobToken } = await bob.register('bob@schedule.com', 'secret123');
    bob.token = bobToken;
    topicId = await seedTopic(alice);
    bobTopicId = await seedTopic(bob);
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('bulk creation saves all non-overlapping blocks', async () => {
    const res = await alice.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        blockBody(topicId, { startTime: '09:00', durationMinutes: 60 }),
        blockBody(topicId, { startTime: '10:00', durationMinutes: 60 }),
        blockBody(topicId, { startTime: '13:00', durationMinutes: 45 }),
      ] },
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.scheduleBlocks.length, 3);
  });

  it('bulk creation is atomic: one conflicting block rolls back everything', async () => {
    const beforeCount = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    const res = await alice.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        blockBody(topicId, { startTime: '15:00', durationMinutes: 60 }),
        blockBody(topicId, { startTime: '09:30', durationMinutes: 60, title: 'Conflict' }),
      ] },
    });
    assert.strictEqual(res.status, 409);
    const after = await alice.request('/api/schedule-blocks');
    assert.strictEqual(after.json.scheduleBlocks.length, beforeCount);
    assert.ok(!after.json.scheduleBlocks.some((b: any) => b.startTime === '15:00'), 'valid block was rolled back too');
  });

  it('bulk creation is atomic: a bad topic reference saves nothing', async () => {
    const beforeCount = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    const res = await alice.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        blockBody(topicId, { startTime: '15:30', durationMinutes: 30 }),
        blockBody('not-a-topic', { startTime: '16:00', durationMinutes: 30 }),
      ] },
    });
    assert.strictEqual(res.status, 404);
    const after = await alice.request('/api/schedule-blocks');
    assert.strictEqual(after.json.scheduleBlocks.length, beforeCount);
  });

  it('partial overlap is rejected with 409', async () => {
    // Existing 10:00-11:00 from the first bulk test.
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '10:30', durationMinutes: 60 }) });
    assert.strictEqual(res.status, 409);
  });

  it('contained overlap is rejected', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '10:15', durationMinutes: 30 }) });
    assert.strictEqual(res.status, 409);
  });

  it('containing overlap is rejected', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '08:30', durationMinutes: 150 }) });
    assert.strictEqual(res.status, 409);
  });

  it('identical interval is rejected', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '10:00', durationMinutes: 60 }) });
    assert.strictEqual(res.status, 409);
  });

  it('multiple conflicts are rejected', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '08:30', durationMinutes: 180 }) });
    assert.strictEqual(res.status, 409);
  });

  it('exact boundary at the end is allowed', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '11:00', durationMinutes: 60 }) });
    assert.strictEqual(res.status, 201);
  });

  it('exact boundary at the start is allowed', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '08:30', durationMinutes: 30 }) });
    assert.strictEqual(res.status, 201, '08:30–09:00 touches the existing 09:00 block exactly');
  });

  it('fully non-overlapping intervals are allowed', async () => {
    const res = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { startTime: '20:00', durationMinutes: 30 }) });
    assert.strictEqual(res.status, 201);
  });

  it('overlap detection is user-specific', async () => {
    const existing = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { date: '2026-11-01', startTime: '10:00', durationMinutes: 60 }) });
    assert.strictEqual(existing.status, 201);
    const bobRes = await bob.request('/api/schedule-blocks', { method: 'POST', body: blockBody(bobTopicId, { date: '2026-11-01', startTime: '10:30', durationMinutes: 60 }) });
    assert.strictEqual(bobRes.status, 201, 'a different user may overlap the same slot');
  });

  it('PATCH that creates an overlap is rejected', async () => {
    const blocks = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks;
    const eleven = blocks.find((b: any) => b.startTime === '11:00' && b.durationMinutes === 60);
    assert.ok(eleven);
    const res = await alice.request(`/api/schedule-blocks/${eleven.id}`, { method: 'PATCH', body: { startTime: '10:30' } });
    assert.strictEqual(res.status, 409);
    const after = await alice.request('/api/schedule-blocks');
    const refreshed = after.json.scheduleBlocks.find((b: any) => b.id === eleven.id);
    assert.strictEqual(refreshed.startTime, '11:00');
  });

  it('PATCH to an exact boundary is allowed', async () => {
    const blocks = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks;
    const eleven = blocks.find((b: any) => b.startTime === '11:00' && b.durationMinutes === 60);
    const res = await alice.request(`/api/schedule-blocks/${eleven.id}`, { method: 'PATCH', body: { startTime: '14:00' } });
    assert.strictEqual(res.status, 200);
  });

  it('completed blocks cannot be rescheduled', async () => {
    const created = await alice.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId, { date: '2026-12-01', startTime: '09:00', durationMinutes: 60 }) });
    assert.strictEqual(created.status, 201);
    const block = created.json.scheduleBlocks.find((b: any) => b.date === '2026-12-01');

    const done = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { completed: true } });
    assert.strictEqual(done.status, 200);

    const rescheduled = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { startTime: '14:00' } });
    assert.strictEqual(rescheduled.status, 409);

    const sameTime = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { startTime: '09:00' } });
    assert.strictEqual(sameTime.status, 200, 'no-op scheduling fields are not a reschedule');

    const titleOnly = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { title: 'Reviewed' } });
    assert.strictEqual(titleOnly.status, 200);

    const reopened = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { completed: false } });
    assert.strictEqual(reopened.status, 200);
    const nowReschedule = await alice.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { startTime: '15:00' } });
    assert.strictEqual(nowReschedule.status, 200, 'incomplete blocks may be rescheduled');
  });

  it('bulk save and single create require authentication', async () => {
    const anonymous = new Api(server.baseUrl);
    assert.strictEqual((await anonymous.request('/api/schedule-blocks/bulk', { method: 'POST', body: { scheduleBlocks: [blockBody(topicId)] } })).status, 401);
    assert.strictEqual((await anonymous.request('/api/schedule-blocks', { method: 'POST', body: blockBody(topicId) })).status, 401);
    assert.strictEqual((await anonymous.request('/api/analytics')).status, 401);
  });
});