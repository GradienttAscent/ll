import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

// The real upload for this regression case is the "Mid Sem 2025.pdf" (CSE312 Software
// Architecture). Its embedded text extraction produces ONE physical line, so the fixtures
// below intentionally mirror that shape (headers, page markers, decorative runs and all)
// and are run through the exact same parsing/mapping pipeline the upload uses.
const SYLLABUS = `Unit 1: Software Process Models and Risk
Unit 2: Non-Functional Requirements and Quality Metrics
Unit 3: Feasibility Study and Software Requirements Specification
Unit 4: Form-Based Requirements Specification
Unit 5: Software Architecture Patterns
Unit 6: Quality Attributes`;

const MID_SEM_2025 = `ndian nstitute of Technology Dharmalaya (IIIT Kottayam) CSE312 Software Architecture Mid Sem 2025 Maximum Marks: 50 Time: 2.30 PM - 4.00 PM Page 1/2 PTO Course Instructor: Dr. Sara Renjit Dr. Dhakshayani J. Dr. Rosebell Paul Answer all questions. 1. Suggest the most appropriate generic software process model for the project management system for a busy academic institute building an online admission portal and justify your selection. (5 Marks) a) Explain the different stages of the software process and how the risks involved with each stage can be mitigated. (5 Marks) b) Define waterfall and spiral software process models. (5 Marks) 2. While defining system quality attributes such as performance and reliability, which metrics would you use to express these non-functional requirements? (5 Marks) 3. A university is building an online course portal. The project has a high budget but poor time constraints. As part of the Software Requirements Specification (SRS), you need to do the following. a) As part of the Software Requirements Specification (SRS) for the project, list its functional and non-functional requirements. (5 Marks) b) Prepare the SRS (only outline) for the online course portal with suitable sections. (5 Marks) 4. You are gathering the requirements for an academic institution course registration portal. You believed the correct way to specify requirements is to describe the system as a set of forms and capture data to fill the forms. Using this form-based specification, describe the requirements for the complete form handling. (5 Marks) 5. A distributed reservation system serves multiple concurrent users and needs high availability and maintainability. Customers book, modify and cancel tickets through a variety of clients. a) Identify a suitable software architecture pattern for a distributed reservation system considering performance, reliability, security, and maintainability. (5 Marks) b) Draw the architecture and explain how the Transparent Replication and Fragmentations should be implemented in the above mentioned system. c) Justify whether the following quality attributes such as Maintainability, Scalability, Interoperability are relevant to the chosen architecture, and discuss the trade-offs. (5 Marks) d) Discuss the advantages and limitations of a web client using Server Side Sessions that will render web pages for students and instructors. (5 Marks) ********AII the Best******** Page 2/2`;

function questionsOf(analysis: any): Array<{ questionText: string; topicName: string | null; marks: number; mappingStatus: string; topicId: string | null }> {
  return analysis.questions;
}

function findQuestion(analysis: any, needle: RegExp) {
  const found = questionsOf(analysis).find((question) => needle.test(question.questionText));
  assert.ok(found, `expected a question matching ${needle} but got: ${JSON.stringify(questionsOf(analysis).map((q) => q.questionText))}`);
  return found;
}

const EXPECTED_MAPPINGS: Array<[RegExp, string]> = [
  [/stages of the software process/, 'Software Process Models and Risk'],
  [/Define waterfall and spiral software process models/, 'Software Process Models and Risk'],
  [/while defining system quality attributes/i, 'Non-Functional Requirements and Quality Metrics'],
  [/functional and non-functional requirements/, 'Feasibility Study and Software Requirements Specification'],
  [/Prepare the SRS/, 'Feasibility Study and Software Requirements Specification'],
  [/form-based specification/i, 'Form-Based Requirements Specification'],
  [/suitable software architecture pattern/, 'Software Architecture Patterns'],
  [/Transparent Replication and Fragmentations/, 'Software Architecture Patterns'],
  [/Maintainability, Scalability, Interoperability/, 'Quality Attributes'],
  [/Server Side Sessions/i, 'Software Architecture Patterns'],
];

const FORBIDDEN_TOPICS = new Set([
  'PM', 'While', 'For', 'Memory Management & Paging', 'Smart Campus Management System',
  'Online Shopping System', 'Maintainability Scalability Interoperability', 'PM Course Instructor',
]);

