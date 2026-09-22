import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('syllabus visibility and deterministic concept mapping', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('concept-test@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('Fix 1 regression: keeps persisted syllabus topics in ranking when a past paper has 0 mapped questions', async () => {
    // 1. Upload syllabus that produces persisted syllabus topics
    const syllabusRes = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Algorithms Syllabus.txt',
        docType: 'Syllabus',
        content: 'Unit 1: Graph Algorithms\nUnit 2: Dynamic Programming\nUnit 3: Divide and Conquer',
      },
    });
    assert.strictEqual(syllabusRes.status, 201);
    assert.strictEqual(syllabusRes.json.analysis.extractedTopicCount, 3);

    // 2. Upload past paper whose questions are currently completely unmatched
    const paperRes = await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Physics Midterm 2025.txt',
        docType: 'Past Paper',
        content: 'QUESTION 1 (10 Marks): Explain the quantum mechanical spin of electrons.\nQUESTION 2 (10 Marks): Discuss thermodynamic entropy in closed systems.',
      },
    });
    assert.strictEqual(paperRes.status, 201);
    assert.strictEqual(paperRes.json.analysis.createdQuestionCount, 2);

    // 3. academicEvidence() with default past paper selected must still return persisted syllabus topics in ranking
    const evidence = await client.request('/api/academic-evidence');
    assert.strictEqual(evidence.status, 200);

    const questions = evidence.json.academic.questions;
    assert.strictEqual(questions.length, 2);
    // Questions are genuinely unmatched
    assert.ok(questions.every((q: any) => q.mappingStatus === 'unmatched' && q.topicId === null));

    // The ranking MUST contain the persisted syllabus topics rather than being an empty list
    const ranking = evidence.json.academic.ranking;
    assert.ok(ranking.length >= 3, 'ranking should retain persisted syllabus topics');
    const topicNames = ranking.map((t: any) => t.name).sort();
    assert.ok(topicNames.includes('Graph Algorithms'));
    assert.ok(topicNames.includes('Dynamic Programming'));
    assert.ok(topicNames.includes('Divide and Conquer'));

    // Document-specific statistics should reflect 0 mapped questions from this past paper
    const graphTopic = ranking.find((t: any) => t.name === 'Graph Algorithms');
    assert.strictEqual(graphTopic.mappedQuestionCount, 0);
    assert.strictEqual(graphTopic.totalMarks, 0);
    assert.strictEqual(graphTopic.calculatedWeightage, 0);
    assert.strictEqual(graphTopic.syllabusEvidence, true);
    assert.strictEqual(graphTopic.reason, 'Lower priority: present in the syllabus but no previous questions were mapped.');

    // The UI would therefore receive topics.length > 0 and NOT display "No syllabus topics yet"
    assert.ok(ranking.length > 0, 'UI displays syllabus topics and avoids "No syllabus topics yet" empty state');
  });

  it('Fix 2: deterministically maps the exact three common CS questions with Gemini disabled', async () => {
    // Register a fresh student for clean topic isolation
    const student = new Api(server.baseUrl);
    const { token } = await student.register('student-cs@example.com', 'secret123');
    student.token = token;

    // 1. Upload syllabus with standard CS topics
    const syllabusRes = await student.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Design and Analysis of Algorithms Syllabus.txt',
        docType: 'Syllabus',
        content: 'Module 1: Graph Algorithms\nModule 2: Dynamic Programming\nModule 3: Divide and Conquer\nModule 4: Sorting and Searching',
      },
    });
    assert.strictEqual(syllabusRes.status, 201);
    assert.strictEqual(syllabusRes.json.analysis.extractedTopicCount, 4);

    // 2. Upload past paper containing the exact three questions required
    const paperRes = await student.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'CS301 Algorithms Past Paper.txt',
        docType: 'Past Paper',
        content: `QUESTION 1 (15 Marks): Explain Dijkstra's shortest path algorithm. Compare time complexity of Binary Heap vs Fibonacci Heap.
QUESTION 2 (15 Marks): Solve Knapsack problem using Dynamic Programming memoization. Weights: [2,3,4], Values: [3,4,5], W=5
QUESTION 3 (10 Marks): Apply Master Theorem to recurrences T(n) = 3T(n/2) + n`,
      },
    });

    assert.strictEqual(paperRes.status, 201);
    assert.strictEqual(paperRes.json.analysis.createdQuestionCount, 3);

    const evidence = await student.request('/api/academic-evidence');
    assert.strictEqual(evidence.status, 200);
    const questions = evidence.json.academic.questions;

    // Exact Question 1:
    const q1 = questions.find((q: any) => q.questionText.includes("Dijkstra's shortest path algorithm"));
    assert.ok(q1, 'Question 1 should be found');
    assert.strictEqual(q1.mappingStatus, 'mapped');
    assert.strictEqual(q1.topicName, 'Graph Algorithms');
    assert.ok(q1.mappingEvidence.some((e: string) => e.includes('Dijkstra') || e.includes('shortest path')));

    // Exact Question 2:
    const q2 = questions.find((q: any) => q.questionText.includes('Knapsack problem using Dynamic Programming memoization'));
    assert.ok(q2, 'Question 2 should be found');
    assert.strictEqual(q2.mappingStatus, 'mapped');
    assert.strictEqual(q2.topicName, 'Dynamic Programming');
    assert.ok(q2.mappingEvidence.some((e: string) => e.includes('Knapsack') || e.includes('memoization')));

    // Exact Question 3:
    const q3 = questions.find((q: any) => q.questionText.includes('Apply Master Theorem to recurrences'));
    assert.ok(q3, 'Question 3 should be found');
    assert.strictEqual(q3.mappingStatus, 'mapped');
    assert.strictEqual(q3.topicName, 'Divide and Conquer');
    assert.ok(q3.mappingEvidence.some((e: string) => e.includes('Master Theorem') || e.includes('recurrence')));
  });

  it('Fix 2 variation: maps Master Theorem question to "Recurrence Relations" when that is the persisted syllabus topic', async () => {
    const student = new Api(server.baseUrl);
    const { token } = await student.register('student-recurrence@example.com', 'secret123');
    student.token = token;

    // Syllabus has "Recurrence Relations"
    const syllabusRes = await student.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Discrete Math Syllabus.txt',
        docType: 'Syllabus',
        content: 'Unit 1: Recurrence Relations\nUnit 2: Graph Theory',
      },
    });
    assert.strictEqual(syllabusRes.status, 201);

    const paperRes = await student.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Math Paper.txt',
        docType: 'Past Paper',
        content: 'QUESTION 1 (10 Marks): Apply Master Theorem to recurrences T(n) = 3T(n/2) + n',
      },
    });
    assert.strictEqual(paperRes.status, 201);

    const evidence = await student.request('/api/academic-evidence');
    const q = evidence.json.academic.questions.find((item: any) => item.questionText.includes('Apply Master Theorem to recurrences'));
    assert.ok(q, 'Question should be found');
    assert.strictEqual(q.mappingStatus, 'mapped');
    assert.strictEqual(q.topicName, 'Recurrence Relations');
    assert.ok(q.mappingEvidence.some((e: string) => e.includes('Master Theorem') || e.includes('recurrence')));
  });
});
