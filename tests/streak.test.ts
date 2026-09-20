import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { closeDatabase, getDatabase, initDatabase } from '../db';
import { computeStudyStreak, setDb } from '../services';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

const utcDayKey = (offsetDays: number): string => {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return base.toISOString().slice(0, 10);
};

const isoAtNoon = (dayKey: string): string => `${dayKey}T12:00:00.000Z`;

let blockSeq = 0;

async function seedSession(client: Api, topicId: string, status: 'completed' | 'stopped', endedAtIso: string): Promise<string> {
  const startHour = 8 + (blockSeq % 12);
  blockSeq += 1;
  const startTime = `${String(startHour).padStart(2, '0')}:00`;
  const blockTitle = `Block ${Math.random()}`;
  const block = await client.request('/api/schedule-blocks', {
    method: 'POST',
    body: { topicId, title: blockTitle, date: '2099-01-01', startTime, durationMinutes: 30 },
  });
  assert.strictEqual(block.status, 201);
  const blockId = block.json.scheduleBlocks.find((item: any) => item.title === blockTitle).id;
  const created = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: blockId, durationMinutes: 30 } });
  assert.strictEqual(created.status, 201);
  const sessionId = created.json.studySession.id;
  const patched = await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status, actualDurationSeconds: 600 } });
  assert.strictEqual(patched.status, 200);
  (await getDatabase())
    .prepare('UPDATE study_sessions SET started_at = ?, ended_at = ? WHERE id = ?')
    .run(endedAtIso, endedAtIso, sessionId);
  return sessionId;
}

async function seedCompletedOn(client: Api, topicId: string, dayKey: string): Promise<string> {
  return seedSession(client, topicId, 'completed', isoAtNoon(dayKey));
}

async function newUser(): Promise<{ client: Api; userId: string; topicId: string }> {
  const client = new Api(server.baseUrl);
  const { token, user } = await client.register(`streak-${Math.random()}@example.com`, 'secret123');
  client.token = token;
  const topics = await client.request('/api/topics/bulk', {
    method: 'POST',
    body: { topics: [{ name: `Streak Topic ${Math.random()}` }] },
  });
  assert.strictEqual(topics.status, 201);
  return { client, userId: user.id, topicId: topics.json.topics[0].id };
}

let server: TestServer;

describe('study streak', () => {
  before(async () => {
    server = await createTestServer();
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('requires authentication', async () => {
    const anonymous = new Api(server.baseUrl);
    assert.strictEqual((await anonymous.request('/api/study-streak')).status, 401);
  });

  it('returns a zero streak for a user with no completed sessions', async () => {
    const { client } = await newUser();
    const { status, json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(json.streak, { current: 0, longest: 0 });
  });

  it('counts a single completed session as one day', async () => {
    const { client, topicId } = await newUser();
    await seedCompletedOn(client, topicId, utcDayKey(0));
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 1, longest: 1 });
  });

  it('counts multiple sessions on the same day only once', async () => {
    const { client, topicId } = await newUser();
    const today = utcDayKey(0);
    await seedCompletedOn(client, topicId, today);
    await seedCompletedOn(client, topicId, today);
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 1, longest: 1 });
  });

  it('counts consecutive days including today', async () => {
    const { client, topicId } = await newUser();
    await seedCompletedOn(client, topicId, utcDayKey(-2));
    await seedCompletedOn(client, topicId, utcDayKey(-1));
    await seedCompletedOn(client, topicId, utcDayKey(0));
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 3, longest: 3 });
  });

  it('resets the current streak when a day is missed but keeps the longest', async () => {
    const { client, topicId } = await newUser();
    await seedCompletedOn(client, topicId, utcDayKey(-3));
    await seedCompletedOn(client, topicId, utcDayKey(-2));
    await seedCompletedOn(client, topicId, utcDayKey(0));
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 1, longest: 2 });
  });

  it('keeps the current streak alive through yesterday when today has no session', async () => {
    const { client, topicId } = await newUser();
    await seedCompletedOn(client, topicId, utcDayKey(-3));
    await seedCompletedOn(client, topicId, utcDayKey(-2));
    await seedCompletedOn(client, topicId, utcDayKey(-1));
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 3, longest: 3 });
  });

  it('drops abandoned or stopped sessions entirely', async () => {
    const { client, topicId } = await newUser();
    await seedSession(client, topicId, 'stopped', isoAtNoon(utcDayKey(-1)));
    await seedSession(client, topicId, 'stopped', isoAtNoon(utcDayKey(0)));
    const { json } = await client.request('/api/study-streak?tzOffsetMinutes=0');
    assert.deepStrictEqual(json.streak, { current: 0, longest: 0 });
  });

  it('attribution shifts with the supplied timezone offset', async () => {
    const { client, topicId, userId } = await newUser();
    await seedSession(client, topicId, 'completed', '2026-09-14T23:30:00.000Z');
    await seedSession(client, topicId, 'completed', '2026-09-15T00:30:00.000Z');
    assert.strictEqual(computeStudyStreak(userId, 0).longest, 2);   // two distinct UTC days
    assert.strictEqual(computeStudyStreak(userId, 60).longest, 1);  // both wind up on the same local day (UTC-1)
  });

  it('scopes streaks to the authenticated user', async () => {
    const { client: alice, topicId: aliceTopic } = await newUser();
    const { client: bob, topicId: bobTopic } = await newUser();
    await seedCompletedOn(alice, aliceTopic, utcDayKey(0));
    const aliceStreak = (await alice.request('/api/study-streak?tzOffsetMinutes=0')).json.streak;
    assert.deepStrictEqual(aliceStreak, { current: 1, longest: 1 });
    const bobStreak = (await bob.request('/api/study-streak?tzOffsetMinutes=0')).json.streak;
    assert.deepStrictEqual(bobStreak, { current: 0, longest: 0 });
    await seedCompletedOn(bob, bobTopic, utcDayKey(0));
    assert.deepStrictEqual((await bob.request('/api/study-streak?tzOffsetMinutes=0')).json.streak, { current: 1, longest: 1 });
  });

  it('derives the streak from persisted records and survives a database restart', async () => {
    const { client, userId, topicId } = await newUser();
    await seedCompletedOn(client, topicId, utcDayKey(-1));
    await seedCompletedOn(client, topicId, utcDayKey(0));
    assert.deepStrictEqual(computeStudyStreak(userId, 0), { current: 2, longest: 2 });

    closeDatabase();
    await initDatabase();
    setDb(await getDatabase());

    const recomputed = computeStudyStreak(userId, 0);
    assert.deepStrictEqual(recomputed, { current: 2, longest: 2 });
    const viaApi = (await client.request('/api/study-streak?tzOffsetMinutes=0')).json.streak;
    assert.deepStrictEqual(viaApi, { current: 2, longest: 2 });
  });
});