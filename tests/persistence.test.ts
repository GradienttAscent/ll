import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

describe('persistence layer', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('user@persist.com', 'secret123');
    client.token = token;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('topics upsert on (user, course, name) without duplicates', async () => {
    await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Graphs', priority: 8, weightage: 40 }] },
    });
    const second = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Graphs', priority: 9, weightage: 50 }] },
    });
    assert.strictEqual(second.status, 201);
    assert.strictEqual(second.json.topics.length, 1);
    assert.strictEqual(second.json.topics[0].priority, 9);
    assert.strictEqual(second.json.topics[0].weightage, 50);
  });

  it('topic POST requires a name', async () => {
    const res = await client.request('/api/topics', { method: 'POST', body: { name: '   ' } });
    assert.strictEqual(res.status, 400);
  });

  it('schedule blocks can be created, rescheduled, and completed with change history', async () => {
    const { topics } = (await client.request('/api/topics')).json;
    const topicId = topics[0].id;

    const created = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Graph Practice', date: '2026-09-25', startTime: '08:00', durationMinutes: 45 },
    });
    assert.strictEqual(created.status, 201);
    const block = created.json.scheduleBlocks[0];
    assert.strictEqual(block.topicName, 'Graphs');

    const rescheduled = await client.request(`/api/schedule-blocks/${block.id}`, {
      method: 'PATCH',
      body: { startTime: '09:30', durationMinutes: 90 },
    });
    assert.strictEqual(rescheduled.status, 200);
    const updated = rescheduled.json.scheduleBlocks[0];
    assert.strictEqual(updated.startTime, '09:30');
    assert.strictEqual(updated.durationMinutes, 90);

    const completed = await client.request(`/api/schedule-blocks/${block.id}`, {
      method: 'PATCH',
      body: { completed: true },
    });
    assert.strictEqual(completed.status, 200);
    assert.strictEqual(completed.json.scheduleBlocks[0].completed, true);

    const changes = await client.request(`/api/schedule-changes?blockId=${block.id}`);
    assert.strictEqual(changes.status, 200);
    const fields = changes.json.scheduleChanges.map((c: any) => c.field);
    assert.ok(fields.includes('created'));
    assert.ok(fields.includes('rescheduled'));
    assert.ok(fields.includes('completed'));
  });

  it('blocks cannot be created on a nonexistent topic', async () => {
    const res = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId: 'nope', title: 'X', date: '2026-09-26', startTime: '08:00', durationMinutes: 30 },
    });
    assert.strictEqual(res.status, 404);
  });

  it('PATCH requires at least one valid field', async () => {
    const blocks = (await client.request('/api/schedule-blocks')).json.scheduleBlocks;
    const res = await client.request(`/api/schedule-blocks/${blocks[0].id}`, { method: 'PATCH', body: {} });
    assert.strictEqual(res.status, 400);
  });

  it('documents CRUD is scoped and returns single-document envelope', async () => {
    const created = await client.request('/api/documents', {
      method: 'POST',
      body: { title: 'Final Syllabus', docType: 'Syllabus', content: 'Long text', fileSize: '3 MB' },
    });
    assert.strictEqual(created.status, 201);
    const docId = created.json.document.id;

    const single = await client.request(`/api/documents/${docId}`);
    assert.strictEqual(single.status, 200);
    assert.strictEqual(single.json.document.title, 'Final Syllabus');
    assert.strictEqual(single.json.document.content, 'Long text');

    const missing = await client.request('/api/documents/does-not-exist');
    assert.strictEqual(missing.status, 404);
  });

  it('questions support bulk create and single read', async () => {
    const { topics } = (await client.request('/api/topics')).json;
    const created = await client.request('/api/questions/bulk', {
      method: 'POST',
      body: { questions: [
        { topicId: topics[0].id, questionText: 'Run BFS?', marks: 12, suggestedTimeMinutes: 20 },
        { topicName: 'Dynamic Programming', questionText: 'Knapsack recurrence?' },
      ] },
    });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.json.questions.length, 2);

    const bfsQuestion = created.json.questions.find((q: any) => q.questionText === 'Run BFS?');
    const knapsackQuestion = created.json.questions.find((q: any) => q.questionText === 'Knapsack recurrence?');
    assert.ok(bfsQuestion, 'BFS question should be persisted');
    assert.ok(knapsackQuestion, 'Knapsack question should be persisted');

    const single = await client.request(`/api/questions/${bfsQuestion.id}`);
    assert.strictEqual(single.status, 200);
    assert.strictEqual(single.json.question.questionText, 'Run BFS?');
    assert.strictEqual(single.json.question.marks, 12);

    const missing = await client.request('/api/questions/does-not-exist');
    assert.strictEqual(missing.status, 404);
  });

  it('feedback validates score, maxMarks, and source', async () => {
    const over = await client.request('/api/feedback', { method: 'POST', body: { score: 11, maxMarks: 10 } });
    assert.strictEqual(over.status, 400);

    const badSource = await client.request('/api/feedback', { method: 'POST', body: { score: 5, maxMarks: 10, source: 'unknown' } });
    assert.strictEqual(badSource.status, 400);

    const ok = await client.request('/api/feedback', { method: 'POST', body: { score: 5, maxMarks: 10, source: 'manual', strengths: ['good'], improvements: [] } });
    assert.strictEqual(ok.status, 201);
    assert.deepStrictEqual(ok.json.feedback.strengths, ['good']);
  });

  it('study sessions accumulate duration and stamp ended_at', async () => {
    const { scheduleBlocks } = (await client.request('/api/schedule-blocks')).json;
    const blockId = scheduleBlocks[0].id;

    const started = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: blockId, durationMinutes: 45 } });
    assert.strictEqual(started.status, 201);
    const sessionId = started.json.studySession.id;
    assert.strictEqual(started.json.studySession.status, 'active');

    const paused = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'paused', actualDurationSeconds: 120 } });
    assert.strictEqual(paused.status, 200);
    assert.deepStrictEqual(paused.json, { studySession: { id: sessionId, status: 'paused' } });

    const completed = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'completed', actualDurationSeconds: 2400 } });
    assert.strictEqual(completed.status, 200);

    const sessions = await client.request('/api/study-sessions');
    const session = sessions.json.studySessions.find((s: any) => s.id === sessionId);
    assert.strictEqual(session.status, 'completed');
    assert.ok(session.endedAt);
    assert.strictEqual(session.actualDurationSeconds, 2520);

    const invalid = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'exploded' } });
    assert.strictEqual(invalid.status, 400);
  });

  it('actual marked blocks are reflected as completed in schedule list', async () => {
    const { scheduleBlocks } = (await client.request('/api/schedule-blocks')).json;
    assert.ok(scheduleBlocks.some((b: any) => b.completed));
  });
});