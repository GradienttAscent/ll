import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizePracticeEvaluation,
  normalizeMockExamReport,
  savePracticeEvaluation,
  createMockExam,
  mockExamList,
  getMockExam,
} from '../services';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('practice evaluation helpers (pure)', () => {
  it('clamps practice scores to the mark budget', () => {
    const result = normalizePracticeEvaluation({ score: 15, maxMarks: 10 }, 10);
    assert.strictEqual(result.score, 10);
    assert.strictEqual(result.maxMarks, 10);
  });

  it('never returns negative or NaN scores', () => {
    const result = normalizePracticeEvaluation({ score: -3 }, 5);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.maxMarks, 5);
  });

  it('normalizes string lists and drops empty entries', () => {
    const result = normalizePracticeEvaluation(
      { score: 4, strengths: [' clear logic ', '', '   '], improvements: null },
      6,
    );
    assert.deepStrictEqual(result.strengths, ['clear logic']);
    assert.deepStrictEqual(result.improvements, []);
  });

  it('truncates long feedback text', () => {
    const long = 'x'.repeat(4200);
    const result = normalizePracticeEvaluation({ score: 3, feedbackText: long }, 8);
    assert.ok(result.feedbackText.length < 4200);
    assert.ok(result.feedbackText.endsWith('...'));
    assert.ok(result.feedbackText.startsWith('x'));
  });
});

describe('mock exam report helpers (pure)', () => {
  const questions = [
    { questionText: 'Q1', topicName: 'Graphs', marks: 5, answer: 'Dijkstra, O(E log V)' },
    { questionText: 'Q2', topicName: 'Graphs', marks: 10, answer: '' },
    { questionText: 'Q3', topicName: 'DP', marks: 5, answer: 'memoization' },
  ];

  it('clamps per-question scores and forces blank answers to 0', () => {
    const report = normalizeMockExamReport(
      {
        perQuestion: [
          { index: 1, score: 9 },
          { index: 2, score: 500 },
          { index: 3, score: 5 },
        ],
        overall: { advice: 'Review DP.' },
      },
      questions,
    );
    assert.strictEqual(report.perQuestion[0].score, 5);
    assert.strictEqual(report.perQuestion[1].score, 0);
    assert.strictEqual(report.perQuestion[2].score, 5);
    assert.strictEqual(report.answeredCount, 2);
    assert.strictEqual(report.totalScore, 10);
    assert.strictEqual(report.totalMax, 20);
    assert.strictEqual(report.percentage, 50);
    assert.strictEqual(report.grade, 'C');
    assert.strictEqual(report.advice, 'Review DP.');
  });

  it('aggregates topic breakdown and keeps mastery labels', () => {
    const report = normalizeMockExamReport(
      {
        perQuestion: [
          { index: 1, score: 4, strengths: ['clear'], improvements: [] },
          { index: 2, score: 0 },
          { index: 3, score: 4 },
        ],
      },
      questions,
    );
    assert.deepStrictEqual(report.topicBreakdown, [
      { topic: 'Graphs', score: 4, maxMarks: 15, mastery: 'Needs Work' },
      { topic: 'DP', score: 4, maxMarks: 5, mastery: 'Developing' },
    ]);
  });

  it('maps grade boundaries A/B/C/D', () => {
    const cases: Array<[number, string]> = [
      [85, 'A'],
      [84, 'B'],
      [70, 'B'],
      [69, 'C'],
      [50, 'C'],
      [49, 'D'],
    ];
    for (const [percentage, grade] of cases) {
      const marks = 100;
      const score = Math.round((percentage / 100) * marks);
      const report = normalizeMockExamReport(
        { perQuestion: [{ index: 1, score }] },
        [{ questionText: 'Q', marks, answer: 'a' }],
      );
      assert.strictEqual(report.grade, grade, `percentage ${percentage} should grade ${grade}`);
    }
  });

  it('handles a completely empty raw response gracefully', () => {
    const report = normalizeMockExamReport({}, questions);
    assert.strictEqual(report.perQuestion[0].score, 0);
    assert.strictEqual(report.perQuestion[1].score, 0);
    assert.strictEqual(report.topicBreakdown.length, 2);
    assert.strictEqual(report.percentage, 0);
    assert.strictEqual(report.grade, 'D');
  });
});

