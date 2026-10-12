import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('visible topic scope', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register(`topic-scope-${Date.now()}@example.com`, 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('does not expose orphan topics before evidence is uploaded', async () => {
    const created = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Legacy Seed Topic' }] },
    });
    assert.strictEqual(created.status, 201);
    const visible = await client.request('/api/topics/visible');
    assert.deepStrictEqual(visible.json.topics, []);
  });

  it('exposes only extracted topics and uses the same scope for generation', async () => {
    const uploaded = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'current-paper.txt',
        docType: 'Past Paper',
        content: 'QUESTION 1 (10 Marks): Explain BFS traversal.',
      },
    });
    assert.strictEqual(uploaded.status, 201);

    await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Unrelated Course Topic' }] },
    });
    const visible = await client.request('/api/topics/visible');
    assert.deepStrictEqual(visible.json.topics.map((topic: any) => topic.name), ['Graph Algorithms']);

    const dataset = await client.request('/api/schedule/dataset');
    assert.deepStrictEqual(dataset.json.dataset.topics.map((topic: any) => topic.topicName), ['Graph Algorithms']);
  });
});