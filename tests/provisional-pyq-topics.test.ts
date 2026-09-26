import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

const PYQ_WITH_HTML_AND_CONTEXT = [
  '1. Explain&amp;nbsp;the <span class="question" style="font-weight: bold">waterfall</span> and spiral software process models. (5 Marks)',
  '2. Explain non-functional requirements for performance and reliability. (5 Marks)',
  '3. Discuss quality attributes such as scalability and maintainability. (5 Marks)',
  '4. A distributed reservation system needs high availability and reliable clients. a) Draw a suitable software architecture pattern. (5 Marks) b) Explain transparent replication for the above system. (5 Marks)',
  '&lt;footer&gt;All the Best&lt;/footer&gt;',
].join('\n');

describe('provisional PYQ-derived topics', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('provisional-topics@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('maps a syllabus-free paper to canonical provisional topics and sanitizes persisted text', async () => {
    const response = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: { title: 'Software engineering PYQ.txt', docType: 'Past Paper', content: PYQ_WITH_HTML_AND_CONTEXT },
    });
    assert.strictEqual(response.status, 201);
    const analysis = response.json.analysis;
    assert.strictEqual(analysis.createdQuestionCount, 5);
    assert.ok(analysis.questions.every((question: any) => question.topicName && question.topicName !== 'Unmapped'));
    assert.ok(analysis.ranking.length > 0);
    assert.ok(analysis.ranking.every((topic: any) => topic.source === 'paper-derived/provisional'));

    const nonFunctional = analysis.questions.filter((question: any) => question.topicName === 'Non-Functional Requirements');
    assert.strictEqual(nonFunctional.length, 2, 'equivalent quality-attribute questions share one canonical topic');
    assert.strictEqual(new Set(nonFunctional.map((question: any) => question.topicId)).size, 1);

    const replication = analysis.questions.find((question: any) => /transparent replication/i.test(question.questionText));
    assert.ok(replication);
    assert.strictEqual(replication.topicName, 'Software Architecture');
    assert.match(replication.context, /distributed reservation system/i);

    for (const question of analysis.questions) {
      assert.doesNotMatch(question.questionText, /&nbsp;|<[^>]+>|(?:class|style)\s*=|all the best|\s{2,}/i);
      assert.doesNotMatch(question.context || '', /&nbsp;|<[^>]+>|(?:class|style)\s*=|all the best|\s{2,}/i);
    }
  });

  it('reconciles provisional mappings to authoritative syllabus topics when a syllabus is uploaded later', async () => {
    const syllabus = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Software engineering syllabus.txt',
        docType: 'Syllabus',
        content: 'Unit 1: Software Process Models\nUnit 2: Non-Functional Requirements\nUnit 3: Software Architecture Patterns',
      },
    });
    assert.strictEqual(syllabus.status, 201);

    const evidence = await client.request('/api/academic-evidence');
    assert.strictEqual(evidence.status, 200);
    const questions = evidence.json.academic.questions;
    assert.ok(questions.every((question: any) => question.topicName && question.mappingStatus === 'mapped'));
    assert.ok(questions.every((question: any) => !evidence.json.academic.ranking.find((topic: any) =>
      topic.id === question.topicId && topic.source === 'paper-derived/provisional')));
    assert.ok(evidence.json.academic.ranking.every((topic: any) => topic.source === 'syllabus'));
    assert.ok(questions.some((question: any) => /transparent replication/i.test(question.questionText) &&
      question.topicName === 'Software Architecture Patterns'));
  });
});
