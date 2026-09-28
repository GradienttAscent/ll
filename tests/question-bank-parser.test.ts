import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { extractNumberedQuestionRecords } from '../services';
import { classifyPaperQuestions } from '../server';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

const MARKDOWN_SUBPART_PAPER = String.raw`
3. \*\* A university plans to implement a Smart Campus Management System (SCMS) that integrates student attendance, digital ID cards, timetable scheduling, and automated fee payment modules. The system must support mobile access for students and staff. a)** As part of the Software Requirements Specification (SRS), perform a feasibility study highlighting the technical feasibility of implementing the SCMS in an educational institution. (5 Marks) ** b)** Prepare the SRS (only outline) for the proposed system, clearly describing the scope, objectives, and constraints of the Smart Campus Management System. (5 Marks) \*\*
5. ** A distributed cloud-based file storage system is being developed to allow users to upload, access, and share files across multiple locations and devices. The system includes a central coordination component responsible for managing communication between clients and services. This component handles service registration, request forwarding, and discovery of available services. The design requirements specify that the system should: * Support heterogeneous clients (desktop apps, mobile apps, and web browsers). * Allow clients to interact with remote services (such as storage, search, and indexing) without knowing their physical locations. * Enable new services (e.g., virus scanning or AI-based tagging) to be added without affecting existing clients. a)** Identify a suitable software architecture pattern for this distributed system and justify your choice based on how it meets the above design goals. (5 Marks) ** b)** Draw a labeled architecture diagram for the chosen pattern, showing the main components and their interactions. (5 Marks) ** c)** Discuss how this architecture supports the following quality attributes: * Maintainability * Scalability * Interoperability (5 Marks) ** d)** Discuss the advantages and limitations of the architecture you have selected for the distributed file storage system. (5 Marks)
`;