describe('practice and mock exam API (hermetic)', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer();
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('requires authentication for practice and mock exam routes', async () => {
    const client = new Api(server.baseUrl);
    const practice = await client.request('/api/practice/evaluate', {
      method: 'POST',
      body: { question: 'Q', studentAnswer: 'A', maxMarks: 5 },
    });
    assert.strictEqual(practice.status, 401);
    const hint = await client.request('/api/practice/hint', {
      method: 'POST',
      body: { question: 'Q', maxMarks: 5 },
    });
    assert.strictEqual(hint.status, 401);
    const mock = await client.request('/api/mock-exams', {
      method: 'POST',
      body: { questions: [{ questionText: 'Q', marks: 5, answer: 'A' }] },
    });
    assert.strictEqual(mock.status, 401);
    const list = await client.request('/api/mock-exams');
    assert.strictEqual(list.status, 401);
  });

  it('validates practice input fields', async () => {
    const client = new Api(server.baseUrl);
    const { token, user } = await client.register('practice-api@example.com', 'secret123');
    client.token = token;
    assert.ok(user.id);

    const missingQuestion = await client.request('/api/practice/evaluate', {
      method: 'POST',
      body: { studentAnswer: 'A', maxMarks: 5 },
    });
    assert.strictEqual(missingQuestion.status, 400);

    const blankAnswer = await client.request('/api/practice/evaluate', {
      method: 'POST',
      body: { question: 'Q', studentAnswer: '   ', maxMarks: 5 },
    });
    assert.strictEqual(blankAnswer.status, 400);

    const missingHintQuestion = await client.request('/api/practice/hint', {
      method: 'POST',
      body: { maxMarks: 5 },
    });
    assert.strictEqual(missingHintQuestion.status, 400);
  });

  it('returns 503 with a readable message when Gemini is not configured', async () => {
    const client = new Api(server.baseUrl);
    const { token } = await client.register('practice-503@example.com', 'secret123');
    client.token = token;
    assert.ok(token);

    const practice = await client.request('/api/practice/evaluate', {
      method: 'POST',
      body: { question: 'What is Dijkstra?', studentAnswer: 'Find shortest paths.', maxMarks: 10 },
    });
    assert.strictEqual(practice.status, 503);
    assert.ok(/GEMINI_API_KEY/i.test(practice.json.error));

    const mock = await client.request('/api/mock-exams', {
      method: 'POST',
      body: {
        examName: 'Timed Mock Examination',
        questions: [{ questionText: 'What is Dijkstra?', topicName: 'Graphs', marks: 5, answer: 'Shortest paths.' }],
      },
    });
    assert.strictEqual(mock.status, 503);
    assert.ok(/GEMINI_API_KEY/i.test(mock.json.error));

    const hint = await client.request('/api/practice/hint', {
      method: 'POST',
      body: { question: 'What is Dijkstra?', maxMarks: 10 },
    });
    assert.strictEqual(hint.status, 503);
    assert.ok(/GEMINI_API_KEY/i.test(hint.json.error));

    const missingText = await client.request('/api/mock-exams', {
      method: 'POST',
      body: { questions: [{ marks: 5 }] },
    });
    assert.strictEqual(missingText.status, 503);
  });
});

describe('mock exam persistence (direct service access)', () => {
  let server: TestServer;
  let client: Api;
  let userId: string;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token, user } = await client.register('mock-persist@example.com', 'secret123');
    client.token = token;
    userId = user.id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('persists an exam with per-question rows and reads it back', async () => {
    const questions = [
      { questionText: 'Define species.', topicName: 'Biology', marks: 5, answer: 'A group of organisms.' },
      { questionText: 'Explain PCR.', topicName: 'Biology', marks: 5, answer: '' },
    ];
    const report = normalizeMockExamReport(
      { perQuestion: [{ index: 1, score: 4 }], overall: { advice: 'Finish answers next time.' } },
      questions,
    );
    const record = createMockExam(userId, {
      examName: 'Midterm Mock',
      durationSeconds: 2700,
      startedAt: '2026-09-20T08:00:00.000Z',
      endedAt: '2026-09-20T08:45:00.000Z',
      report,
    });

    assert.ok(record.id);
    assert.strictEqual(record.examName, 'Midterm Mock');
    assert.strictEqual(record.totalScore, 4);
    assert.strictEqual(record.totalMax, 10);
    assert.strictEqual(record.perQuestion.length, 2);
    assert.strictEqual(record.perQuestion[0].answer, 'A group of organisms.');
    assert.strictEqual(record.perQuestion[0].score, 4);
    assert.strictEqual(record.perQuestion[1].score, 0);
    assert.deepStrictEqual(record.perQuestion[0].strengths, []);
    assert.strictEqual(record.advice, 'Finish answers next time.');

    const list = mockExamList(userId);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, record.id);
    assert.strictEqual(list[0].grade, 'D');

    const detail = getMockExam(userId, record.id);
    assert.ok(detail);
    assert.strictEqual(detail.perQuestion.length, 2);
    assert.strictEqual(detail.answeredCount, 1);
    assert.deepStrictEqual(detail.topicBreakdown, [
      { topic: 'Biology', score: 4, maxMarks: 10, mastery: 'Needs Work' },
    ]);

    assert.strictEqual(getMockExam('other-user', record.id), undefined);
  });

  it('persists practice evaluations into the feedback table with source gemini', async () => {
    const saved = savePracticeEvaluation(userId, {
      score: 7,
      maxMarks: 10,
      strengths: ['clear structure'],
      improvements: ['cover edge cases'],
      feedbackText: 'Good attempt.',
      modelAnswerSnippet: 'Best-practice answer.',
    });
    assert.ok(saved.id);
    assert.strictEqual(saved.source, 'gemini');
    assert.strictEqual(saved.score, 7);
    assert.deepStrictEqual(saved.strengths, ['clear structure']);

    const res = await client.request('/api/feedback');
    assert.strictEqual(res.status, 200);
    const owned = res.json.feedback.find((entry: any) => entry.id === saved.id);
    assert.ok(owned);
    assert.strictEqual(owned.source, 'gemini');
    assert.strictEqual(owned.score, 7);
  });
});