import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

const fixtureDir = join(process.cwd(), 'fixtures', 'demo', 'set2');
const files = [
  ['Software_Architecture_Syllabus (1).pdf', 'Syllabus'],
  ['Repeat Examination  Jan 2023-  CSE312 Software Engineering and Project Management (1).pdf', 'Past Paper'],
  ['Requirements Engineering - Part 1.pptx', 'Lecture Slides'],
  ['Requirements Engineering  - Part 2 (1).pptx', 'Lecture Slides'],
  ['Requirements Engineering – Part3.pptx', 'Lecture Slides'],
  ['Requirements Engineering – Part 4.pptx', 'Lecture Slides'],
] as const;

let server: TestServer;

async function client(prefix: string) {
  const api = new Api(server.baseUrl);
  const { token } = await api.register(`${prefix}-${Date.now()}@example.com`, 'secret123');
  api.token = token;
  return api;
}

function upload(api: Api, name: string, docType: string, title = `renamed-${Math.random()}`) {
  return api.request('/api/academic-documents/upload', {
    method: 'POST',
    body: { title, fileName: title, docType, base64: readFileSync(join(fixtureDir, name)).toString('base64') },
  });
}

describe('hash-verified CSE312 2023 course pack', () => {
  before(async () => { server = await createTestServer(); });
  after(async () => { await server.close(); removeTempDir(server.dbDir); });

  it('keeps partial set 2 uploads isolated, completes after all six files, and preserves exact navigation', async () => {
    const api = await client('set2');
    for (const [name, docType] of files.slice(0, 5)) {
      const result = await upload(api, name, docType);
      assert.strictEqual(result.status, 201);
      assert.match(result.json.analysis.extractionMethod, /precomputed-demo-adapter:set2/);
    }
    assert.deepStrictEqual((await api.request('/api/academic/what-to-study')).json.whatToStudy, []);

    const last = await upload(api, files[5][0], files[5][1]);
    assert.strictEqual(last.status, 201);
    const evidence = await api.request('/api/academic-evidence');
    assert.strictEqual(evidence.json.academic.questions.length, 19);
    assert.strictEqual(evidence.json.academic.questions.reduce((sum: number, q: any) => sum + q.marks, 0), 100);

    const ranking = (await api.request('/api/academic/what-to-study')).json.whatToStudy;
    assert.strictEqual(ranking.length, 6);
    const requirements = ranking.find((item: any) => item.conceptTitle === 'Requirements Specification');
    assert.strictEqual(requirements.lectureSource.exactSlide, 15);
    assert.ok(requirements.lectureSource.documentId);
    assert.strictEqual((await api.request(`/api/documents/${requirements.lectureSource.documentId}/slides/15/image`)).status, 200);
    assert.ok(ranking.filter((item: any) => item.conceptTitle !== 'Requirements Specification').every((item: any) => !item.lectureSource.mapped));

    const duplicate = await upload(api, files[4][0], files[4][1]);
    assert.strictEqual(duplicate.status, 201);
    assert.strictEqual((await api.request('/api/academic-evidence')).json.academic.questions.length, 19);

    const ordinary = await api.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2026 Additional Exam.txt', fileName: '2026 Additional Exam.txt', docType: 'Past Paper',
        base64: Buffer.from('QUESTION 1 (5 Marks): Explain boundary value analysis.').toString('base64'),
        mimeType: 'text/plain',
      },
    });
    assert.strictEqual(ordinary.status, 201);
    assert.strictEqual(ordinary.json.analysis.processing.indexedQuestionCount, 1);
    const mixedEvidence = await api.request('/api/academic-evidence');
    assert.strictEqual(mixedEvidence.json.academic.questions.length, 20);
    const mixedRanking = await api.request('/api/academic/what-to-study');
    assert.ok(mixedRanking.json.whatToStudy.some((item: any) => item.occurrences.some((occ: any) => /boundary value analysis/i.test(occ.questionText))));
  });

  it('does not treat a filename match without the fixture bytes as a predefined document', async () => {
    const api = await client('set2-custom');
    const result = await api.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: files[1][0],
        fileName: files[1][0],
        docType: 'Past Paper',
        base64: Buffer.from('1. Explain breadth first search. (5 marks)').toString('base64'),
        mimeType: 'text/plain',
      },
    });
    assert.strictEqual(result.status, 201);
    assert.doesNotMatch(result.json.analysis.extractionMethod, /precomputed-demo-adapter/);
  });
});