describe('question-bank parser', () => {
  it('splits subquestions, retains scenario context, and discards headings and separators', () => {
    const records = extractNumberedQuestionRecords(`
UNIVERSITY EXAMINATION
SECTION A
***************
QUESTION 1 (10 Marks): A hospital triage system receives patients in priority order.
a) Explain how a priority queue schedules patients. (4 Marks)
b) Compare a binary heap and a Fibonacci heap. (6 Marks)
____________________
QUESTION 2 [5]: Define a stable sorting algorithm.
END OF QUESTION PAPER
`);

    assert.deepStrictEqual(records.map((record) => ({
      number: record.questionNumber, subpart: record.subpart, text: record.text, marks: record.marks,
    })), [
      { number: '1', subpart: 'a', text: 'Explain how a priority queue schedules patients.', marks: 4 },
      { number: '1', subpart: 'b', text: 'Compare a binary heap and a Fibonacci heap.', marks: 6 },
      { number: '2', subpart: undefined, text: 'Define a stable sorting algorithm.', marks: 5 },
    ]);
    assert.strictEqual(records[0].context, 'A hospital triage system receives patients in priority order.');
    assert.strictEqual(records[1].context, 'A hospital triage system receives patients in priority order.');
    assert.ok(records.every((record) => !/[*_]{2,}|SECTION|UNIVERSITY|END OF/i.test(record.text)));
  });

  it('removes escaped markdown and bullet stars before splitting Question 3 and Question 5 subparts', async () => {
    const records = extractNumberedQuestionRecords(MARKDOWN_SUBPART_PAPER);
    const labels = records.map((record) => `${record.questionNumber}${record.subpart ? `(${record.subpart})` : ''}`);

    assert.deepStrictEqual(labels, ['3(a)', '3(b)', '5(a)', '5(b)', '5(c)', '5(d)']);
    assert.ok(records.every((record) => record.marks === 5));
    assert.ok(records.every((record) => !/[\\*]/.test(record.text)));
    assert.ok(records.every((record) => (record.text.match(/\b[a-h]\)/gi) || []).length === 0));
    assert.ok(records.filter((record) => record.questionNumber === '3').every((record) =>
      record.context?.includes('Smart Campus Management System (SCMS)')
    ));
    assert.ok(records.filter((record) => record.questionNumber === '5').every((record) =>
      record.context?.includes('Support heterogeneous clients')
    ));

    let prompt = '';
    const classification = await classifyPaperQuestions(records, {
      models: {
        generateContent: async (request: any) => {
          prompt = request.contents;
          return { text: '{"mappings":[]}' };
        },
      },
    });
    assert.strictEqual(classification.status.ok, true);
    assert.ok(['3(a)', '3(b)', '5(a)', '5(b)', '5(c)', '5(d)'].every((label) => prompt.includes(`Question ${label}:`)));
    assert.doesNotMatch(prompt, /[\\*]/);
  });

  it('returns no AI mappings after a Gemini 503 without affecting parser output', async () => {
    const questions = extractNumberedQuestionRecords('QUESTION 1 (2 Marks): Define a queue.');
    const classification = await classifyPaperQuestions(questions, {
      models: { generateContent: async () => { throw new Error('503 Service Unavailable'); } },
    });

    assert.deepStrictEqual(classification.mappings, []);
    assert.strictEqual(classification.status.ok, false);
    assert.match(classification.status.message, /503/i);
    assert.deepStrictEqual(questions.map((question) => question.text), ['Define a queue.']);
  });

  describe('Gemini fallback and syllabus mapping', () => {
    let server: TestServer;
    let client: Api;

    before(async () => {
      server = await createTestServer();
      client = new Api(server.baseUrl);
      const { token } = await client.register('question-bank-parser@example.com', 'secret123');
      client.token = token;
    });

    after(() => {
      void server.close();
      removeTempDir(server.dbDir);
    });

    it('persists deterministic records when Gemini classification is unavailable using provisional topics', async () => {
      const uploaded = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'queues.txt', docType: 'Past Paper', mimeType: 'text/plain',
          base64: Buffer.from('QUESTION 7: A scheduler serves urgent jobs first. a) Explain priority queues. (3 Marks)', 'utf8').toString('base64'),
        },
      });

      assert.strictEqual(uploaded.status, 201);
      assert.strictEqual(uploaded.json.analysis.aiStatus.ok, false);
      assert.strictEqual(uploaded.json.analysis.createdQuestionCount, 1);
      const question = uploaded.json.analysis.questions[0];
      assert.strictEqual(question.questionNumber, '7');
      assert.strictEqual(question.subpart, 'a');
      assert.strictEqual(question.context, 'A scheduler serves urgent jobs first.');
      assert.strictEqual(question.mappingStatus, 'mapped');
      assert.ok(question.topicId);
      assert.strictEqual(question.topicName, 'Priority Queues');

      const topics = await client.request('/api/topics');
      assert.deepStrictEqual(topics.json.topics.map((topic: any) => ({
        name: topic.name, source: topic.source,
      })), [{ name: 'Priority Queues', source: 'paper-derived/provisional' }]);
    });

    it('persists Question 3 and Question 5 as one clean record per subpart', async () => {
      const uploaded = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'markdown-subparts.txt', docType: 'Past Paper', mimeType: 'text/plain',
          base64: Buffer.from(MARKDOWN_SUBPART_PAPER, 'utf8').toString('base64'),
        },
      });

      assert.strictEqual(uploaded.status, 201);
      assert.strictEqual(uploaded.json.analysis.createdQuestionCount, 6);
      const questions = uploaded.json.analysis.questions;
      const labels = questions.map((question: any) => `${question.questionNumber}${question.subpart ? `(${question.subpart})` : ''}`).sort();
      assert.deepStrictEqual(labels, ['3(a)', '3(b)', '5(a)', '5(b)', '5(c)', '5(d)']);
      assert.ok(questions.every((question: any) => !/(?:\\\*\\\*|\*\*)/.test(question.questionText)));
      assert.ok(questions.every((question: any) => !/[\\*]/.test(question.questionText)));
      assert.ok(questions.every((question: any) => !/[\\*]/.test(question.context || '')));
      assert.ok(questions.every((question: any) => (question.questionText.match(/\b[a-h]\)/gi) || []).length === 0));
      assert.ok(questions.every((question: any) => question.mappingStatus === 'mapped' && question.topicId));

      const topics = await client.request('/api/topics');
      assert.ok(topics.json.topics.length > 0);
      assert.ok(topics.json.topics.every((topic: any) => topic.source === 'paper-derived/provisional'));
    });
  });
});
