import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

async function seedFully(client: Api) {
  // topics
  const topicsRes = await client.request('/api/topics/bulk', {
    method: 'POST',
    body: { topics: [{ name: 'Graphs', priority: 8, weightage: 40 }, { name: 'DP', priority: 7, weightage: 30 }] },
  });
  const topics = topicsRes.json.topics as any[];
  assert.strictEqual(topicsRes.status, 201);

  // schedule blocks
  const blockRes = await client.request('/api/schedule-blocks', {
    method: 'POST',
    body: {
      topicId: topics[0].id,
      title: 'Study Graphs',
      date: '2026-09-20',
      startTime: '09:00',
      durationMinutes: 60,
    },
  });
  assert.strictEqual(blockRes.status, 201);
  const block = blockRes.json.scheduleBlocks[0];

  // Block reschedule. Completion is recorded through the measured session lifecycle.
  const patched = await client.request(`/api/schedule-blocks/${block.id}`, {
    method: 'PATCH',
    body: { startTime: '10:00' },
  });
  assert.strictEqual(patched.status, 200);

  // study session on the block
  const sessionRes = await client.request('/api/study-sessions', {
    method: 'POST',
    body: { scheduleBlockId: block.id, durationMinutes: 60 },
  });
  assert.strictEqual(sessionRes.status, 201);
  const sessionId = sessionRes.json.studySession.id;

  const completeRes = await client.request(`/api/study-sessions/${sessionId}`, {
    method: 'PATCH',
    body: { status: 'completed', actualDurationSeconds: 2400 },
  });
  assert.strictEqual(completeRes.status, 200);

  // documents
  const docRes = await client.request('/api/documents', {
    method: 'POST',
    body: { title: 'Syllabus Draft', docType: 'Syllabus', content: 'Chapter overview', fileSize: '12 KB' },
  });
  assert.strictEqual(docRes.status, 201);
  const docId = docRes.json.document.id;

  // questions
  const qRes = await client.request('/api/questions/bulk', {
    method: 'POST',
    body: { questions: [{ topicId: topics[1].id, questionText: 'Solve knapsack?', marks: 10 }] },
  });
  assert.strictEqual(qRes.status, 201);
  const questionId = qRes.json.questions[0].id;

  // feedback
  const fbRes = await client.request('/api/feedback', {
    method: 'POST',
    body: {
      questionId,
      score: 8,
      maxMarks: 10,
      source: 'gemini',
      strengths: ['Clear steps'],
      improvements: ['More detail'],
      feedbackText: 'Good attempt',
    },
  });
  assert.strictEqual(fbRes.status, 201);

  return { topics, block, sessionId, docId, questionId };
}

