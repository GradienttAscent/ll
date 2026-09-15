import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

function pdfWithText(text: string): string {
  const stream = `BT (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  return `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
}

describe('real academic PDF ingestion', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('pdf-upload@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('extracts and persists actual PDF questions, marks, topics, and evidence', async () => {
    const paper = Buffer.from(pdfWithText('QUESTION 1 (12 Marks): Explain BFS traversal. QUESTION 2 (8 Marks): Explain BFS traversal.'), 'latin1').toString('base64');
    const uploaded = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: { title: 'real-paper.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
    });

    assert.strictEqual(uploaded.status, 201);
    assert.strictEqual(uploaded.json.analysis.createdQuestionCount, 1);
    assert.strictEqual(uploaded.json.analysis.questions[0].marks, 12);
    assert.match(uploaded.json.analysis.questions[0].questionText, /Explain BFS traversal/);
    assert.strictEqual(uploaded.json.analysis.document.extractionMethod, 'embedded-pdf-text');

    const evidence = await client.request('/api/academic-evidence');
    assert.strictEqual(evidence.json.academic.questions.length, 1);
    assert.strictEqual(evidence.json.academic.questions[0].marks, 12);
    assert.ok(evidence.json.academic.ranking.some((topic: any) => topic.mappedQuestionCount === 1));

    const document = await client.request(`/api/documents/${uploaded.json.analysis.document.id}`);
    assert.strictEqual(document.json.document.mimeType, 'application/pdf');
    assert.strictEqual(document.json.document.extractionMethod, 'embedded-pdf-text');
  });
});
