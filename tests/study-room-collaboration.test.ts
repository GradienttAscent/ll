import { it, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createApp } from '../server';
import { closeDatabase, getDatabase } from '../db';
import { Api } from './helpers';

async function startServer(dbDir: string) {
  process.env.LAZYLIFT_DATA_DIR = dbDir;
  process.env.APP_PORT = '0';
  const { app } = await createApp();
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    // Keep-alive sockets outlive close() and would be reused by the next fetch, so drop them.
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

describe('Study Room collaboration', () => {
  let dbDir: string;
  let server: Awaited<ReturnType<typeof startServer>>;
  let host: Api;
  let guest: Api;
  let outsider: Api;
  let hostToken: string;
  let guestToken: string;
  let outsiderToken: string;

  before(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'lazylift-collab-'));
    server = await startServer(dbDir);
    const enrol = async (email: string, displayName: string) =>
      (await new Api(server.baseUrl).register(email, 'secret123', displayName)).token;
    hostToken = await enrol('host-collab@lazylift.app', 'Host User');
    guestToken = await enrol('guest-collab@lazylift.app', 'Guest User');
    outsiderToken = await enrol('out-collab@lazylift.app', 'Outsider');
  });
  after(async () => {
    await server?.close();
    closeDatabase();
    rmSync(dbDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Each test gets a freshly booted server over the same data directory, so persisted state from a
    // previous test (including the restart test) is exercised exactly like a real app relaunch.
    await server.close();
    server = await startServer(dbDir);
    host = new Api(server.baseUrl);
    guest = new Api(server.baseUrl);
    outsider = new Api(server.baseUrl);
    host.token = hostToken;
    guest.token = guestToken;
    outsider.token = outsiderToken;
  });

  const createRoom = async (overrides: Record<string, unknown> = {}) => {
    const response = await host.request('/api/study-rooms', {
      method: 'POST',
      body: { name: 'DSP Cohort', subject: 'DSP', topic: 'Fourier', ...overrides },
    });
    assert.strictEqual(response.status, 201, JSON.stringify(response.json));
    return response.json.room;
  };

  it('creates a room with the host as a member and keeps private rooms hidden', async () => {
    const room = await createRoom({ visibility: 'PRIVATE' });
    assert.strictEqual(room.name, 'DSP Cohort');
    assert.strictEqual(room.visibility, 'PRIVATE');
    assert.strictEqual(room.status, 'ACTIVE');
    assert.strictEqual(room.ownerName, 'Host User');
    assert.strictEqual(room.memberCount, 1);

    const discovered = await outsider.request('/api/study-rooms');
    assert.deepStrictEqual(discovered.json.rooms, []);
    assert.strictEqual((await outsider.request(`/api/study-rooms/${room.id}`)).status, 403);
  });

  it('finds rooms by subject and topic and enforces the participant limit', async () => {
    await createRoom({ name: 'Alpha Cohort', subject: 'Alpha Subject', topic: 'Alpha Topic' });
    const beta = await createRoom({ name: 'Beta Cohort', subject: 'Beta Subject', topic: 'Beta Topic', maxParticipants: 2 });

    const bySubject = await guest.request('/api/study-rooms?subject=Alpha Subject');
    assert.strictEqual(bySubject.json.rooms.length, 1);
    assert.strictEqual(bySubject.json.rooms[0].name, 'Alpha Cohort');

    const byTopic = await guest.request('/api/study-rooms?topic=Beta Topic');
    assert.strictEqual(byTopic.json.rooms.length, 1);
    assert.strictEqual(byTopic.json.rooms[0].id, beta.id);

    assert.strictEqual((await guest.request(`/api/study-rooms/${beta.id}/join`, { method: 'POST' })).status, 200);
    const full = await outsider.request(`/api/study-rooms/${beta.id}/join`, { method: 'POST' });
    assert.strictEqual(full.status, 409);
    assert.strictEqual(full.json.error, 'This study room is full.');
  });

  it('rejects duplicate joins, guest detail before joining, and unknown rooms', async () => {
    const room = await createRoom();
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' })).status, 409);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}`)).status, 403);
    assert.strictEqual((await guest.request('/api/study-rooms/does-not-exist')).status, 404);
  });

  it('runs one shared focus session with server timestamps and member presence', async () => {
    const room = await createRoom();
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });

    const empty = await host.request(`/api/study-rooms/${room.id}/sessions/current`);
    assert.strictEqual(empty.status, 200);
    assert.strictEqual(empty.json.session, null);

    const started = await host.request(`/api/study-rooms/${room.id}/sessions`, {
      method: 'POST',
      body: { durationMinutes: 25 },
    });
    assert.strictEqual(started.status, 201, JSON.stringify(started.json));
    const session = started.json.session;
    assert.strictEqual(session.phase, 'FOCUS');
    assert.strictEqual(session.status, 'ACTIVE');
    assert.strictEqual(session.durationSeconds, 1500);
    assert.strictEqual(session.startedByName, 'Host User');
    assert.ok(Date.parse(session.endsAt) > Date.parse(session.serverNow));

    // The host starts focusing, and the guest sees the same timer rather than a second one.
    assert.strictEqual(session.participants.length, 1);
    assert.strictEqual(session.currentParticipantCount, 1);
    assert.strictEqual(session.participants[0].state, 'FOCUSING');

    const guestView = await guest.request(`/api/study-rooms/${room.id}/sessions/current`);
    assert.strictEqual(guestView.json.session.id, session.id);
    assert.ok(Date.parse(guestView.json.session.endsAt) > Date.parse(guestView.json.session.serverNow));
    assert.strictEqual(guestView.json.session.currentParticipantCount, 1);

    const concurrent = await guest.request(`/api/study-rooms/${room.id}/sessions`, {
      method: 'POST',
      body: { durationMinutes: 10 },
    });
    assert.strictEqual(concurrent.status, 409);

    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/sessions/${session.id}/join`, { method: 'POST' })).status, 200);
    const both = await host.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(both.json.focusSession.currentParticipantCount, 2);
    assert.strictEqual(both.json.focusSession.participants.length, 2);
    assert.deepStrictEqual(
      both.json.focusSession.participants.map((participant: any) => participant.userId).sort(),
      both.json.members.map((member: any) => member.id).sort(),
    );
    assert.strictEqual(both.json.members.filter((member: any) => member.state === 'FOCUSING').length, 2);

    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/sessions/${session.id}/leave`, { method: 'POST' })).status, 200);
    const afterLeave = await host.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(afterLeave.json.focusSession.currentParticipantCount, 1);
    assert.strictEqual(afterLeave.json.focusSession.status, 'ACTIVE');
    assert.strictEqual(afterLeave.json.members.filter((member: any) => member.state === 'IN_ROOM').length, 1);
  });

  it('settles an expired session lazily and then allows the next phase', async () => {
    const room = await createRoom();
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });
    const started = await host.request(`/api/study-rooms/${room.id}/sessions`, {
      method: 'POST',
      body: { durationMinutes: 25 },
    });
    const sessionId = started.json.session.id;

    // Age the stored deadline instead of waiting out a real focus block: the point is that a
    // session nobody polled still settles, and never blocks the next one.
    const db = await getDatabase();
    db.prepare('UPDATE focus_sessions SET ends_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), sessionId);

    const settled = await host.request(`/api/study-rooms/${room.id}/sessions/current`);
    assert.strictEqual(settled.json.session, null);

    const breakSession = await host.request(`/api/study-rooms/${room.id}/sessions`, {
      method: 'POST',
      body: { durationMinutes: 5, phase: 'SHORT_BREAK' },
    });
    assert.strictEqual(breakSession.status, 201, JSON.stringify(breakSession.json));
    assert.strictEqual(breakSession.json.session.phase, 'SHORT_BREAK');
    assert.notStrictEqual(breakSession.json.session.id, sessionId);

    const onBreak = await host.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(onBreak.json.members.filter((member: any) => member.state === 'ON_BREAK').length, 1);

    const invalid = await host.request(`/api/study-rooms/${room.id}/sessions`, {
      method: 'POST',
      body: { durationMinutes: 5, phase: 'NAP' },
    });
    assert.strictEqual(invalid.status, 400);
  });

  it('lets only the host close a room and then blocks its session and doubt activity', async () => {
    const room = await createRoom();
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });
    await host.request(`/api/study-rooms/${room.id}/sessions`, { method: 'POST', body: { durationMinutes: 25 } });

    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/close`, { method: 'POST' })).status, 403);
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/close`, { method: 'POST' })).status, 200);

    const closed = await host.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(closed.json.room.status, 'CLOSED');
    assert.strictEqual(closed.json.focusSession, null);

    const discovery = await guest.request('/api/study-rooms');
    assert.ok(!discovery.json.rooms.some((item: any) => item.id === room.id));
    const history = await guest.request('/api/study-rooms?status=CLOSED');
    assert.strictEqual(history.json.rooms.length, 1);
    assert.strictEqual(history.json.rooms[0].id, room.id);

    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/sessions`, { method: 'POST', body: { durationMinutes: 5 } })).status, 409);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/doubts`, { method: 'POST', body: { title: 'Late?', content: 'Too late.' } })).status, 409);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' })).status, 409);
  });

  it('keeps a member count in sync when somebody leaves and refuses to let the host leave', async () => {
    const room = await createRoom();
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}`)).json.room.memberCount, 2);

    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/leave`, { method: 'POST' })).status, 409);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/leave`, { method: 'POST' })).status, 200);
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}`)).json.room.memberCount, 1);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}`)).status, 403);
  });

  it('walks a doubt from question to accepted answer to resolution', async () => {
    const room = await createRoom();
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });

    assert.strictEqual((await outsider.request(`/api/study-rooms/${room.id}/doubts`, { method: 'POST', body: { title: 'Hi', content: 'No.' } })).status, 403);
    assert.strictEqual((await guest.request(`/api/study-rooms/${room.id}/doubts`, { method: 'POST', body: { title: ' ', content: 'Blank title.' } })).status, 400);

    const asked = await guest.request(`/api/study-rooms/${room.id}/doubts`, {
      method: 'POST',
      body: { title: 'Why is this transform invertible?', content: 'I follow the algebra but not the step before it.' },
    });
    assert.strictEqual(asked.status, 201, JSON.stringify(asked.json));
    const doubt = asked.json.doubt;
    assert.strictEqual(doubt.status, 'OPEN');
    assert.strictEqual(doubt.answerCount, 0);
    assert.strictEqual(doubt.authorName, 'Guest User');

    const detail = await host.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(detail.json.doubts.length, 1);
    assert.strictEqual(detail.json.doubts[0].id, doubt.id);

    const outsiderRead = await outsider.request(`/api/study-doubts/${doubt.id}`);
    assert.strictEqual(outsiderRead.status, 403);
    assert.strictEqual((await guest.request('/api/study-doubts/not-a-doubt')).status, 404);

    const answered = await host.request(`/api/study-doubts/${doubt.id}/answers`, {
      method: 'POST',
      body: { content: 'Invertibility needs an orthonormal basis, so the adjoint is also the inverse.' },
    });
    assert.strictEqual(answered.status, 201, JSON.stringify(answered.json));
    assert.strictEqual(answered.json.doubt.answerCount, 1);
    const answer = answered.json.doubt.answers[0];
    assert.strictEqual(answer.isAccepted, false);
    assert.strictEqual(answer.authorName, 'Host User');

    const second = await guest.request(`/api/study-doubts/${doubt.id}/answers`, {
      method: 'POST',
      body: { content: 'Try expanding the sum and applying the orthogonality relation.' },
    });
    assert.strictEqual(second.status, 201);
    assert.strictEqual(second.json.doubt.answerCount, 2);

    // Only the asker decides which answer settled it.
    const foreignAccept = await host.request(`/api/study-doubts/${doubt.id}/accept-answer`, {
      method: 'POST',
      body: { answerId: answer.id },
    });
    assert.strictEqual(foreignAccept.status, 403);

    const accepted = await guest.request(`/api/study-doubts/${doubt.id}/accept-answer`, {
      method: 'POST',
      body: { answerId: answer.id },
    });
    assert.strictEqual(accepted.status, 200, JSON.stringify(accepted.json));
    assert.strictEqual(accepted.json.doubt.acceptedAnswerId, answer.id);
    assert.strictEqual(accepted.json.doubt.answers.filter((item: any) => item.isAccepted).length, 1);
    assert.strictEqual(accepted.json.doubt.answers.filter((item: any) => item.isAccepted)[0].id, answer.id);

    // Accepting pins the answer; closing the question is a separate, deliberate step.
    const resolved = await guest.request(`/api/study-doubts/${doubt.id}/resolve`, { method: 'POST' });
    assert.strictEqual(resolved.status, 200, JSON.stringify(resolved.json));
    assert.strictEqual(resolved.json.doubt.status, 'RESOLVED');
    assert.notStrictEqual(resolved.json.doubt.resolvedAt, null);

    const foreignResolve = await host.request(`/api/study-doubts/${doubt.id}/resolve`, { method: 'POST' });
    assert.strictEqual(foreignResolve.status, 403);
    assert.strictEqual((await guest.request(`/api/study-doubts/${doubt.id}/resolve`, { method: 'POST' })).status, 409);

    // A resolved doubt stays readable but drops out of the open list.
    const afterClose = await host.request(`/api/study-rooms/${room.id}/doubts`);
    assert.strictEqual(afterClose.status, 200);
    assert.strictEqual(afterClose.json.doubts.length, 1);
    assert.strictEqual(afterClose.json.doubts[0].status, 'RESOLVED');
  });

  it('validates room, session, and doubt input', async () => {
    assert.strictEqual((await host.request('/api/study-rooms', { method: 'POST', body: { name: '  ' } })).status, 400);
    assert.strictEqual((await host.request('/api/study-rooms', { method: 'POST', body: { name: 'Odd', maxParticipants: 1 } })).status, 400);
    assert.strictEqual((await host.request('/api/study-rooms', { method: 'POST', body: { name: 'Odd', maxParticipants: 500 } })).status, 400);
    assert.strictEqual((await host.request('/api/study-rooms', { method: 'POST', body: { name: 'Odd', visibility: 'SECRET' } })).status, 400);

    const room = await createRoom();
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/sessions`, { method: 'POST', body: { durationMinutes: 1 } })).status, 400);
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/sessions`, { method: 'POST', body: { durationMinutes: 500 } })).status, 400);
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/doubts`, { method: 'POST', body: { title: 'x'.repeat(201), content: 'Long.' } })).status, 400);
    assert.strictEqual((await host.request(`/api/study-rooms/${room.id}/doubts`, { method: 'POST', body: { title: 'Valid', content: '' } })).status, 400);
  });

  it('keeps rooms, focus sessions, and doubts after a restart', async () => {
    const room = await createRoom({ description: 'Persisted room.', subject: 'Persist Subject' });
    await guest.request(`/api/study-rooms/${room.id}/join`, { method: 'POST' });
    await host.request(`/api/study-rooms/${room.id}/sessions`, { method: 'POST', body: { durationMinutes: 25 } });
    await guest.request(`/api/study-rooms/${room.id}/doubts`, {
      method: 'POST',
      body: { title: 'Still here after restart?', content: 'Checking persistence.' },
    });

    await server.close();
    closeDatabase();
    server = await startServer(dbDir);

    const resumedGuest = new Api(server.baseUrl);
    await resumedGuest.signInAs('guest-collab@lazylift.app', 'secret123');
    const reloaded = await resumedGuest.request(`/api/study-rooms/${room.id}`);
    assert.strictEqual(reloaded.status, 200);
    assert.strictEqual(reloaded.json.room.description, 'Persisted room.');
    assert.strictEqual(reloaded.json.members.length, 2);
    assert.strictEqual(reloaded.json.focusSession.status, 'ACTIVE');
    assert.strictEqual(reloaded.json.focusSession.phase, 'FOCUS');
    assert.strictEqual(reloaded.json.doubts.length, 1);
    assert.strictEqual(reloaded.json.doubts[0].title, 'Still here after restart?');
  });
});