describe('user isolation', () => {
  let server: TestServer;
  let alice: Api;
  let bob: Api;

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const { token: aliceToken } = await alice.register('alice@iso.com', 'secret123');
    alice.token = aliceToken;
    bob = new Api(server.baseUrl);
    const { token: bobToken } = await bob.register('bob@iso.com', 'secret123');
    bob.token = bobToken;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('lets two users seed the full persistence layer independently', async () => {
    await seedFully(alice);
    const bobData = await seedFully(bob);
    assert.ok(bobData.block.id);
  });

  it('never leaks a user-owned resource into another users list', async () => {
    const bobTopics = await bob.request('/api/topics');
    assert.strictEqual(bobTopics.json.topics.length, 2, 'bob sees only his topics');
    for (const topic of bobTopics.json.topics) {
      assert.match(topic.name, /Graphs|DP/);
    }

    const bobBlocks = await bob.request('/api/schedule-blocks');
    assert.strictEqual(bobBlocks.json.scheduleBlocks.length, 1);
    assert.match(bobBlocks.json.scheduleBlocks[0].title, /Study Graphs/);

    const bobDocs = await bob.request('/api/documents');
    assert.strictEqual(bobDocs.json.documents.length, 1);
    assert.strictEqual(bobDocs.json.documents[0].title, 'Syllabus Draft');

    const bobQuestions = await bob.request('/api/questions');
    assert.strictEqual(bobQuestions.json.questions.length, 1);

    const bobFeedback = await bob.request('/api/feedback');
    assert.strictEqual(bobFeedback.json.feedback.length, 1);

    const bobSessions = await bob.request('/api/study-sessions');
    assert.strictEqual(bobSessions.json.studySessions.length, 1);

    const bobChanges = await bob.request('/api/schedule-changes');
    assert.strictEqual(bobChanges.json.scheduleChanges.length, 3, 'created, rescheduled, completed');
  });

  it('a user can list their own resources and see exactly their data', async () => {
    const topics = await alice.request('/api/topics');
    assert.strictEqual(topics.json.topics.length, 2);

    const docs = await alice.request('/api/documents');
    assert.strictEqual(docs.json.documents.length, 1);
    assert.strictEqual(docs.json.documents[0].title, 'Syllabus Draft');

    const questions = await alice.request('/api/questions');
    assert.strictEqual(questions.json.questions.length, 1);
    assert.strictEqual(questions.json.questions[0].questionText, 'Solve knapsack?');

    const feedback = await alice.request('/api/feedback');
    assert.strictEqual(feedback.json.feedback.length, 1);
    assert.deepStrictEqual(feedback.json.feedback[0].strengths, ['Clear steps']);
    assert.deepStrictEqual(feedback.json.feedback[0].improvements, ['More detail']);

    const sessions = await alice.request('/api/study-sessions');
    assert.strictEqual(sessions.json.studySessions.length, 1);
    assert.strictEqual(sessions.json.studySessions[0].status, 'completed');
    assert.ok(sessions.json.studySessions[0].endedAt);
    assert.strictEqual(sessions.json.studySessions[0].actualDurationSeconds, 2400);

    const changes = await alice.request('/api/schedule-changes');
    const fields = changes.json.scheduleChanges.map((c: any) => c.field);
    assert.ok(fields.includes('created'));
    assert.ok(fields.includes('rescheduled'));
    assert.ok(fields.includes('completed'));
  });

  it('bob gets 404 for every cross-user resource by id', async () => {
    const aliceTopics = (await alice.request('/api/topics')).json.topics;
    const aliceBlocks = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks;
    const aliceDocs = (await alice.request('/api/documents')).json.documents;
    const aliceQuestions = (await alice.request('/api/questions')).json.questions;
    const aliceSessions = (await alice.request('/api/study-sessions')).json.studySessions;

    // documents
    assert.strictEqual((await bob.request(`/api/documents/${aliceDocs[0].id}`)).status, 404);
    // questions
    assert.strictEqual((await bob.request(`/api/questions/${aliceQuestions[0].id}`)).status, 404);
    // schedule blocks: cannot read directly, but mutation attempts via PATCH
    assert.strictEqual(
      (await bob.request(`/api/schedule-blocks/${aliceBlocks[0].id}`, { method: 'PATCH', body: { completed: false } })).status,
      404,
    );
    // schedule-changes scoped to alice's block
    assert.strictEqual(
      (await bob.request(`/api/schedule-changes?blockId=${aliceBlocks[0].id}`)).status,
      404,
    );
    // study sessions: cannot create a session on alice's block, nor patch alice's session
    assert.strictEqual(
      (await bob.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: aliceBlocks[0].id } })).status,
      404,
    );
    assert.strictEqual(
      (await bob.request(`/api/study-sessions/${aliceSessions[0].id}`, { method: 'PATCH', body: { status: 'paused' } })).status,
      404,
    );
    // creating a schedule block on alice's topic
    assert.strictEqual(
      (await bob.request('/api/schedule-blocks', {
        method: 'POST',
        body: { topicId: aliceTopics[0].id, title: 'Sneak', date: '2026-09-21', startTime: '09:00', durationMinutes: 30 },
      })).status,
      404,
    );
    // questions bulk referencing alice's topic
    assert.strictEqual(
      (await bob.request('/api/questions/bulk', {
        method: 'POST',
        body: { questions: [{ topicId: aliceTopics[0].id, questionText: 'Sneak question' }] },
      })).status,
      404,
    );
    // feedback referencing alice's question
    assert.strictEqual(
      (await bob.request('/api/feedback', {
        method: 'POST',
        body: { questionId: aliceQuestions[0].id, score: 5, maxMarks: 10, source: 'manual' },
      })).status,
      404,
    );
  });

  it('keeps academic evidence and analytics scoped to the authenticated user', async () => {
    const academic = await alice.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Alice private syllabus',
        docType: 'Syllabus',
        content: 'Unit 1: Alice Graph Theory',
      },
    });
    assert.strictEqual(academic.status, 201);

    const bobEvidence = await bob.request('/api/academic-evidence');
    assert.strictEqual(bobEvidence.status, 200);
    assert.ok(!bobEvidence.json.academic.documents.some((document: any) => document.title === 'Alice private syllabus'));
    assert.ok(!bobEvidence.json.academic.ranking.some((topic: any) => topic.name === 'Alice Graph Theory'));

    const bobAnalytics = await bob.request('/api/analytics/dashboard');
    assert.strictEqual(bobAnalytics.status, 200);
    assert.strictEqual(bobAnalytics.json.analytics.summary.plannedMinutes, 60);
    assert.strictEqual(bobAnalytics.json.analytics.summary.actualSeconds, 2400);
  });

  it('returns truthful empty feature state for a newly registered user', async () => {
    const newUser = new Api(server.baseUrl);
    const { token } = await newUser.register('new-user@iso.com', 'secret123');
    newUser.token = token;

    assert.deepStrictEqual((await newUser.request('/api/academic-evidence')).json.academic.documents, []);
    assert.deepStrictEqual((await newUser.request('/api/topics')).json.topics, []);
    assert.deepStrictEqual((await newUser.request('/api/schedule-blocks')).json.scheduleBlocks, []);
    assert.deepStrictEqual((await newUser.request('/api/study-sessions')).json.studySessions, []);
    assert.deepStrictEqual((await newUser.request('/api/feedback')).json.feedback, []);
    const analytics = await newUser.request('/api/analytics/dashboard');
    assert.strictEqual(analytics.json.analytics.summary.plannedMinutes, 0);
    assert.strictEqual(analytics.json.analytics.summary.actualSeconds, 0);

    const assistant = await newUser.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'What is on my schedule tomorrow?' },
    });
    assert.strictEqual(assistant.status, 200);
    assert.strictEqual(assistant.json.preview.changes.length, 0);

    const aliceSessions = (await alice.request('/api/study-sessions')).json.studySessions;
    const foreignAdaptive = await newUser.request('/api/adaptive-proposals', {
      method: 'POST', body: { studySessionId: aliceSessions[0].id },
    });
    assert.strictEqual(foreignAdaptive.status, 404);
  });

  it('bob can read all of his own resources after the cross-user attempts', async () => {
    const topics = await bob.request('/api/topics');
    assert.strictEqual(topics.json.topics.length, 2);
    const docs = await bob.request('/api/documents');
    assert.strictEqual(docs.json.documents.length, 1);
  });
});
