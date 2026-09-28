import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';
import { setAIClientForTesting } from '../server';
import { extractionIsLowQuality } from '../pdfText';

/** Build a minimal valid PDF whose embedded text-object contains the given string. */
function pdfWithText(text: string): string {
  const stream = `BT (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  return `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
}

/** Build a PDF whose text operators emit one token per line (garbled layout). */
function pdfWordPerLine(tokens: string[]): string {
  const body = tokens.map((token) => `(${token.replace(/[()\\]/g, '\\$&')}) Tj\nTd`).join('\n');
  const stream = `BT\n${body}\nET`;
  return `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`;
}

/** A minimal PDF with no text objects at all (simulates a scanned/image-only PDF). */
function emptyPdf(): string {
  return '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF';
}

describe('PDF OCR fallback pipeline', () => {
  describe('normal text PDF succeeds without OCR', () => {
    let server: TestServer;
    let client: Api;

    before(async () => {
      server = await createTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('ocr-normal@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('extracts text-based PDF without hitting Gemini OCR', async () => {
      const paper = Buffer.from(
        pdfWithText('QUESTION 1 (12 Marks): Explain BFS traversal. QUESTION 2 (8 Marks): Describe DFS.'),
        'latin1',
      ).toString('base64');

      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'text-paper.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.json.analysis.document.extractionMethod, 'embedded-pdf-text');
      assert.ok(result.json.analysis.createdQuestionCount >= 1, `Expected at least 1 question, got ${result.json.analysis.createdQuestionCount}`);
    });
  });

  describe('scanned PDF with Gemini OCR configured', () => {
    let server: TestServer;
    let client: Api;
    const originalKey = process.env.GEMINI_API_KEY;

    before(async () => {
      // Simulate having a real API key so ENABLE_PDF_GEMINI_OCR is true.
      // NOTE: createTestServer sets GEMINI_API_KEY='MY_GEMINI_API_KEY' which intentionally
      // disables AI. We must set a non-placeholder key AND inject a mock AI client.
      process.env.GEMINI_API_KEY = 'test-ocr-key-not-real';
      server = await createTestServer();
      // Override the placeholder key set by createTestServer
      process.env.GEMINI_API_KEY = 'test-ocr-key-not-real';
      client = new Api(server.baseUrl);
      const { token } = await client.register('ocr-scan@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      setAIClientForTesting(null);
      process.env.GEMINI_API_KEY = originalKey;
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('falls back to Gemini OCR for scanned (empty-text) PDF', async () => {
      // Set up a mock AI client that returns OCR text
      const mockAI = {
        models: {
          generateContent: async () => ({
            text: 'QUESTION 1 (10 Marks): Explain the working of a stack data structure.\nQUESTION 2 (5 Marks): Define a queue.',
          }),
        },
      };
      setAIClientForTesting(mockAI);

      const paper = Buffer.from(emptyPdf(), 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'scanned.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.json.analysis.document.extractionMethod, 'gemini-pdf-ocr');
      assert.ok(result.json.analysis.createdQuestionCount >= 1);
    });

    it('falls back to Gemini OCR for garbled/low-quality extraction', async () => {
      const mockAI = {
        models: {
          generateContent: async () => ({
            text: 'QUESTION 1 (8 Marks): Compare BFS and DFS graph traversals.\nQUESTION 2 (12 Marks): Explain Dijkstra algorithm.',
          }),
        },
      };
      setAIClientForTesting(mockAI);

      const garbled = pdfWordPerLine([
        'For', 'Tarry', 'binary', 'problem', '(20', 'Marks)', 'trace', 'the', 'quick', 'brown', 'fox',
        'jumps', 'over', 'the', 'lazy', 'dog', 'in', 'a', 'binary', 'tree', 'DFS', 'search', 'graph',
        'node', 'edge', 'weight', 'yes', 'pm', 'finite', 'vertex', 'arc', 'color', 'green', 'mark',
      ]);
      const paper = Buffer.from(garbled, 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'garbled.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.json.analysis.document.extractionMethod, 'gemini-pdf-ocr');
    });
  });

  describe('OCR unavailable — controlled errors', () => {
    let server: TestServer;
    let client: Api;

    before(async () => {
      // createTestServer sets GEMINI_API_KEY='MY_GEMINI_API_KEY' which disables AI → OCR unavailable
      server = await createTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('ocr-unavail@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('returns 422 with helpful message when scanned PDF and no API key', async () => {
      const paper = Buffer.from(emptyPdf(), 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'scanned-no-key.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 422);
      assert.ok(result.json.error, 'should have error message');
      // Should mention configuring API key, not the internal flag name
      assert.match(result.json.error, /GEMINI_API_KEY/i);
    });

    it('returns 422 with helpful message when garbled PDF and no API key', async () => {
      const garbled = pdfWordPerLine([
        'For', 'Tarry', 'binary', 'problem', '(20', 'Marks)', 'trace', 'the', 'quick', 'brown', 'fox',
        'jumps', 'over', 'the', 'lazy', 'dog', 'in', 'a', 'binary', 'tree', 'DFS', 'search', 'graph',
        'node', 'edge', 'weight', 'yes', 'pm', 'finite', 'vertex', 'arc', 'color', 'green', 'mark',
      ]);
      const paper = Buffer.from(garbled, 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'garbled-no-key.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 422);
      assert.match(result.json.error, /GEMINI_API_KEY/i);
    });
  });

  describe('extractionIsLowQuality unit checks', () => {
    it('empty text is low quality', () => {
      assert.strictEqual(extractionIsLowQuality(''), true);
    });

    it('normal sentence text is not low quality', () => {
      assert.strictEqual(extractionIsLowQuality('QUESTION 1 (12 Marks): Explain BFS traversal.'), false);
    });

    it('word-per-line text is low quality', () => {
      const wordPerLine = Array.from({ length: 30 }, (_, i) => `word${i}`).join('\n');
      assert.strictEqual(extractionIsLowQuality(wordPerLine), true);
    });
  });
});
