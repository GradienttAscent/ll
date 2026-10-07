import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';
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

async function createOcrEnabledTestServer() {
  const dbDir = mkdtempSync(join(tmpdir(), 'lazylift-ocr-test-'));
  process.env.LAZYLIFT_DATA_DIR = dbDir;
  process.env.APP_PORT = '0';
  process.env.GEMINI_API_KEY = 'test-ocr-key-not-real';
  delete process.env.LAZYLIFT_PDF_GEMINI_OCR;

  // The server reads OCR configuration at module initialization. A cache-busted
  // module import ensures this isolated server sees the configured test key.
  const serverModule = await import(`../server.ts?ocr-test=${Date.now()}`);
  const { app } = await serverModule.createApp();
  const nodeServer: Server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const port = (nodeServer.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dbDir,
    setAIClientForTesting: serverModule.setAIClientForTesting,
    close: () => new Promise<void>((resolve) => nodeServer.close(() => resolve())),
  };
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
    let server: Awaited<ReturnType<typeof createOcrEnabledTestServer>>;
    let client: Api;
    const originalKey = process.env.GEMINI_API_KEY;

    before(async () => {
      server = await createOcrEnabledTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('ocr-scan@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      server.setAIClientForTesting(null);
      process.env.GEMINI_API_KEY = originalKey;
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('falls back to Gemini OCR for scanned (empty-text) PDF', async () => {
      let calls = 0;
      // OCR requires a JSON array of structured question records, not plain text.
      const mockAI = {
        models: {
          generateContent: async () => {
            calls += 1;
            return { text: JSON.stringify([
              { questionNumber: '1', text: 'Explain the working of a stack data structure.', marks: 10 },
              { questionNumber: '2', text: 'Define a queue data structure in detail.', marks: 5 },
            ]) };
          },
        },
      };
      server.setAIClientForTesting(mockAI);

      const paper = Buffer.from(emptyPdf(), 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'scanned.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.json.analysis.document.extractionMethod, 'gemini-pdf-ocr');
      assert.strictEqual(calls, 1, 'OCR mock must be invoked for an image-only PDF');
      assert.strictEqual(result.json.analysis.createdQuestionCount, 2);
    });

    it('falls back to Gemini OCR for garbled/low-quality extraction', async () => {
      let calls = 0;
      const mockAI = {
        models: {
          generateContent: async () => {
            calls += 1;
            return { text: JSON.stringify([
              { questionNumber: '1', text: 'Compare BFS and DFS graph traversals in detail.', marks: 8 },
              { questionNumber: '2', text: 'Explain Dijkstra shortest-path algorithm in detail.', marks: 12 },
            ]) };
          },
        },
      };
      server.setAIClientForTesting(mockAI);

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
      assert.strictEqual(calls, 1, 'OCR mock must be invoked for low-quality embedded text');
      assert.strictEqual(result.json.analysis.createdQuestionCount, 2);
    });

    it('recovers with locally extracted text when OCR returns 503 high demand', async () => {
      const mock503AI = {
        models: {
          generateContent: async () => {
            const err: any = new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.');
            err.code = 503;
            err.status = 'UNAVAILABLE';
            throw err;
          },
        },
      };
      server.setAIClientForTesting(mock503AI);

      const garbled = pdfWordPerLine([
        'QUESTION 1 (10 Marks): Explain the working of Dijkstra algorithm.',
        'QUESTION 2 (10 Marks): Compare BFS and DFS graph traversal.',
        'node', 'edge', 'weight', 'yes', 'pm', 'finite', 'vertex', 'arc', 'color', 'green', 'mark',
        'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
        'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi',
      ]);
      const paper = Buffer.from(garbled, 'latin1').toString('base64');
      const result = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: { title: 'recover-on-503.pdf', docType: 'Past Paper', base64: paper, mimeType: 'application/pdf' },
      });

      assert.strictEqual(result.status, 201);
      assert.strictEqual(result.json.analysis.document.extractionMethod, 'embedded-pdf-text-fallback');
      assert.ok(result.json.analysis.createdQuestionCount >= 1);
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
