import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { extractPdfPages, extractPdfText } from '../pdfText';
import { extractStructuredDocument } from '../structuredParser';
import { extractNumberedQuestionRecords, normalizeDomain } from '../services';
import { createTestServer, Api, removeTempDir, TestServer } from './helpers';

describe('Structured Document Intelligence & Page Traceability', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('struct-test@example.com', 'secret123');
    client.token = token;
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('preserves physical page boundaries from form feeds in PDF extractions', () => {
    // Multi-page document mock separated by form-feeds
    const content = `QUESTION 1 (10 Marks): Explain relational algebra.\fQUESTION 2 (10 Marks): Define ACID properties in database systems.`;
    const questions = extractNumberedQuestionRecords(content);

    assert.strictEqual(questions.length, 2);
    assert.strictEqual(questions[0].pageNumber, 1);
    assert.strictEqual(questions[1].pageNumber, 2);
  });

  it('clusters arbitrary university exam questions across different papers deterministically', async () => {
    // Ingest exam 2023 with question on B-Trees
    await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: '2023 Database Systems Exam',
        docType: 'Past Paper',
        content: `QUESTION 1 (10 Marks): Explain B-Tree indexing and search operations with an example.\nQUESTION 2 (5 Marks): Define primary key.`,
      },
    });

    // Ingest exam 2024 with similar B-Tree question with different phrasing
    await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: '2024 Database Systems Exam',
        docType: 'Past Paper',
        content: `QUESTION 4 (12 Marks): What is B-Tree indexing? Discuss search operations and structure.\nQUESTION 5 (8 Marks): Explain normalization forms.`,
      },
    });

    const res = await client.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 200);
    const items = res.json.whatToStudy;

    // Find the clustered B-Tree item
    const btreeCluster = items.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('tree') ||
      item.occurrences.some((o: any) => o.questionText.toLowerCase().includes('b-tree'))
    );

    assert.ok(btreeCluster, 'Expected B-Tree questions from 2023 and 2024 to cluster together');
    assert.strictEqual(btreeCluster.occurrences.length, 2, 'Should combine 2023 and 2024 questions');
    assert.ok(btreeCluster.distinctYearsCount >= 2, 'Should record appearances across 2 distinct years');
  });

  it('serves structured pages via /api/documents/:id/pages', async () => {
    const uploadRes = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Lecture Slides Chapter 1',
        docType: 'Lecture Slides',
        content: `Slide 1: Introduction\nWelcome to Database Systems.\n\fSlide 2: Relational Model\nTables, tuples, and attributes.\n\fSlide 3: Keys\nPrimary keys and foreign keys.`,
      },
    });

    assert.strictEqual(uploadRes.status, 201);
    const docId = uploadRes.json.analysis.document.id;

    const pagesRes = await client.request(`/api/documents/${docId}/pages`);
    assert.strictEqual(pagesRes.status, 200);
    assert.ok(Array.isArray(pagesRes.json.pages));
    assert.strictEqual(pagesRes.json.pages.length, 3);
    assert.strictEqual(pagesRes.json.pages[0].pageNumber, 1);
    assert.strictEqual(pagesRes.json.pages[1].pageNumber, 2);
    assert.strictEqual(pagesRes.json.pages[2].pageNumber, 3);

    const singlePageRes = await client.request(`/api/documents/${docId}/pages/2`);
    assert.strictEqual(singlePageRes.status, 200);
    assert.strictEqual(singlePageRes.json.page.pageNumber, 2);
    assert.ok(singlePageRes.json.page.text.includes('Relational Model'));
  });

  it('supports batch academic document upload via /api/academic-documents/upload-batch', async () => {
    const file1Base64 = Buffer.from('QUESTION 1 (10 Marks): Explain 1NF and 2NF normalization.').toString('base64');
    const file2Base64 = Buffer.from('QUESTION 1 (10 Marks): Explain Boyce-Codd Normal Form (BCNF).').toString('base64');

    const batchRes = await client.request('/api/academic-documents/upload-batch', {
      method: 'POST',
      body: {
        documents: [
          {
            title: 'Normalization Paper 1.txt',
            docType: 'Past Paper',
            base64: file1Base64,
            mimeType: 'text/plain',
          },
          {
            title: 'Normalization Paper 2.txt',
            docType: 'Past Paper',
            base64: file2Base64,
            mimeType: 'text/plain',
          },
        ],
      },
    });

    assert.strictEqual(batchRes.status, 201);
    assert.strictEqual(batchRes.json.results.length, 2);
    assert.strictEqual(batchRes.json.totalQuestionCount, 2);
  });
});
