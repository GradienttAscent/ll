import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';
import { buildAdaptiveProposal } from '../services';

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

describe('adaptive revision proposals', () => {
  let server: TestServer;
  let client: Api;
  let topicId: string;
  let userId: string;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token, user } = await client.register('adaptive@example.com', 'secret123');
    client.token = token;
    userId = user.id;
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Adaptive Graphs' }] },
    });
    topicId = topics.json.topics[0].id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function createSource(title: string, date: string, startTime = '10:00', durationMinutes = 120, stop = true) {
    const created = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title, date, startTime, durationMinutes },
    });
    assert.strictEqual(created.status, 201);
    const scheduleBlock = created.json.scheduleBlocks.find((item: any) => item.title === title);
    const session = await client.request('/api/study-sessions', {
      method: 'POST', body: { scheduleBlockId: scheduleBlock.id, durationMinutes },
    });
    assert.strictEqual(session.status, 201);
    if (stop) {
      assert.strictEqual((await client.request(`/api/study-sessions/${session.json.studySession.id}`, {
        method: 'PATCH', body: { status: 'stopped' },
      })).status, 200);
    }
    return { scheduleBlock, studySessionId: session.json.studySession.id };
  }

  async function generate(studySessionId: string) {
    return client.request('/api/adaptive-proposals', { method: 'POST', body: { studySessionId } });
  }

  async function scheduleBlocks() {
    return (await client.request('/api/schedule-blocks')).json.scheduleBlocks as any[];
  }

  it('generates a proposal from a stopped session without changing the schedule', async () => {
    const source = await createSource('Stopped source', '2026-11-01');
    const before = await scheduleBlocks();
    const generated = await generate(source.studySessionId);
    assert.strictEqual(generated.status, 200);
    assert.ok(generated.json.proposal);
    assert.strictEqual((await scheduleBlocks()).length, before.length);
  });

  it('does not generate a proposal from a non-stopped session', async () => {
    const source = await createSource('Active source', '2026-11-02', '10:00', 120, false);
    assert.strictEqual((await generate(source.studySessionId)).status, 409);
    assert.strictEqual((await client.request(`/api/study-sessions/${source.studySessionId}`, {
      method: 'PATCH', body: { status: 'stopped' },
    })).status, 200);
  });

  it('requires a successful explicit stop before proposal generation', async () => {
    const source = await createSource('Explicit stop source', '2026-11-30', '10:00', 120, false);
    assert.strictEqual((await generate(source.studySessionId)).status, 409);
    assert.strictEqual((await client.request(`/api/study-sessions/${source.studySessionId}`, {
      method: 'PATCH', body: { status: 'invalid' },
    })).status, 400);
    assert.strictEqual((await generate(source.studySessionId)).status, 409);
    assert.strictEqual((await client.request(`/api/study-sessions/${source.studySessionId}`, {
      method: 'PATCH', body: { status: 'stopped', actualDurationSeconds: 90 },
    })).status, 200);
    const session = (await client.request('/api/study-sessions')).json.studySessions.find((item: any) => item.id === source.studySessionId);
    assert.strictEqual(session.status, 'stopped');
    assert.strictEqual(session.actualDurationSeconds, 90);
    assert.strictEqual((await generate(source.studySessionId)).status, 200);
  });

  it('never returns a past slot when the source block is in the past', async () => {
    const source = await createSource('Past source', '2026-09-10', '10:00', 120);
    const now = new Date('2026-09-14T15:20:00.000Z');
    const result = buildAdaptiveProposal(userId, source.studySessionId, now);
    assert.ok(result.proposal);
    assert.strictEqual(result.proposal.proposedDate, '2026-09-14');
    assert.strictEqual(result.proposal.proposedStartTime, '15:30');
  });

  it('uses a future slot when a source block today has already finished', async () => {
    const source = await createSource('Finished today source', '2026-09-14', '08:00', 60);
    const now = new Date('2026-09-14T15:20:00.000Z');
    const result = buildAdaptiveProposal(userId, source.studySessionId, now);
    assert.ok(result.proposal);
    assert.strictEqual(result.proposal.proposedDate, '2026-09-14');
    assert.strictEqual(result.proposal.proposedStartTime, '15:30');
  });

  it('begins the next day when the current time is after planning hours', async () => {
    const source = await createSource('After hours source', '2026-09-13', '10:00', 60);
    const result = buildAdaptiveProposal(userId, source.studySessionId, new Date('2026-09-14T18:10:00.000Z'));
    assert.ok(result.proposal);
    assert.strictEqual(result.proposal.proposedDate, '2026-09-15');
    assert.strictEqual(result.proposal.proposedStartTime, '08:00');
  });

  it('uses the original topic and a strictly shorter duration', async () => {
    const source = await createSource('Topic source', '2026-11-03');
    const generated = await generate(source.studySessionId);
    const proposal = generated.json.proposal;
    assert.strictEqual(proposal.topicId, source.scheduleBlock.topicId);
    assert.strictEqual(proposal.topicName, 'Adaptive Graphs');
    assert.ok(proposal.proposedDurationMinutes > 0);
    assert.ok(proposal.proposedDurationMinutes < source.scheduleBlock.durationMinutes);
  });

  it('selects a slot that does not overlap stored blocks', async () => {
    const source = await createSource('Free slot source', '2026-11-04');
    assert.strictEqual((await client.request('/api/schedule-blocks', {
      method: 'POST', body: { topicId, title: 'Block first revision slot', date: '2026-11-04', startTime: '12:00', durationMinutes: 30 },
    })).status, 201);
    const proposal = (await generate(source.studySessionId)).json.proposal;
    const proposalStart = Number(proposal.proposedStartTime.slice(0, 2)) * 60 + Number(proposal.proposedStartTime.slice(3));
    const proposalEnd = proposalStart + proposal.proposedDurationMinutes;
    for (const block of await scheduleBlocks()) {
      if (block.date !== proposal.proposedDate) continue;
      const start = Number(block.startTime.slice(0, 2)) * 60 + Number(block.startTime.slice(3));
      const end = start + block.durationMinutes;
      assert.ok(start >= proposalEnd || proposalStart >= end, `${proposal.title} overlaps ${block.title}`);
    }
  });

  it('returns a clean no-proposal response when the search window is full', async () => {
    const source = await createSource('No slot source', '2026-11-10', '08:00', 60);
    const blockers = Array.from({ length: 14 }, (_, index) => {
      const day = 10 + index;
      return {
        topicId,
        title: `Full day ${index}`,
        date: `2026-11-${String(day).padStart(2, '0')}`,
        startTime: index === 0 ? '09:00' : '08:00',
        durationMinutes: index === 0 ? 540 : 600,
      };
    });
    assert.strictEqual((await client.request('/api/schedule-blocks/bulk', {
      method: 'POST', body: { scheduleBlocks: blockers },
    })).status, 201);
    const generated = await generate(source.studySessionId);
    assert.strictEqual(generated.status, 200);
    assert.strictEqual(generated.json.proposal, null);
    assert.match(generated.json.message, /No available revision slot/);
  });

  it('reject performs zero schedule writes', async () => {
    const source = await createSource('Reject source', '2026-11-25');
    const generated = await generate(source.studySessionId);
    assert.ok(generated.json.proposal);
    const before = await scheduleBlocks();
    assert.strictEqual((await client.request('/api/adaptive-proposals/reject', {
      method: 'POST', body: { studySessionId: source.studySessionId },
    })).status, 200);
    assert.strictEqual((await scheduleBlocks()).length, before.length);
    const regenerated = await generate(source.studySessionId);
    assert.strictEqual(regenerated.status, 200);
    assert.ok(regenerated.json.proposal);
  });

  it('accept creates one revision block and adaptive history', async () => {
    const source = await createSource('Accept source', '2026-11-26');
    const proposal = (await generate(source.studySessionId)).json.proposal;
    const before = await scheduleBlocks();
    const accepted = await client.request('/api/adaptive-proposals/accept', {
      method: 'POST',
      body: {
        studySessionId: source.studySessionId,
        proposedDate: proposal.proposedDate,
        proposedStartTime: proposal.proposedStartTime,
        proposedDurationMinutes: proposal.proposedDurationMinutes,
      },
    });
    assert.strictEqual(accepted.status, 201);
    assert.strictEqual((await scheduleBlocks()).length, before.length + 1);
    assert.strictEqual(accepted.json.scheduleBlock.topicId, topicId);
    const changes = await client.request(`/api/schedule-changes?blockId=${accepted.json.scheduleBlock.id}`);
    assert.ok(changes.json.scheduleChanges.some((change: any) => change.field === 'adaptive_revision'));
    const duplicate = await client.request('/api/adaptive-proposals/accept', {
      method: 'POST',
      body: {
        studySessionId: source.studySessionId,
        proposedDate: proposal.proposedDate,
        proposedStartTime: proposal.proposedStartTime,
        proposedDurationMinutes: proposal.proposedDurationMinutes,
      },
    });
    assert.strictEqual(duplicate.status, 409);
    assert.strictEqual((await scheduleBlocks()).length, before.length + 1);
  });

  it('revalidates a proposal when a conflict is created after generation', async () => {
    const source = await createSource('Conflict source', '2026-11-27');
    const proposal = (await generate(source.studySessionId)).json.proposal;
    assert.strictEqual((await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: {
        topicId,
        title: 'Post-generation conflict',
        date: proposal.proposedDate,
        startTime: proposal.proposedStartTime,
        durationMinutes: proposal.proposedDurationMinutes,
      },
    })).status, 201);
    const before = await scheduleBlocks();
    assert.strictEqual((await client.request('/api/adaptive-proposals/accept', {
      method: 'POST', body: {
        studySessionId: source.studySessionId,
        proposedDate: proposal.proposedDate,
        proposedStartTime: proposal.proposedStartTime,
        proposedDurationMinutes: proposal.proposedDurationMinutes,
      },
    })).status, 409);
    assert.strictEqual((await scheduleBlocks()).length, before.length);
  });

  it('treats completed blocks as conflicts during slot search', async () => {
    const source = await createSource('Completed conflict source', '2026-11-28', '10:00', 60);
    const blocker = await client.request('/api/schedule-blocks', {
      method: 'POST', body: { topicId, title: 'Completed conflict', date: '2026-11-28', startTime: '11:00', durationMinutes: 60 },
    });
    const blockerId = blocker.json.scheduleBlocks.find((item: any) => item.title === 'Completed conflict').id;
    assert.strictEqual((await client.request(`/api/schedule-blocks/${blockerId}`, {
      method: 'PATCH', body: { completed: true },
    })).status, 200);
    const proposal = (await generate(source.studySessionId)).json.proposal;
    assert.strictEqual(proposal.proposedStartTime, '12:00');
  });

  it('prevents another user from generating or applying a proposal for this session', async () => {
    const source = await createSource('Private source', '2026-11-29');
    const proposal = (await generate(source.studySessionId)).json.proposal;
    const other = new Api(server.baseUrl);
    const { token } = await other.register('other-adaptive@example.com', 'secret123');
    other.token = token;
    assert.strictEqual((await other.request('/api/adaptive-proposals', {
      method: 'POST', body: { studySessionId: source.studySessionId },
    })).status, 404);
    assert.strictEqual((await other.request('/api/adaptive-proposals/accept', {
      method: 'POST', body: {
        studySessionId: source.studySessionId,
        proposedDate: proposal.proposedDate,
        proposedStartTime: proposal.proposedStartTime,
        proposedDurationMinutes: proposal.proposedDurationMinutes,
      },
    })).status, 404);
  });
});
