import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('schedule safety', () => {
  let server: TestServer;
  let client: Api;
  let topicId: string;

  const block = (title: string, date: string, startTime: string, durationMinutes: number, override: Record<string, unknown> = {}) => ({
    topicId,
    title,
    date,
    startTime,
    durationMinutes,
    ...override,
  });

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('schedule@safety.com', 'secret123');
    client.token = token;
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Schedule Safety' }] },
    });
    topicId = topics.json.topics[0].id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function create(title: string, date: string, startTime: string, durationMinutes: number, override: Record<string, unknown> = {}) {
    return client.request('/api/schedule-blocks', {
      method: 'POST',
      body: block(title, date, startTime, durationMinutes, override),
    });
  }

  it('rejects partial overlap', async () => {
    assert.strictEqual((await create('Partial base', '2026-10-01', '10:00', 60)).status, 201);
    assert.strictEqual((await create('Partial overlap', '2026-10-01', '10:30', 60)).status, 409);
  });

  it('rejects a candidate contained by an existing block', async () => {
    assert.strictEqual((await create('Contained base', '2026-10-02', '10:00', 120)).status, 201);
    assert.strictEqual((await create('Contained candidate', '2026-10-02', '10:30', 30)).status, 409);
  });

  it('rejects a candidate encompassing an existing block', async () => {
    assert.strictEqual((await create('Encompassed base', '2026-10-03', '10:30', 30)).status, 201);
    assert.strictEqual((await create('Encompassing candidate', '2026-10-03', '10:00', 90)).status, 409);
  });

  it('rejects exact duplicate intervals', async () => {
    assert.strictEqual((await create('Duplicate base', '2026-10-04', '10:00', 60)).status, 201);
    assert.strictEqual((await create('Duplicate candidate', '2026-10-04', '10:00', 60)).status, 409);
  });

  it('allows adjacent intervals', async () => {
    assert.strictEqual((await create('Adjacent first', '2026-10-05', '10:00', 60)).status, 201);
    assert.strictEqual((await create('Adjacent second', '2026-10-05', '11:00', 60)).status, 201);
  });

  it('applies overlap validation when patching a block', async () => {
    assert.strictEqual((await create('Patch base', '2026-10-10', '10:00', 60)).status, 201);
    const movable = await create('Patch candidate', '2026-10-10', '12:00', 60);
    assert.strictEqual(movable.status, 201);
    const candidate = movable.json.scheduleBlocks.find((item: any) => item.title === 'Patch candidate');
    assert.strictEqual((await client.request(`/api/schedule-blocks/${candidate.id}`, {
      method: 'PATCH', body: { startTime: '10:30' },
    })).status, 409);
  });

  it('rejects malformed dates, times, and cross-midnight blocks', async () => {
    assert.strictEqual((await create('Bad date', '2026-02-30', '10:00', 30)).status, 400);
    assert.strictEqual((await create('Bad time', '2026-10-06', '25:00', 30)).status, 400);
    assert.strictEqual((await create('Cross midnight', '2026-10-06', '23:30', 31)).status, 400);
  });

  it('rejects conflicting blocks in one bulk request without writes', async () => {
    const result = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        block('Bulk conflict first', '2026-10-07', '10:00', 60),
        block('Bulk conflict second', '2026-10-07', '10:30', 60),
      ] },
    });
    assert.strictEqual(result.status, 409);
    const blocks = (await client.request('/api/schedule-blocks')).json.scheduleBlocks;
    assert.ok(!blocks.some((item: any) => item.title === 'Bulk conflict first' || item.title === 'Bulk conflict second'));
  });

  it('rejects a later invalid bulk entry without partial writes', async () => {
    const result = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        block('Bulk valid first', '2026-10-08', '10:00', 60),
        block('Bulk invalid second', '2026-10-08', '11:00', 60, { topicId: 'missing-topic' }),
      ] },
    });
    assert.strictEqual(result.status, 404);
    const blocks = (await client.request('/api/schedule-blocks')).json.scheduleBlocks;
    assert.ok(!blocks.some((item: any) => item.title === 'Bulk valid first' || item.title === 'Bulk invalid second'));
  });

  it('rejects rescheduling a completed block', async () => {
    const created = await create('Completed block', '2026-10-09', '10:00', 60);
    assert.strictEqual(created.status, 201);
    const completed = created.json.scheduleBlocks.find((item: any) => item.title === 'Completed block');
    assert.ok(completed);
    assert.strictEqual((await client.request(`/api/schedule-blocks/${completed.id}`, {
      method: 'PATCH', body: { completed: true },
    })).status, 200);
    assert.strictEqual((await client.request(`/api/schedule-blocks/${completed.id}`, {
      method: 'PATCH', body: { startTime: '11:00' },
    })).status, 409);
  });
});
