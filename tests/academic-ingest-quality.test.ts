import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { extractionIsLowQuality } from '../pdfText';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

function pdfWithText(text: string): string {
  const stream = `BT (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  return `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
}

function pdfWordPerLine(tokens: string[]): string {
  const body = tokens.map((token) => `(${token.replace(/[()\\]/g, '\\$&')}) Tj\nTd`).join('\n');
  const stream = `BT\n${body}\nET`;
  return `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
}

describe('academic ingestion quality guards', () => {
  describe('extractionIsLowQuality', () => {
    it('flags word-per-line extractions', () => {
      const wordPerLine = ['For', 'binary', 'problem', 'The', 'quick', 'brown', 'fox', 'jumps', 'over',
        'the', 'lazy', 'dog', 'in', 'a', 'binary', 'tree', 'DFS', 'search', 'graph', 'node', 'edge',
        'weight', 'yes', 'pm', 'finite', 'vertex', 'arc', 'color', 'green', 'mark'].join('\n');
      assert.strictEqual(extractionIsLowQuality(wordPerLine), true);
    });

    it('flags long runs of text with no sentence terminators', () => {
      // Multi-line but unreadable: no sentence-ending punctuation anywhere in the document.
      const soup = Array.from({ length: 80 }, (_unused, index) => `alpha beta gamma${index}`).join('\n');
      assert.ok(soup.length > 1200);
      assert.strictEqual(extractionIsLowQuality(soup), true);
    });

    it('does not flag a single-line well-formed paper', () => {
      assert.strictEqual(extractionIsLowQuality('QUESTION 1 (12 Marks): Explain BFS traversal. QUESTION 2 (8 Marks): Describe DFS traversal.'), false);
    });

    it('does not flag short fragments or empty text thresholds', () => {
      assert.strictEqual(extractionIsLowQuality('Define page fault.'), false);
      assert.strictEqual(extractionIsLowQuality(''), true);
    });
  });

  describe('malformed diagram-label text via the analyze endpoint', () => {
    let server: TestServer;
    let client: Api;

    before(async () => {
      server = await createTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('ingest-quality@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('keeps isolated letter fragments from becoming phantom sub-parts or junk topics', async () => {
      // A real-world extracted paper whose last question region embeds graph-diagram labels:
      // "(s)", "(visit v)", "v-w)", "w)", "O(V + E)". Previously these became phantom
      // sub-part questions split out of the prose, each inventing junk topics.
      const content = [
        '1. Define binary tree and its properties. (2 Marks)',
        '2. Explain DFS traversal using an adjacency list. (3 Marks)',
        '3. Design an efficient algorithm to find minimum spanning tree using Kruskal. (5 Marks)',
        '4. Compare BFS and DFS traversals. (4 Marks)',
        '5. Trace the Kruskal traversal the vertex',
        'w) OK proceed (visit v) mark y if there is a white arc v-W color w-V green and evaluate y O(V + E) (6 Marks)',
      ].join('\n');

      const analyzed = await client.request('/api/academic-documents/analyze', {
        method: 'POST',
        body: { title: 'dsa past paper', docType: 'Past Paper', content },
      });

      assert.strictEqual(analyzed.status, 201);
      assert.strictEqual(analyzed.json.analysis.createdQuestionCount, 5);
      const questions: Array<{ questionText: string; marks: number }> = analyzed.json.analysis.questions;
      for (const question of questions) {
        // Phantom isolates ("v)", "w)", "(s)", "E)") must never surface as their own question.
        assert.ok(question.questionText.length > 28, `question too short: ${question.questionText}`);
        assert.ok(question.marks > 0);
      }
      const topics: Array<{ name: string; source: string }> = analyzed.json.analysis.ranking;
      const names = topics.map((topic) => topic.name.toLowerCase());
      for (const junk of ['v', 'w', 'e', 's', 'tarry', 'yes', 'pm', 'roll no', 'rectarry']) {
        assert.ok(!names.includes(junk), `junk topic persisted: ${junk}`);
      }
      // Valid PYQs produce canonical provisional topics, but diagram tokens never do.
      assert.ok(names.length > 0);
      assert.ok(topics.every((topic) => topic.source === 'paper-derived/provisional'));
    });
  });

  describe('word-per-line PDF upload', () => {
    let server: TestServer;
    let client: Api;

    before(async () => {
      server = await createTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('pdf-garbled@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('rejects garbled PDFs instead of fabricating phantom questions', async () => {
      const garbage = Buffer.from(pdfWordPerLine([
        'For', 'Tarry', 'binary', 'problem', '(20', 'Marks)', 'trace', 'the', 'quick', 'brown', 'fox',
        'jumps', 'over', 'the', 'lazy', 'dog', 'in', 'a', 'binary', 'tree', 'DFS', 'search', 'graph',
        'node', 'edge', 'weight', 'yes', 'pm', 'finite', 'vertex', 'arc', 'color', 'green', 'mark',
      ]), 'latin1').toString('base64');

      const uploaded = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'garbled.pdf', docType: 'Past Paper', base64: garbage, mimeType: 'application/pdf' },
      });

      assert.strictEqual(uploaded.status, 422);

      const evidence = await client.request('/api/academic-evidence');
      assert.deepStrictEqual(evidence.json.academic.documents, []);
      assert.deepStrictEqual(evidence.json.academic.questions, []);
      assert.deepStrictEqual(evidence.json.academic.ranking, []);
    });

    it('still accepts a clean single-line text PDF', async () => {
      const paper = Buffer.from(pdfWithText('QUESTION 1 (12 Marks): Explain BFS traversal. QUESTION 2 (8 Marks): Explain BFS traversal.'), 'latin1').toString('base64');
      const uploaded = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'clean.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });
      assert.strictEqual(uploaded.status, 201);
      assert.strictEqual(uploaded.json.analysis.document.extractionMethod, 'embedded-pdf-text');
      assert.strictEqual(uploaded.json.analysis.createdQuestionCount, 2);
    });
  });
});
