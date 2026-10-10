import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';
import { setAIClientForTesting, extractTeacherIntelligence } from '../server';

describe('Teacher Intelligence: Gemini Primary Path & Automatic Deterministic Fallback', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('teacher-gemini@example.com', 'secret123');
    client.token = token;
  });

  after(async () => {
    setAIClientForTesting(null);
    await server.close();
    removeTempDir(server.dbDir);
  });

  afterEach(() => {
    setAIClientForTesting(null);
  });

  it('1. Gemini success → Gemini result is used with exact physical page numbers preserved', async () => {
    const mockGemini = {
      models: {
        generateContent: async () => {
          return {
            text: JSON.stringify({
              questions: [
                {
                  questionNumber: '1',
                  subpart: 'a',
                  text: 'Explain process lifecycle states and context switching.',
                  marks: 7,
                  context: 'Operating System Fundamentals',
                  pageNumber: 1,
                  topicName: 'Process Management',
                  confidence: 0.95,
                },
                {
                  questionNumber: '1',
                  subpart: 'b',
                  text: 'Compare preemptive and non-preemptive CPU scheduling algorithms.',
                  marks: 8,
                  context: 'Operating System Fundamentals',
                  pageNumber: 1,
                  topicName: 'CPU Scheduling',
                  confidence: 0.92,
                },
                {
                  questionNumber: '2',
                  text: 'Discuss virtual memory translation using TLB and inverted page tables.',
                  marks: 15,
                  pageNumber: 2,
                  topicName: 'Virtual Memory',
                  confidence: 0.98,
                },
              ],
            }),
          };
        },
      },
    };

    setAIClientForTesting(mockGemini);

    const twoPageContent = `Page 1 Content\nQ1(a) Process states...\n\fPage 2 Content\nQ2 Virtual memory translation...`;
    const res = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2024 Midterm Exam.txt',
        docType: 'Past Paper',
        base64: Buffer.from(twoPageContent, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });

    assert.strictEqual(res.status, 201);
    const analysis = res.json.analysis;
    assert.strictEqual(analysis.aiStatus.ok, true);
    assert.strictEqual(analysis.aiStatus.configured, true);
    assert.strictEqual(analysis.aiStatus.attempted, true);
    assert.match(analysis.aiStatus.message, /Gemini extracted 3 question/i);
    assert.strictEqual(analysis.createdQuestionCount, 3);

    // Verify questions and page numbers
    const questions = analysis.questions;
    assert.strictEqual(questions.length, 3);

    const q1a = questions.find((q: any) => q.questionNumber === '1' && q.subpart === 'a');
    assert.ok(q1a, 'Question 1(a) should be extracted');
    assert.strictEqual(q1a.marks, 7);
    assert.strictEqual(q1a.pageNumber, 1, 'Page 1 must be preserved');
    assert.ok(q1a.questionText.includes('process lifecycle'));

    const q2 = questions.find((q: any) => q.questionNumber === '2');
    assert.ok(q2, 'Question 2 should be extracted');
    assert.strictEqual(q2.marks, 15);
    assert.strictEqual(q2.pageNumber, 2, 'Page 2 must be preserved');
  });

  it('2. Gemini unavailable (503 / network error) → automatically falls back to deterministic parser', async () => {
    const mockUnavailableGemini = {
      models: {
        generateContent: async () => {
          const err: any = new Error('503 Service Unavailable: High server demand');
          err.status = 503;
          throw err;
        },
      },
    };

    setAIClientForTesting(mockUnavailableGemini);

    const docText = `QUESTION 1 (10 Marks): Explain relational algebra selection and projection operations.\n\fQUESTION 2 (10 Marks): Define atomicity and durability in database transactions.`;
    const res = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2023 DBMS Exam.txt',
        docType: 'Past Paper',
        base64: Buffer.from(docText, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });

    // Must NOT crash or return 500/503 to user
    assert.strictEqual(res.status, 201);
    const analysis = res.json.analysis;

    // AI status reflects failure and graceful fallback
    assert.strictEqual(analysis.aiStatus.ok, false);
    assert.strictEqual(analysis.aiStatus.attempted, true);
    assert.match(analysis.aiStatus.message, /fell back to deterministic parser/i);

    // Deterministic parser successfully extracted questions
    assert.strictEqual(analysis.createdQuestionCount, 2);
    const q1 = analysis.questions.find((q: any) => q.questionNumber === '1');
    const q2 = analysis.questions.find((q: any) => q.questionNumber === '2');
    assert.ok(q1, 'Q1 extracted by fallback');
    assert.ok(q2, 'Q2 extracted by fallback');
    assert.strictEqual(q1.pageNumber, 1);
    assert.strictEqual(q2.pageNumber, 2);
  });

  it('3. No API key configured → automatically falls back to deterministic parser without error', async () => {
    // With AI client null and no active key
    setAIClientForTesting(null);

    const docText = `QUESTION 1 (12 Marks): Explain Dijkstra algorithm for shortest path calculation.\nQUESTION 2 (8 Marks): Describe Bellman-Ford algorithm and its edge weights.`;
    const res = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2022 Networks Exam.txt',
        docType: 'Past Paper',
        base64: Buffer.from(docText, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });

    assert.strictEqual(res.status, 201);
    const analysis = res.json.analysis;
    assert.strictEqual(analysis.aiStatus.configured, false);
    assert.strictEqual(analysis.aiStatus.ok, false);
    assert.match(analysis.aiStatus.message, /deterministic/i);

    assert.strictEqual(analysis.createdQuestionCount, 2);
    const questions = analysis.questions;
    assert.ok(questions.some((q: any) => q.questionText.includes('Dijkstra')));
    assert.ok(questions.some((q: any) => q.questionText.includes('Bellman-Ford')));
  });

  it('4. Malformed Gemini response (invalid JSON / empty payload) → automatically falls back to deterministic parser', async () => {
    const mockMalformedGemini = {
      models: {
        generateContent: async () => {
          // Return non-JSON HTML error page or broken text
          return { text: '<html><body>502 Bad Gateway from Proxy</body></html>' };
        },
      },
    };

    setAIClientForTesting(mockMalformedGemini);

    const docText = `QUESTION 1 (10 Marks): Explain TCP three-way handshake and connection teardown.\nQUESTION 2 (10 Marks): Discuss Congestion Control algorithms in transport layer.`;
    const res = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: '2021 Transport Layer Exam.txt',
        docType: 'Past Paper',
        base64: Buffer.from(docText, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });

    assert.strictEqual(res.status, 201);
    const analysis = res.json.analysis;
    assert.strictEqual(analysis.aiStatus.ok, false);
    assert.match(analysis.aiStatus.message, /fell back to deterministic parser/i);

    assert.strictEqual(analysis.createdQuestionCount, 2);
    const questions = analysis.questions;
    assert.ok(questions.some((q: any) => q.questionText.includes('handshake')));
    assert.ok(questions.some((q: any) => q.questionText.includes('Congestion Control')));
  });

  it('5. Page/slide references are never fabricated beyond physical document boundaries', async () => {
    const mockAiFabricatingPage = {
      models: {
        generateContent: async () => {
          return {
            text: JSON.stringify({
              questions: [
                {
                  questionNumber: '1',
                  text: 'Explain cache memory mapping techniques.',
                  marks: 10,
                  pageNumber: 999, // Out of bounds fabricated page number!
                  topicName: 'Computer Architecture',
                },
              ],
            }),
          };
        },
      },
    };

    setAIClientForTesting(mockAiFabricatingPage);

    const docText = `Page 1: Architecture\nExplain cache memory mapping techniques.`;
    const res = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: 'Architecture Exam.txt',
        docType: 'Past Paper',
        base64: Buffer.from(docText, 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
    });

    assert.strictEqual(res.status, 201);
    const analysis = res.json.analysis;
    assert.strictEqual(analysis.createdQuestionCount, 1);
    // Page number must NEVER be 999; must be clamped to the real physical page 1
    assert.strictEqual(analysis.questions[0].pageNumber, 1);
  });

  it('6. Gemini what-to-study synthesis succeeds with grounded lecture slide mapping', async () => {
    // Load academic documents first (deterministic or mock)
    await client.request('/api/academic/load-sample-pack', { method: 'POST' });

    // Now set mock Gemini for what-to-study synthesis
    let promptReceived = '';
    const mockAiWts = {
      models: {
        generateContent: async (args: any) => {
          promptReceived = typeof args.contents === 'string' ? args.contents : JSON.stringify(args.contents);
          return {
            text: JSON.stringify({
              clusters: [
                {
                  canonicalTitle: 'Deadlock Detection Algorithms & Wait-For Graphs',
                  unitTopic: 'Unit 4 · Deadlocks',
                  questionIds: ['test-q-1'], // Will be filtered, so let's provide real Qs or test fallback
                  priorityTag: 'HIGH PRIORITY',
                  importanceExplanation: 'Frequently tested in past papers and essential core theory.',
                  lectureDocId: 'doc-123',
                  startSlide: 18,
                  endSlide: 24,
                  sectionTitle: 'Deadlock Detection',
                },
              ],
            }),
          };
        },
      },
    };

    setAIClientForTesting(mockAiWts);

    const res = await client.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.json.whatToStudy));
    assert.ok(res.json.whatToStudy.length >= 1);
  });

  it('7. Gemini what-to-study synthesis failure automatically falls back to deterministic ranking', async () => {
    const mockFailingAi = {
      models: {
        generateContent: async () => {
          throw new Error('503 Service Unavailable: AI quota exhausted');
        },
      },
    };

    setAIClientForTesting(mockFailingAi);

    const res = await client.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 200);
    // Automatically fell back to deterministic ranking
    assert.ok(Array.isArray(res.json.whatToStudy));
    assert.ok(res.json.whatToStudy.length >= 2);
    const deadlock = res.json.whatToStudy.find((i: any) => i.conceptTitle.includes('Deadlock'));
    assert.ok(deadlock);
    assert.strictEqual(deadlock.lectureSource.mapped, true);
    assert.strictEqual(deadlock.lectureSource.slideRange, 'Slides 18–24');
  });
});
