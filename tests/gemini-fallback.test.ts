import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';
import * as fallbackAi from '../fallbackAi';
import { setAIClientForTesting } from '../server';

describe('Gemini fallback unit functions', () => {
  it('evaluates answers deterministically with meaningful rubric scores', () => {
    const empty = fallbackAi.generateFallbackEvaluation('Explain Dijkstra algorithm for single source shortest paths.', '', 10);
    assert.strictEqual(empty.score, 0);
    assert.strictEqual(empty.maxMarks, 10);
    assert.ok(empty.improvements.length > 0);
    assert.match(empty.feedbackText, /no answer was submitted/i);
    assert.ok(empty.modelAnswerSnippet.length > 20);

    const good = fallbackAi.generateFallbackEvaluation(
      'Explain Dijkstra algorithm for single source shortest paths.',
      `Dijkstra's algorithm finds the shortest path from a single source vertex to all other vertices in a weighted graph with non-negative edge weights.
It uses a priority queue (min-heap) to greedily select the vertex with the minimum tentative distance.
1. Initialize distances to infinity, source distance to 0.
2. Extract the minimum distance vertex from the priority queue.
3. Relax all adjacent outgoing edges: if dist[u] + weight(u, v) < dist[v], update dist[v].
4. Repeat until all reachable vertices are visited.
Time complexity is O((V + E) log V) using a binary heap, and space complexity is O(V).`,
      10
    );

    assert.ok(good.score >= 7, `Expected good score >= 7, got ${good.score}`);
    assert.strictEqual(good.maxMarks, 10);
    assert.ok(good.strengths.length > 0);
    assert.ok(good.improvements.length > 0);
    assert.match(good.feedbackText, /thorough mastery|good response/i);
  });

  it('generates tutoring concept hints without solving outright', () => {
    const hint = fallbackAi.generateFallbackHint('Explain the difference between Prim and Kruskal MST algorithms.', 6);
    assert.ok(hint.hint.includes('•'));
    assert.ok(hint.hint.length > 40);
    assert.match(hint.hint, /criteria|trade-off|boundary/i);
  });

  it('grades mock exam sheets question-by-question with topic breakdowns', () => {
    const report = fallbackAi.generateFallbackMockExamReport([
      {
        questionText: 'What is a binary search tree?',
        topicName: 'Trees',
        marks: 5,
        answer: 'A binary tree where left child < root < right child. Inorder traversal gives sorted order.',
      },
      {
        questionText: 'Explain Dijkstra algorithm.',
        topicName: 'Graphs',
        marks: 10,
        answer: '',
      },
    ]);

    assert.strictEqual(report.perQuestion.length, 2);
    assert.ok(report.perQuestion[0].score > 0);
    assert.strictEqual(report.perQuestion[1].score, 0);
    assert.strictEqual(report.topicBreakdown.length, 2);
    assert.ok(report.overall.advice.length > 20);
  });

  it('extracts topics and questions from academic text in fallback mode', () => {
    const text = `Unit 1: Graph Theory and Shortest Paths (30%)
Dijkstra algorithm, Bellman-Ford, Floyd-Warshall
Unit 2: Dynamic Programming (40%)
0/1 Knapsack, Longest Common Subsequence, Matrix Chain Multiplication
QUESTION 1 (5 Marks): Explain Bellman-Ford algorithm.
QUESTION 2 (10 Marks): Solve the 0/1 Knapsack problem using dynamic programming.`;

    const analysis = fallbackAi.generateFallbackDocumentAnalysis(text, 'Algorithms Syllabus', 'Syllabus');
    assert.ok(analysis.topics.length >= 2);
    assert.ok(analysis.extractedQuestions.length >= 2);
    assert.strictEqual(analysis.title, 'Algorithms Syllabus');
  });

  it('generates day-by-day revision schedule in fallback mode', () => {
    const plan = fallbackAi.generateFallbackStudyPlan('Data Structures Midterm', '2026-10-15', 3, ['Graphs', 'DP', 'Trees']);
    assert.ok(plan.dailySchedule.length > 0);
    assert.strictEqual(plan.dailySchedule[0].hours, 3);
    assert.ok(plan.dailySchedule[0].focus.length > 10);
  });
});

