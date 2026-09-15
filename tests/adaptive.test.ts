import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

const dateKey = (offsetDays: number): string => {
  const now = new Date();
  const base = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
};

async function seedTopic(client: Api, name: string): Promise<string> {
  const res = await client.request('/api/topics', { method: 'POST', body: { name, priority: 8, weightage: 40 } });
  assert.strictEqual(res.status, 201);
  return res.json.topics[0].id;
}

async function createMissedBlock(client: Api, topicId: string): Promise<{ id: string; title: string; durationMinutes: number }> {
  const res = await client.request('/api/schedule-blocks', {
    method: 'POST',
    body: { topicId, title: 'Missed Graphs', date: dateKey(-1), startTime: '09:00', durationMinutes: 60 },
  });
  assert.strictEqual(res.status, 201);
  return res.json.scheduleBlocks.find((b: any) => b.date === dateKey(-1));
}

describe('adaptive scheduling backend contract', () => {
  let server: TestServer;
  let alice: Api;
  let bob: Api;
  let topicId: string;
  let missed: { id: string; title: string; durationMinutes: number };

  before(async () => {
    server = await createTestServer();
    alice = new Api(server.baseUrl);
    const { token } = await alice.register('alice@adaptive.com', 'secret123');
    alice.token = token;
    bob = new Api(server.baseUrl);
    const { token: bobToken } = await bob.register('bob@adaptive.com', 'secret123');
    bob.token = bobToken;
    topicId = await seedTopic(alice, 'Graphs');
    await seedTopic(bob, 'Graphs');
    missed = await createMissedBlock(alice, topicId);
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('proposal computes a shorter revision block in a free slot without writing', async () => {
    const before = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    const { status, json } = await alice.request('/api/adaptive/proposals', {
      method: 'POST',
      body: { scheduleBlockId: missed.id, reason: 'missed' },
    });
    assert.strictEqual(status, 200);
    const proposal = json.proposal;
    assert.strictEqual(proposal.sourceBlockId, missed.id);
    assert.strictEqual(proposal.reason, 'missed');
    assert.strictEqual(proposal.topicId, topicId);
    assert.strictEqual(proposal.durationMinutes, 30, 'shorter revision half of the 60m block, capped at 30');
    assert.ok(proposal.date >= dateKey(0), 'proposal is in the future');
    assert.ok(proposal.title.startsWith('Revision:'));
    assert.ok(proposal.date && proposal.startTime);

    const after = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    assert.strictEqual(after, before, 'proposal never writes');
  });

  it('proposal supports abandoned and high-difficulty reasons and rejects bad input', async () => {
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: missed.id, reason: 'abandoned' } })).status,
      200,
    );
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: missed.id, reason: 'high-difficulty' } })).status,
      200,
    );
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: missed.id, reason: 'boredom' } })).status,
      400,
    );
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: 'nope', reason: 'missed' } })).status,
      404,
    );
  });

  it('proposal refuses a completed source block', async () => {
    const done = await alice.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Completed', date: dateKey(-3), startTime: '09:00', durationMinutes: 60, completed: true },
    });
    const block = done.json.scheduleBlocks.find((b: any) => b.title === 'Completed');
    const res = await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: block.id, reason: 'missed' } });
    assert.strictEqual(res.status, 409);
  });

  it('accept validates, persists, and records history with the adaptive reason', async () => {
    const existingKeys = new Set((await alice.request('/api/schedule-blocks')).json.scheduleBlocks.map((b: any) => `${b.date}|${b.startTime}`));
    const proposal = (await alice.request('/api/adaptive/proposals', { method: 'POST', body: { scheduleBlockId: missed.id, reason: 'missed' } })).json.proposal;
    assert.ok(!existingKeys.has(`${proposal.date}|${proposal.startTime}`), 'proposal slot is genuinely free');

    const { status, json } = await alice.request('/api/adaptive/proposals/accept', {
      method: 'POST',
      body: { sourceBlockId: missed.id, reason: 'missed', topicId: proposal.topicId, title: proposal.title, date: proposal.date, startTime: proposal.startTime, durationMinutes: proposal.durationMinutes },
    });
    assert.strictEqual(status, 201);
    const newBlock = json.scheduleBlocks.find((b: any) => b.title === proposal.title);
    assert.ok(newBlock);

    const changes = await alice.request(`/api/schedule-changes?blockId=${newBlock.id}`);
    const change = changes.json.scheduleChanges.find((c: any) => c.field === 'created' && c.blockId === newBlock.id);
    assert.ok(change, 'a created history row exists for the accepted proposal');
    assert.strictEqual(change.reason, 'adaptive-missed');
    const parsed = JSON.parse(change.newValue);
    assert.strictEqual(parsed.date, proposal.date);
    assert.strictEqual(parsed.startTime, proposal.startTime);
    assert.strictEqual(parsed.durationMinutes, proposal.durationMinutes);
  });

  it('accept rejects overlapping slots without persisting', async () => {
    const before = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    const changesBefore = (await alice.request('/api/schedule-changes')).json.scheduleChanges.length;
    const res = await alice.request('/api/adaptive/proposals/accept', {
      method: 'POST',
      body: { sourceBlockId: missed.id, reason: 'missed', topicId, title: 'Overlap', date: dateKey(-1), startTime: '09:00', durationMinutes: 60 },
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length, before);
    assert.strictEqual((await alice.request('/api/schedule-changes')).json.scheduleChanges.length, changesBefore);
  });

  it('accept refuses foreign topics, foreign sources, and bad reasons', async () => {
    const bobTopic = (await bob.request('/api/topics')).json.topics[0].id;
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals/accept', {
        method: 'POST',
        body: { sourceBlockId: missed.id, reason: 'missed', topicId: bobTopic, title: 'Sneak', date: dateKey(1), startTime: '09:00', durationMinutes: 30 },
      })).status,
      404,
    );
    assert.strictEqual(
      (await bob.request('/api/adaptive/proposals/accept', {
        method: 'POST',
        body: { sourceBlockId: missed.id, reason: 'missed', topicId: bobTopic, title: 'Sneak', date: dateKey(1), startTime: '09:00', durationMinutes: 30 },
      })).status,
      404,
      'cross-user source block is not visible',
    );
    assert.strictEqual(
      (await alice.request('/api/adaptive/proposals/accept', {
        method: 'POST',
        body: { sourceBlockId: missed.id, reason: 'wrong', topicId, title: 'X', date: dateKey(1), startTime: '09:00', durationMinutes: 30 },
      })).status,
      400,
    );
  });

  it('reject leaves the schedule completely unchanged', async () => {
    const blocksBefore = (await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length;
    const changesBefore = (await alice.request('/api/schedule-changes')).json.scheduleChanges.length;

    const { status, json } = await alice.request('/api/adaptive/proposals/reject', {
      method: 'POST',
      body: { sourceBlockId: missed.id, reason: 'missed' },
    });
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(json, { ok: true });
    assert.strictEqual((await alice.request('/api/schedule-blocks')).json.scheduleBlocks.length, blocksBefore);
    assert.strictEqual((await alice.request('/api/schedule-changes')).json.scheduleChanges.length, changesBefore, 'no history row on rejection');

    assert.strictEqual(
      (await bob.request('/api/adaptive/proposals/reject', { method: 'POST', body: { sourceBlockId: missed.id, reason: 'missed' } })).status,
      404,
    );
  });
});

