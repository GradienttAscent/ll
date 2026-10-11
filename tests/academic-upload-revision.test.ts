import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

function encodedQuestions(...questions: string[]) {
  return Buffer.from(JSON.stringify(questions.map((text, index) => ({
    questionNumber: String(index + 1),
    text,
    marks: 5,
    pageNumber: 1,
  })))).toString('base64');
}

describe('academic upload revision pipeline', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('academic-revision@example.com', 'secret123');
    client.token = token;
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('preserves prior evidence while indexing three new uploads exactly once and refreshing rankings', async () => {
    const prior = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2023 Prior Exam.txt', docType: 'Past Paper', mimeType: 'text/plain',
        base64: encodedQuestions('Explain binary search tree insertion.'),
      },
    });
    assert.strictEqual(prior.status, 201);
    assert.strictEqual(prior.json.analysis.processing.status, 'questions-indexed');
    assert.strictEqual(prior.json.analysis.processing.indexedQuestionCount, 1);

    const before = await client.request('/api/academic-evidence');
    assert.strictEqual(before.json.academic.questions.length, 1);
    await client.request('/api/academic/what-to-study');

    const [examOne, slides, examTwo] = await Promise.all([
      client.request('/api/academic-documents/upload', {
        method: 'POST', body: {
          title: '2024 Graph Exam.txt', docType: 'Past Paper', mimeType: 'text/plain',
          base64: encodedQuestions('Explain Dijkstra shortest path algorithm.'),
        },
      }),
      client.request('/api/academic-documents/upload', {
        method: 'POST', body: {
          title: 'Graph Lecture Slides.txt', docType: 'Lecture Slides', mimeType: 'text/plain',
          base64: Buffer.from('Slide 1: Graph traversal\nBreadth first and depth first traversal.').toString('base64'),
        },
      }),
      client.request('/api/academic-documents/upload', {
        method: 'POST', body: {
          title: '2025 Graph Exam.txt', docType: 'Past Paper', mimeType: 'text/plain',
          base64: encodedQuestions('Compare depth first search and breadth first search.', 'Explain minimum spanning tree construction.'),
        },
      }),
    ]);

    for (const upload of [examOne, slides, examTwo]) assert.strictEqual(upload.status, 201);
    assert.deepStrictEqual(
      [examOne, slides, examTwo].map((upload) => upload.json.analysis.processing.status),
      ['questions-indexed', 'non-exam-material', 'questions-indexed'],
    );
    assert.deepStrictEqual(
      [examOne, slides, examTwo].map((upload) => upload.json.analysis.processing.indexedQuestionCount),
      [1, 0, 2],
    );
    assert.ok(examOne.json.analysis.processing.cacheInvalidated);
    assert.ok(examTwo.json.analysis.processing.cacheInvalidated);

    const after = await client.request('/api/academic-evidence');
    assert.strictEqual(after.json.academic.documents.length, 4);
    assert.strictEqual(after.json.academic.questions.length, 4);
    assert.ok(after.json.academic.questions.some((question: any) => /binary search tree/i.test(question.questionText)));
    assert.ok(after.json.academic.questions.some((question: any) => /dijkstra/i.test(question.questionText)));
    assert.ok(after.json.academic.questions.some((question: any) => /minimum spanning tree/i.test(question.questionText)));

    const ranking = await client.request('/api/academic/what-to-study');
    assert.strictEqual(ranking.status, 200);
    const rankingQuestions = ranking.json.whatToStudy.flatMap((item: any) => item.occurrences.map((occurrence: any) => occurrence.questionText));
    assert.ok(rankingQuestions.some((text: string) => /binary search tree/i.test(text)));
    assert.ok(rankingQuestions.some((text: string) => /dijkstra/i.test(text)));

    const duplicate = await client.request('/api/academic-documents/upload', {
      method: 'POST', body: {
        title: '2024 Graph Exam.txt', docType: 'Past Paper', mimeType: 'text/plain',
        base64: encodedQuestions('Explain Dijkstra shortest path algorithm.'),
      },
    });
    assert.strictEqual(duplicate.status, 201);
    assert.strictEqual(duplicate.json.analysis.processing.status, 'duplicate-questions');
    assert.strictEqual(duplicate.json.analysis.processing.indexedQuestionCount, 0);
    assert.strictEqual(duplicate.json.analysis.processing.duplicateQuestionCount, 1);

    const reloaded = await client.request('/api/academic-evidence');
    assert.strictEqual(reloaded.json.academic.questions.length, 4);
  });
});