describe('Hermetic Gemini fallback API integration', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('gemini-fallback@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('falls back seamlessly on POST /api/practice/evaluate when fallback header is present', async () => {
    const res = await client.request('/api/practice/evaluate', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        question: 'Define a binary search tree and state its search complexity.',
        studentAnswer: 'A BST is a node-based binary tree where keys in left subtree are smaller than root, and keys in right subtree are greater. Average search time is O(log n), worst case O(n).',
        maxMarks: 5,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.strictEqual(res.json.persisted, true);
    assert.ok(res.json.feedbackId);
    assert.ok(res.json.data.score >= 2 && res.json.data.score <= 5);
    assert.strictEqual(res.json.data.maxMarks, 5);
    assert.ok(Array.isArray(res.json.data.strengths));
    assert.ok(Array.isArray(res.json.data.improvements));
    assert.ok(res.json.data.feedbackText);
    assert.ok(res.json.data.modelAnswerSnippet);
  });

  it('falls back seamlessly on POST /api/gemini/evaluate-answer when fallback header is present', async () => {
    const res = await client.request('/api/gemini/evaluate-answer', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        question: 'What is memoization?',
        studentAnswer: 'Memoization is an optimization technique storing results of expensive function calls.',
        maxMarks: 5,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(res.json.data.score >= 1);
  });

  it('falls back seamlessly on POST /api/practice/hint when fallback header is present', async () => {
    const res = await client.request('/api/practice/hint', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        question: 'How to detect a cycle in a directed graph using DFS?',
        maxMarks: 5,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(typeof res.json.data.hint === 'string');
    assert.ok(res.json.data.hint.includes('•'));
  });

  it('grades and persists a timed mock exam on POST /api/mock-exams when fallback header is present', async () => {
    const res = await client.request('/api/mock-exams', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        examName: 'Fallback Timed Mock Exam',
        durationSeconds: 1800,
        startedAt: new Date(Date.now() - 1800000).toISOString(),
        endedAt: new Date().toISOString(),
        questions: [
          {
            questionText: 'Explain Breadth First Search on a graph.',
            topicName: 'Graph Traversal',
            marks: 6,
            answer: 'BFS uses a FIFO queue to visit vertices layer by layer starting from source. It marks vertices as visited to avoid cycles. Time complexity is O(V + E).',
          },
          {
            questionText: 'Explain Depth First Search on a graph.',
            topicName: 'Graph Traversal',
            marks: 6,
            answer: '',
          },
        ],
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.source, 'fallback');
    const exam = res.json.mockExam;
    assert.ok(exam.id);
    assert.strictEqual(exam.examName, 'Fallback Timed Mock Exam');
    assert.strictEqual(exam.questionCount, 2);
    assert.ok(exam.perQuestion);
    assert.strictEqual(exam.perQuestion.length, 2);
    assert.ok(exam.perQuestion[0].score > 0);
    assert.strictEqual(exam.perQuestion[1].score, 0);
    assert.ok(exam.topicBreakdown.length > 0);
    assert.ok(exam.advice);

    // Verify it is retrievable through GET /api/mock-exams/:id
    const retrieved = await client.request(`/api/mock-exams/${exam.id}`);
    assert.strictEqual(retrieved.status, 200);
    assert.strictEqual(retrieved.json.mockExam.id, exam.id);
    assert.strictEqual(retrieved.json.mockExam.perQuestion.length, 2);
  });

  it('extracts topics and questions on POST /api/gemini/analyze-document with fallback header', async () => {
    const res = await client.request('/api/gemini/analyze-document', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        documentName: 'OS Syllabus',
        documentType: 'Syllabus',
        content: `Unit 1: Process Management & Scheduling (50%)
Process control block, CPU scheduling algorithms: FCFS, SJF, Round Robin.
Unit 2: Memory Management & Virtual Memory (50%)
Paging, segmentation, page replacement algorithms: LRU, FIFO.
QUESTION 1 (5 Marks): Explain the Round Robin CPU scheduling algorithm.`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(Array.isArray(res.json.data.topics));
    assert.ok(res.json.data.topics.length >= 2);
    assert.ok(Array.isArray(res.json.data.extractedQuestions));
  });

  it('generates a structured study plan on POST /api/gemini/generate-plan with fallback header', async () => {
    const res = await client.request('/api/gemini/generate-plan', {
      method: 'POST',
      headers: { 'x-allow-fallback': 'true' },
      body: {
        examName: 'Operating Systems Final',
        examDate: '2026-11-01',
        dailyStudyHours: 4,
        topics: ['Processes', 'Memory Management', 'File Systems'],
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(Array.isArray(res.json.data.dailySchedule));
    assert.ok(res.json.data.dailySchedule.length > 0);
    assert.strictEqual(res.json.data.dailySchedule[0].hours, 4);
  });
});

describe('Gemini 503 UNAVAILABLE resilience (without fallback header)', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    // Simulate Gemini API returning the exact 503 UNAVAILABLE error
    const simulated503 = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}');
    setAIClientForTesting({
      models: {
        generateContent: async () => {
          throw simulated503;
        },
      },
    });

    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('gemini-503-sim@example.com', 'secret123');
    client.token = token;
  });

  after(() => {
    setAIClientForTesting(null);
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('safely falls back on POST /api/practice/evaluate when Gemini returns 503', async () => {
    const res = await client.request('/api/practice/evaluate', {
      method: 'POST',
      body: {
        question: 'Explain Dijkstra shortest path algorithm.',
        studentAnswer: 'Dijkstra finds shortest paths from source using a priority queue with non-negative weights.',
        maxMarks: 10,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.strictEqual(res.json.persisted, true);
    assert.ok(res.json.data.score > 0);
    assert.ok(res.json.data.strengths.length > 0);
    assert.ok(res.json.data.modelAnswerSnippet);
  });

  it('safely falls back on POST /api/practice/hint when Gemini returns 503', async () => {
    const res = await client.request('/api/practice/hint', {
      method: 'POST',
      body: {
        question: 'Explain Dijkstra shortest path algorithm.',
        maxMarks: 10,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(res.json.data.hint);
  });

  it('safely grades and persists timed mock exams on POST /api/mock-exams when Gemini returns 503', async () => {
    const res = await client.request('/api/mock-exams', {
      method: 'POST',
      body: {
        examName: '503 Resilient Mock Exam',
        durationSeconds: 1800,
        questions: [
          {
            questionText: 'Define QuickSort and its average time complexity.',
            topicName: 'Sorting Algorithms',
            marks: 5,
            answer: 'QuickSort is a divide and conquer algorithm choosing a pivot. Average complexity is O(n log n).',
          },
        ],
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(res.json.mockExam.id);
    assert.strictEqual(res.json.mockExam.perQuestion.length, 1);
    assert.ok(res.json.mockExam.perQuestion[0].score > 0);
    assert.ok(res.json.mockExam.advice);
  });

  it('safely falls back on POST /api/gemini/analyze-document when Gemini returns 503', async () => {
    const res = await client.request('/api/gemini/analyze-document', {
      method: 'POST',
      body: {
        documentName: 'Algorithms Paper',
        documentType: 'Past Paper',
        content: 'QUESTION 1 (5 Marks): Explain merge sort. QUESTION 2 (5 Marks): Explain quick sort.',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(res.json.data.topics.length > 0);
    assert.strictEqual(res.json.data.extractedQuestions.length, 2);
  });

  it('safely falls back on POST /api/gemini/generate-plan when Gemini returns 503', async () => {
    const res = await client.request('/api/gemini/generate-plan', {
      method: 'POST',
      body: {
        examName: 'Algorithms Final',
        examDate: '2026-10-20',
        dailyStudyHours: 3,
        topics: ['Sorting', 'Graphs', 'DP'],
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.source, 'fallback');
    assert.ok(res.json.data.dailySchedule.length > 0);
  });
});