describe('session and feedback persistence for adaptive evidence', () => {
  let server: TestServer;
  let client: Api;
  let topicId: string;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('session@feedback.com', 'secret123');
    client.token = token;
    topicId = await seedTopic(client, 'Dynamic Programming');
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('persists a session lifecycle including abandonment with measured duration', async () => {
    const block = (await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'DP Focus', date: dateKey(0), startTime: '10:00', durationMinutes: 45 },
    })).json.scheduleBlocks[0];

    const started = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: block.id, durationMinutes: 45 } });
    assert.strictEqual(started.status, 201);
    const sessionId = started.json.studySession.id;

    const paused = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'paused', actualDurationSeconds: 180 } });
    assert.strictEqual(paused.status, 200);

    const resumed = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'active', actualDurationSeconds: 60 } });
    assert.strictEqual(resumed.status, 200);

    const abandoned = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'stopped', actualDurationSeconds: 720 } });
    assert.strictEqual(abandoned.status, 200);

    const sessions = (await client.request('/api/study-sessions')).json.studySessions;
    const saved = sessions.find((s: any) => s.id === sessionId);
    assert.ok(saved);
    assert.strictEqual(saved.status, 'stopped');
    assert.ok(saved.endedAt);
    assert.strictEqual(saved.actualDurationSeconds, 180 + 60 + 720, 'measured seconds accumulate across the lifecycle');
  });

  it('persists session feedback with focus/difficulty/progress/notes', async () => {
    const block = (await client.request('/api/schedule-blocks')).json.scheduleBlocks[0];
    const sessionId = (await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: block.id, durationMinutes: 45 } })).json.studySession.id;

    const res = await client.request('/api/feedback', {
      method: 'POST',
      body: { sessionId, score: 6, maxMarks: 10, source: 'manual', focus: 70, difficulty: 'hard', perceivedProgress: 40, notes: 'Lost focus after 10 minutes' },
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.feedback.sessionId, sessionId);
    assert.strictEqual(res.json.feedback.focus, 70);
    assert.strictEqual(res.json.feedback.difficulty, 'hard');
    assert.strictEqual(res.json.feedback.perceivedProgress, 40);
    assert.strictEqual(res.json.feedback.notes, 'Lost focus after 10 minutes');

    const saved = (await client.request('/api/feedback')).json.feedback.find((f: any) => f.sessionId === sessionId);
    assert.ok(saved);
    assert.deepStrictEqual({ focus: saved.focus, difficulty: saved.difficulty, perceivedProgress: saved.perceivedProgress, notes: saved.notes },
      { focus: 70, difficulty: 'hard', perceivedProgress: 40, notes: 'Lost focus after 10 minutes' });

    assert.strictEqual(
      (await client.request('/api/feedback', { method: 'POST', body: { score: 5, maxMarks: 10, difficulty: 'extreme' } })).status,
      400,
    );
    assert.strictEqual(
      (await client.request('/api/feedback', { method: 'POST', body: { score: 5, maxMarks: 10, focus: 101 } })).status,
      400,
    );
    assert.strictEqual(
      (await client.request('/api/feedback', { method: 'POST', body: { score: 5, maxMarks: 10, sessionId: 'nope' } })).status,
      404,
    );
  });
});