import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { closeDatabase, getDatabase, initDatabase } from '../db';
import { findOwnedStudySession, findSessionFeedback, setDb } from '../services';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('study session lifecycle and feedback', () => {
  let server: TestServer;
  let client: Api;
  let userId: string;
  let topicId: string;
  let blockNumber = 0;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token, user } = await client.register('session-feedback@example.com', 'secret123');
    client.token = token;
    userId = user.id;
    const topics = await client.request('/api/topics', { method: 'POST', body: { name: 'Session Systems' } });
    topicId = topics.json.topics[0].id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function createSession(durationMinutes = 60) {
    blockNumber += 1;
    const block = await client.request('/api/schedule-blocks', {
      method: 'POST', body: {
        topicId,
        title: `Lifecycle block ${blockNumber}`,
        date: `2026-12-${String(10 + blockNumber).padStart(2, '0')}`,
        startTime: '08:00',
        durationMinutes,
      },
    });
    assert.strictEqual(block.status, 201);
    const scheduleBlock = block.json.scheduleBlocks.find((item: any) => item.title === `Lifecycle block ${blockNumber}`);
    const session = await client.request('/api/study-sessions', {
      method: 'POST', body: { scheduleBlockId: scheduleBlock.id, durationMinutes },
    });
    assert.strictEqual(session.status, 201);
    return { block: scheduleBlock, session: session.json.studySession };
  }

  async function patch(sessionId: string, status: string, actualDurationSeconds = 0) {
    const response = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status, actualDurationSeconds } });
    if (response.status !== 200) return response;
    const session = (await client.request('/api/study-sessions')).json.studySessions.find((item: any) => item.id === sessionId);
    return { ...response, json: { ...response.json, session } };
  }

  it('persists active, paused, resumed, and completed state without double-counting deltas', async () => {
    const { block, session } = await createSession();
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.actualDurationSeconds, 0);
    assert.ok(session.activeSince);

    const firstPause = await patch(session.id, 'paused', 12);
    assert.strictEqual(firstPause.status, 200);
    assert.strictEqual(firstPause.json.session.status, 'paused');
    assert.strictEqual(firstPause.json.session.actualDurationSeconds, 12);
    assert.strictEqual(firstPause.json.session.activeSince, null);

    const resume = await patch(session.id, 'active');
    assert.strictEqual(resume.json.session.status, 'active');
    assert.strictEqual(resume.json.session.actualDurationSeconds, 12);
    assert.ok(resume.json.session.activeSince);
    assert.strictEqual((await patch(session.id, 'paused', 8)).json.session.actualDurationSeconds, 20);
    assert.strictEqual((await patch(session.id, 'active')).json.session.actualDurationSeconds, 20);
    const completed = await patch(session.id, 'completed', 5);
    assert.strictEqual(completed.status, 200);
    assert.strictEqual(completed.json.session.actualDurationSeconds, 25);
    assert.strictEqual(completed.json.session.activeSince, null);
    assert.ok(completed.json.session.endedAt);

    const persisted = (await client.request('/api/study-sessions')).json.studySessions.find((item: any) => item.id === session.id);
    assert.strictEqual(persisted.actualDurationSeconds, 25);
    const savedBlock = (await client.request('/api/schedule-blocks')).json.scheduleBlocks.find((item: any) => item.id === block.id);
    assert.strictEqual(savedBlock.completed, true);
  });

  it('does not add active duration while a session is paused and preserves stopped duration', async () => {
    const { session } = await createSession();
    assert.strictEqual((await patch(session.id, 'paused', 9)).json.session.actualDurationSeconds, 9);
    assert.strictEqual((await patch(session.id, 'paused', 0)).json.session.actualDurationSeconds, 9);
    assert.strictEqual((await patch(session.id, 'active')).json.session.actualDurationSeconds, 9);
    const stopped = await patch(session.id, 'stopped', 4);
    assert.strictEqual(stopped.status, 200);
    assert.strictEqual(stopped.json.session.actualDurationSeconds, 13);
  });

  it('rejects concurrent unfinished sessions and sessions for completed blocks', async () => {
    const active = await createSession();
    const otherBlock = await client.request('/api/schedule-blocks', {
      method: 'POST', body: {
        topicId, title: 'Concurrent guard block', date: '2026-12-30', startTime: '08:00', durationMinutes: 30,
      },
    });
    const other = otherBlock.json.scheduleBlocks.find((item: any) => item.title === 'Concurrent guard block');
    assert.strictEqual((await client.request('/api/study-sessions', {
      method: 'POST', body: { scheduleBlockId: other.id, durationMinutes: 30 },
    })).status, 409);
    await patch(active.session.id, 'completed', 15);
    assert.strictEqual((await client.request('/api/study-sessions', {
      method: 'POST', body: { scheduleBlockId: active.block.id, durationMinutes: 60 },
    })).status, 409);
  });

  it('validates, persists, upserts, and retrieves completed-session feedback', async () => {
    const { session } = await createSession();
    await patch(session.id, 'completed', 30);
    assert.strictEqual((await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 0, difficultyRating: 3, progressRating: 3 },
    })).status, 400);
    assert.strictEqual((await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 6, progressRating: 3 },
    })).status, 400);
    assert.strictEqual((await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 3, progressRating: 1.5 },
    })).status, 400);
    const saved = await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 5, progressRating: 2, notes: 'Needed more revision.' },
    });
    assert.strictEqual(saved.status, 201);
    assert.strictEqual(saved.json.feedback.notes, 'Needed more revision.');
    const updated = await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 4, difficultyRating: 4, progressRating: 3, notes: 'Second reflection.' },
    });
    assert.strictEqual(updated.status, 201);
    assert.strictEqual(updated.json.feedback.id, saved.json.feedback.id);
    const read = await client.request(`/api/study-sessions/${session.id}/feedback`);
    assert.deepStrictEqual(read.json.feedback.notes, 'Second reflection.');
  });

  it('requires completion and keeps session feedback private', async () => {
    const { session } = await createSession();
    assert.strictEqual((await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 3, progressRating: 3 },
    })).status, 409);
    const other = new Api(server.baseUrl);
    const { token } = await other.register('session-feedback-other@example.com', 'secret123');
    other.token = token;
    assert.strictEqual((await other.request(`/api/study-sessions/${session.id}/feedback`)).status, 404);
    assert.strictEqual((await other.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 5, progressRating: 3 },
    })).status, 404);
    await patch(session.id, 'stopped');
  });

  it('uses persisted difficulty feedback for high-difficulty adaptive proposals without schedule writes', async () => {
    const high = await createSession(90);
    await patch(high.session.id, 'completed', 20);
    await client.request(`/api/study-sessions/${high.session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 5, progressRating: 3 },
    });
    const before = (await client.request('/api/schedule-blocks')).json.scheduleBlocks;
    const proposal = await client.request('/api/adaptive-proposals', { method: 'POST', body: { studySessionId: high.session.id } });
    assert.strictEqual(proposal.status, 200);
    assert.strictEqual(proposal.json.proposal.trigger, 'high_difficulty');
    assert.deepStrictEqual((await client.request('/api/schedule-blocks')).json.scheduleBlocks, before);

    const qualifying = await createSession();
    await patch(qualifying.session.id, 'completed', 20);
    await client.request(`/api/study-sessions/${qualifying.session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 4, progressRating: 3 },
    });
    assert.strictEqual((await client.request('/api/adaptive-proposals', { method: 'POST', body: { studySessionId: qualifying.session.id } })).status, 200);

    const low = await createSession();
    await patch(low.session.id, 'completed', 20);
    await client.request(`/api/study-sessions/${low.session.id}/feedback`, {
      method: 'POST', body: { focusRating: 3, difficultyRating: 3, progressRating: 3 },
    });
    assert.strictEqual((await client.request('/api/adaptive-proposals', { method: 'POST', body: { studySessionId: low.session.id } })).status, 409);
  });

  it('persists session feedback across a database restart', async () => {
    const { session } = await createSession();
    await patch(session.id, 'completed', 15);
    await client.request(`/api/study-sessions/${session.id}/feedback`, {
      method: 'POST', body: { focusRating: 2, difficultyRating: 4, progressRating: 2, notes: 'Persistent evidence' },
    });
    closeDatabase();
    await initDatabase();
    setDb(await getDatabase());
    const feedback = findSessionFeedback(userId, session.id);
    assert.strictEqual(feedback?.difficultyRating, 4);
    assert.strictEqual(feedback?.notes, 'Persistent evidence');
    const restoredSession = findOwnedStudySession(userId, session.id);
    assert.strictEqual(restoredSession?.status, 'completed');
    assert.strictEqual(restoredSession?.actualDurationSeconds, 15);
  });
});
