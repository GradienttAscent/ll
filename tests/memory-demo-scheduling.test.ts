import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { closeDatabase, getDatabase, initDatabase } from '../db';
import { setDb } from '../services';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('Memory Atlas demo scheduling', () => {
  let server: TestServer;
  let api: Api;

  before(async () => {
    server = await createTestServer();
    api = new Api(server.baseUrl);
    const account = await api.register('memory-demo-schedule@example.com', 'secret123');
    api.token = account.token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('resolves all demo topics, previews safe revisions, persists them, and prevents duplicates', async () => {
    const preview = await api.request('/api/memory/demo-refresh-plan', { method: 'POST', body: {} });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.json.refreshPlan.items.length, 3);
    assert.deepStrictEqual(preview.json.refreshPlan.items.map((item: any) => item.topicName), [
      'Memory Graphs', 'Brief Reading', 'Memory Dynamic Programming',
    ]);

    const topics = await api.request('/api/topics');
    for (const item of preview.json.refreshPlan.items) {
      const topic = topics.json.topics.find((entry: any) => entry.name === item.topicName);
      assert.ok(topic);
      assert.strictEqual(item.topicId, topic.id);
    }

    const accepted = await api.request('/api/memory/demo-refresh-plan/accept', {
      method: 'POST', body: { items: preview.json.refreshPlan.items },
    });
    assert.strictEqual(accepted.status, 201);
    assert.strictEqual(accepted.json.scheduleBlocks.length, 3);
    assert.ok(accepted.json.scheduleBlocks.every((block: any) => block.blockType === 'revision'));

    const calendar = await api.request('/api/schedule-blocks');
    for (const acceptedBlock of accepted.json.scheduleBlocks) {
      assert.ok(calendar.json.scheduleBlocks.some((block: any) => block.id === acceptedBlock.id));
    }

    const duplicate = await api.request('/api/memory/demo-refresh-plan', { method: 'POST', body: {} });
    assert.strictEqual(duplicate.status, 200);
    assert.strictEqual(duplicate.json.refreshPlan.items.length, 0);

    closeDatabase();
    await initDatabase();
    setDb(await getDatabase());
    const afterRestart = await api.request('/api/schedule-blocks');
    for (const acceptedBlock of accepted.json.scheduleBlocks) {
      assert.ok(afterRestart.json.scheduleBlocks.some((block: any) => block.id === acceptedBlock.id));
    }
  });

  it('rejects a stale preview when its slot becomes occupied', async () => {
    const conflictApi = new Api(server.baseUrl);
    const account = await conflictApi.register('memory-demo-conflict@example.com', 'secret123');
    conflictApi.token = account.token;
    const preview = await conflictApi.request('/api/memory/demo-refresh-plan', {
      method: 'POST', body: { demoTopicId: 'demo-memory-dynamic-programming' },
    });
    assert.strictEqual(preview.status, 200);
    const item = preview.json.refreshPlan.items[0];
    assert.ok(item);

    const blocker = await conflictApi.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId: item.topicId, title: 'Calendar conflict', date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes },
    });
    assert.strictEqual(blocker.status, 201);

    const stale = await conflictApi.request('/api/memory/demo-refresh-plan/accept', {
      method: 'POST', body: { demoTopicId: 'demo-memory-dynamic-programming', items: preview.json.refreshPlan.items },
    });
    assert.strictEqual(stale.status, 409);
  });
});