describe('Mid Sem 2025 CSE312 regression', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('mid-sem@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('maps the uploaded Mid Sem 2025 paper strictly to the syllabus topics', async () => {
    const syllabus = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: { title: 'CSE312 Software Architecture Syllabus.txt', docType: 'Syllabus', content: SYLLABUS },
    });
    assert.strictEqual(syllabus.status, 201);
    assert.strictEqual(syllabus.json.analysis.extractedTopicCount, 6);

    const uploaded = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: 'Mid Sem 2025.pdf.txt',
        docType: 'Past Paper',
        base64: Buffer.from(MID_SEM_2025, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });
    assert.strictEqual(uploaded.status, 201);
    const analysis = uploaded.json.analysis;

    // All five parent questions with their (a)(b)(c)(d) sub-parts become separate questions.
    // (Question 1's invariants a) and b) stand in for its stem, whose text is dropped.)
    assert.strictEqual(analysis.createdQuestionCount, 10, JSON.stringify(questionsOf(analysis).map((q) => q.questionText)));

    // No broad 10-mark default: every sub-part carries its own marks.
    const marks = questionsOf(analysis).map((question) => question.marks);
    assert.ok(marks.every((mark) => mark === 5), `expected all marks 5 but got ${JSON.stringify(marks)}`);

    for (const [needle, topicName] of EXPECTED_MAPPINGS) {
      const question = findQuestion(analysis, needle);
      assert.strictEqual(question.topicName, topicName, `question ${needle} mapped to ${question.topicName}`);
      assert.strictEqual(question.mappingStatus, 'mapped');
    }

    // Single-word generic overlaps and paper-derived topics must never appear.
    const topicNames = questionsOf(analysis).map((question) => question.topicName).filter(Boolean) as string[];
    for (const name of topicNames) {
      assert.ok(!FORBIDDEN_TOPICS.has(name), `forbidden topic created: ${name}`);
    }

    // Decorative runs, page markers and header leftovers must not leak into question text.
    for (const question of questionsOf(analysis)) {
      assert.doesNotMatch(question.questionText, /AII the Best|PTO|\d\/\d|PM|k\*\*/i);
    }

    // Weightage and priority are recomputed only from valid mappings.
    const ranked = analysis.ranking;
    assert.strictEqual(new Set(ranked.map((topic: any) => topic.name)).size, 6);
    assert.ok(ranked.every((topic: any) => topic.mappedQuestionCount >= 1));
    assert.strictEqual(ranked.reduce((sum: number, topic: any) => sum + topic.totalMarks, 0), 50);
    assert.ok(ranked.every((topic: any) => topic.calculatedWeightage > 0));
  });

  it('surfaces AI classification status on the upload response instead of silently returning nothing', async () => {
    const uploaded = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: 'Mid Sem 2025 status.txt',
        docType: 'Past Paper',
        base64: Buffer.from(MID_SEM_2025, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });
    assert.strictEqual(uploaded.status, 201);
    const status = uploaded.json.analysis.aiStatus;
    assert.ok(status, 'aiStatus should be present on the analysis payload');
    assert.strictEqual(status.ok, false);
    assert.ok(status.message.length > 0);
    assert.strictEqual(typeof status.model, 'string');
  });
});

describe('sub-part splitting and strict matching', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('subpart@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('splits sub-parts with their own marks and never maps generic-only overlaps', async () => {
    const syllabus = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'OS syllabus.txt',
        docType: 'Syllabus',
        content: 'Unit 1: Demand Paging and Page Faults\nUnit 2: Deadlock Prevention',
      },
    });
    assert.strictEqual(syllabus.status, 201);
    assert.strictEqual(syllabus.json.analysis.extractedTopicCount, 2);

    const paper = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'OS mid sem.txt',
        docType: 'Past Paper',
        content: '1. What is Demand Paging? a) Define page fault. (3 Marks) b) Compare paging with segmentation. (2 Marks)\n2. Describe deadlock prevention strategies. (4 Marks)\n3. Explain management of the system process. (5 Marks)',
      },
    });
    assert.strictEqual(paper.status, 201);
    const analysis = paper.json.analysis;
    const questions = questionsOf(analysis);

    assert.strictEqual(questions.length, 4, JSON.stringify(questions.map((q) => q.questionText)));
    const marksBySubstring: Array<[RegExp, number]> = [
      [/Define page fault/, 3],
      [/Compare paging with segmentation/, 2],
      [/Describe deadlock prevention strategies/, 4],
      [/Explain management of the system process/, 5],
    ];
    for (const [needle, expectedMarks] of marksBySubstring) {
      const question = findQuestion(analysis, needle);
      assert.strictEqual(question.marks, expectedMarks, `${needle} marks`);
    }

    const paging = findQuestion(analysis, /Define page fault/);
    assert.strictEqual(paging.topicName, 'Demand Paging and Page Faults');
    assert.ok(paging.mappingStatus === 'mapped');
    const segmentation = findQuestion(analysis, /Compare paging with segmentation/);
    assert.strictEqual(segmentation.topicName, 'Demand Paging and Page Faults');
    const deadlock = findQuestion(analysis, /Describe deadlock prevention strategies/);
    assert.strictEqual(deadlock.topicName, 'Deadlock Prevention');

    // On "management", "system" and "process" alone no mapping is invented: UNMATCHED wins.
    const genericOnly = findQuestion(analysis, /Explain management of the system process/);
    assert.strictEqual(genericOnly.mappingStatus, 'unmatched');
    assert.strictEqual(genericOnly.topicId, null);
  });
});