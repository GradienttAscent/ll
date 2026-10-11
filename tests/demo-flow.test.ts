import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

let server: TestServer;

async function createClient(emailPrefix = 'demo'): Promise<Api> {
  const client = new Api(server.baseUrl);
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { token } = await client.register(email, 'secret123');
  client.token = token;
  return client;
}

describe('2025 software architecture demo flow', () => {
  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('starts a new account without academic material or a preloaded demo pack', async () => {
    const client = await createClient('blank-account');
    const evidence = await client.request('/api/academic-evidence');
    const ranking = await client.request('/api/academic/what-to-study');
    const demoPack = await client.request('/api/academic/load-demo-pack', { method: 'POST' });

    assert.deepStrictEqual(evidence.json.academic.documents, []);
    assert.deepStrictEqual(evidence.json.academic.questions, []);
    assert.deepStrictEqual(evidence.json.academic.ranking, []);
    assert.deepStrictEqual(ranking.json.whatToStudy, []);
    assert.strictEqual(demoPack.status, 409);
  });

  it('waits for three uploaded demo files before exposing curated study results', async () => {
    const client = await createClient('demo-gate');
    const upload = (title: string, docType: string) => client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title,
        docType,
        base64: Buffer.from('demo file').toString('base64'),
        fileName: title,
      },
    });

    await upload('syll2.pdf', 'Syllabus');
    await upload('Mid Sem 2025.pdf', 'Past Paper');
    let ranking = await client.request('/api/academic/what-to-study');
    let evidence = await client.request('/api/academic-evidence');
    assert.deepStrictEqual(ranking.json.whatToStudy, []);
    assert.deepStrictEqual(evidence.json.academic.questions, []);
    assert.deepStrictEqual(evidence.json.academic.ranking, []);

    await upload('Lect4.Req Eng (3).pptx', 'Lecture Slides');
    ranking = await client.request('/api/academic/what-to-study');
    evidence = await client.request('/api/academic-evidence');
    assert.strictEqual(ranking.json.whatToStudy.length, 10);
    assert.ok(evidence.json.academic.questions.length > 0);
    assert.ok(evidence.json.academic.ranking.length > 0);
  });
});
