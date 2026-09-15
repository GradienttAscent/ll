import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { parseSchedulingAssistantIntent } from '../schedulingAssistant';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

function dateAfterToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('scheduling assistant parser', () => {
  const currentTime = new Date('2026-09-14T10:00:00.000Z');

  it('recognizes scheduling actions and queries deterministically', () => {
    assert.deepStrictEqual(parseSchedulingAssistantIntent('I cannot study Friday evening', currentTime), {
      type: 'unavailable_period', sourceDate: '2026-09-18', period: 'evening',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Move DBMS to tomorrow afternoon', currentTime), {
      type: 'move_topic', topicQuery: 'dbms', targetDate: '2026-09-15', period: 'afternoon',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Move my 7 PM session to 4 PM', currentTime), {
      type: 'move_time', sourceDate: '2026-09-14', sourceTime: '19:00', targetDate: '2026-09-14', targetTime: '16:00',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('I cannot study tomorrow morning', currentTime), {
      type: 'unavailable_period', sourceDate: '2026-09-15', period: 'morning',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Move OS to Friday evening', currentTime), {
      type: 'move_topic', topicQuery: 'os', targetDate: '2026-09-18', period: 'evening',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Move AI study blocks to Wednesday 2 PM', currentTime), {
      type: 'move_topic', topicQuery: 'ai study blocks', targetDate: '2026-09-16', targetTime: '14:00', targetTimeMode: 'exact',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Move all my DSA study sessions to after 6 PM', currentTime), {
      type: 'move_topic', topicQuery: 'all dsa study sessions', targetTime: '18:00', targetTimeMode: 'after', allMatches: true,
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Make DBMS shorter', currentTime), {
      type: 'shorten_topic', topicQuery: 'dbms', sourceDate: undefined,
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('When do I study DBMS?', currentTime), {
      type: 'query_schedule', topicQuery: 'dbms',
    });
    assert.deepStrictEqual(parseSchedulingAssistantIntent("What's my next session?", currentTime), { type: 'query_schedule' });
    assert.deepStrictEqual(parseSchedulingAssistantIntent('Explain binary trees', currentTime), { type: 'unsupported' });
  });
});

describe('scheduling assistant API', () => {
  let server: TestServer;
  let client: Api;
  let topicId: string;
  let unavailableBlockIds: string[];
  const tomorrow = dateAfterToday(1);

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('assistant@example.com', 'secret123');
    client.token = token;
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST', body: { topics: [{ name: 'DBMS' }, { name: 'Completed Only' }] },
    });
    topicId = topics.json.topics.find((topic: any) => topic.name === 'DBMS').id;
    const completedTopicId = topics.json.topics.find((topic: any) => topic.name === 'Completed Only').id;
    const created = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST', body: {
        scheduleBlocks: [
          { topicId, title: 'DBMS morning', date: tomorrow, startTime: '08:00', durationMinutes: 60 },
          { topicId, title: 'DBMS evening', date: tomorrow, startTime: '17:00', durationMinutes: 60 },
          { topicId, title: 'DBMS late evening', date: tomorrow, startTime: '19:00', durationMinutes: 60 },
          { topicId: completedTopicId, title: 'Finished only', date: tomorrow, startTime: '10:00', durationMinutes: 60 },
        ]
      },
    });
    unavailableBlockIds = created.json.scheduleBlocks
      .filter((block: any) => block.title === 'DBMS evening' || block.title === 'DBMS late evening')
      .map((block: any) => block.id);
    const completedBlockId = created.json.scheduleBlocks.find((block: any) => block.title === 'Finished only').id;
    assert.strictEqual((await client.request(`/api/schedule-blocks/${completedBlockId}`, { method: 'PATCH', body: { completed: true } })).status, 200);
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  async function blocks() {
    return (await client.request('/api/schedule-blocks')).json.scheduleBlocks as any[];
  }

  it('previews an unavailable period and cancellation performs no writes', async () => {
    const before = await blocks();
    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'I cannot study tomorrow evening' },
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.json.preview.changes.length, 2);
    assert.deepStrictEqual(preview.json.preview.changes.map((change: any) => change.blockId).sort(), unavailableBlockIds.sort());
    const replacements = preview.json.preview.changes.map((change: any) => change.proposed);
    assert.notStrictEqual(`${replacements[0].date} ${replacements[0].startTime}`, `${replacements[1].date} ${replacements[1].startTime}`);
    assert.deepStrictEqual(await blocks(), before);
    assert.strictEqual((await client.request('/api/scheduling-assistant/cancel', { method: 'POST' })).status, 200);
    assert.deepStrictEqual(await blocks(), before);
  });

  it('confirms a regenerated safe preview atomically and records history', async () => {
    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'I cannot study tomorrow evening' },
    });
    const confirmed = await client.request('/api/scheduling-assistant/confirm', {
      method: 'POST', body: { message: 'I cannot study tomorrow evening', changes: preview.json.preview.changes },
    });
    assert.strictEqual(confirmed.status, 200);
    for (const blockId of unavailableBlockIds) {
      const moved = confirmed.json.scheduleBlocks.find((block: any) => block.id === blockId);
      assert.notStrictEqual(moved.date, tomorrow);
      const changes = await client.request(`/api/schedule-changes?blockId=${blockId}`);
      assert.ok(changes.json.scheduleChanges.some((change: any) => change.field === 'conversational_reschedule'));
    }
  });

  it('returns owned structured ambiguity matches and previews only the selected clarification', async () => {
    const ambiguous = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move DBMS to tomorrow' },
    });
    assert.strictEqual(ambiguous.status, 200);
    assert.strictEqual(ambiguous.json.preview.changes.length, 0);
    assert.ok(ambiguous.json.preview.matches.length > 1);
    assert.ok(ambiguous.json.preview.matches.every((match: any) => match.blockId && match.topicName === 'DBMS'));
    const selected = ambiguous.json.preview.matches[0];
    const before = await blocks();
    const clarified = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move DBMS to tomorrow', selectedBlockId: selected.blockId },
    });
    assert.strictEqual(clarified.status, 200);
    assert.strictEqual(clarified.json.preview.changes.length, 1);
    assert.strictEqual(clarified.json.preview.changes[0].blockId, selected.blockId);
    assert.deepStrictEqual(await blocks(), before);

    const other = new Api(server.baseUrl);
    const { token } = await other.register('assistant-ambiguity-other@example.com', 'secret123');
    other.token = token;
    const foreignAttempt = await other.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move DBMS to tomorrow', selectedBlockId: selected.blockId },
    });
    assert.strictEqual(foreignAttempt.status, 200);
    assert.strictEqual(foreignAttempt.json.preview.matches, undefined);
    assert.strictEqual(foreignAttempt.json.preview.changes.length, 0);
  });

  it('does not generate changes for completed blocks or mutate schedule queries', async () => {
    const before = await blocks();
    const completed = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move Completed Only to tomorrow afternoon' },
    });
    assert.strictEqual(completed.status, 200);
    assert.strictEqual(completed.json.preview.changes.length, 0);
    const query = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'When do I study DBMS?' },
    });
    assert.strictEqual(query.status, 200);
    assert.strictEqual(query.json.preview.changes.length, 0);
    assert.deepStrictEqual(await blocks(), before);
  });

  it('builds non-mutating previews for topic moves, shorter sessions, and time moves', async () => {
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST', body: { topics: [{ name: 'Move Demo' }, { name: 'Short Demo' }, { name: 'Time Demo' }] },
    });
    const topicIdFor = (name: string) => topics.json.topics.find((topic: any) => topic.name === name).id;
    assert.strictEqual((await client.request('/api/schedule-blocks/bulk', {
      method: 'POST', body: {
        scheduleBlocks: [
          { topicId: topicIdFor('Move Demo'), title: 'Move Demo session', date: tomorrow, startTime: '13:00', durationMinutes: 60 },
          { topicId: topicIdFor('Short Demo'), title: 'Short Demo session', date: tomorrow, startTime: '11:00', durationMinutes: 90 },
          { topicId: topicIdFor('Time Demo'), title: 'Time Demo session', date: tomorrow, startTime: '20:00', durationMinutes: 60 },
        ]
      },
    })).status, 201);
    const before = await blocks();
    const move = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move Move Demo to tomorrow evening' },
    });
    const shorten = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Make Short Demo shorter' },
    });
    const timeMove = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: "Shift tomorrow's 8 PM session to 9 PM" },
    });
    assert.strictEqual(move.status, 200);
    assert.strictEqual(move.json.preview.changes[0].proposed.date, tomorrow);
    assert.ok(move.json.preview.changes[0].proposed.startTime >= '17:00');
    assert.strictEqual(shorten.status, 200);
    assert.strictEqual(shorten.json.preview.changes[0].proposed.durationMinutes, 45);
    assert.strictEqual(timeMove.status, 200);
    assert.strictEqual(timeMove.json.preview.changes[0].proposed.startTime, '21:00');
    assert.deepStrictEqual(await blocks(), before);
  });

  it('rejects a stale multi-block confirmation without applying a partial update', async () => {
    const topic = await client.request('/api/topics', { method: 'POST', body: { name: 'Stale Demo' } });
    const staleTopicId = topic.json.topics.find((item: any) => item.name === 'Stale Demo').id;
    assert.strictEqual((await client.request('/api/schedule-blocks', {
      method: 'POST', body: { topicId: staleTopicId, title: 'Stale session', date: tomorrow, startTime: '16:00', durationMinutes: 60 },
    })).status, 201);
    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move Stale Demo to tomorrow evening' },
    });
    assert.strictEqual(preview.status, 200);
    const proposed = preview.json.preview.changes[0].proposed;
    assert.strictEqual((await client.request('/api/schedule-blocks', {
      method: 'POST', body: { topicId: staleTopicId, title: 'Post-preview conflict', ...proposed },
    })).status, 201);
    const before = await blocks();
    const confirmed = await client.request('/api/scheduling-assistant/confirm', {
      method: 'POST', body: { message: 'Move Stale Demo to tomorrow evening', changes: preview.json.preview.changes },
    });
    assert.strictEqual(confirmed.status, 409);
    assert.deepStrictEqual(await blocks(), before);
  });

  it('does not let another user confirm changes for this user', async () => {
    const topic = await client.request('/api/topics', { method: 'POST', body: { name: 'Private Demo' } });
    const privateTopicId = topic.json.topics.find((item: any) => item.name === 'Private Demo').id;
    assert.strictEqual((await client.request('/api/schedule-blocks', {
      method: 'POST', body: { topicId: privateTopicId, title: 'Private session', date: tomorrow, startTime: '14:00', durationMinutes: 60 },
    })).status, 201);
    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Move Private Demo to tomorrow evening' },
    });
    assert.strictEqual(preview.json.preview.changes.length, 1);
    const other = new Api(server.baseUrl);
    const { token } = await other.register('assistant-other@example.com', 'secret123');
    other.token = token;
    const before = await blocks();
    const attempted = await other.request('/api/scheduling-assistant/confirm', {
      method: 'POST', body: { message: 'Move Private Demo to tomorrow evening', changes: preview.json.preview.changes },
    });
    assert.strictEqual(attempted.status, 409);
    assert.deepStrictEqual(await blocks(), before);
  });

  it('answers full-day and next-session questions without writes', async () => {
    const before = await blocks();
    const dayQuery = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'What do I have tomorrow?' },
    });
    assert.strictEqual(dayQuery.status, 200);
    assert.match(dayQuery.json.preview.assistantMessage, /session/);
    assert.strictEqual(dayQuery.json.preview.changes.length, 0);
    const next = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: "What's my next session?" },
    });
    assert.strictEqual(next.status, 200);
    assert.match(next.json.preview.assistantMessage, /Your next session is/);
    assert.deepStrictEqual(await blocks(), before);
  });

  it('reports no upcoming sessions for an empty schedule', async () => {
    const empty = new Api(server.baseUrl);
    const { token } = await empty.register('assistant-empty@example.com', 'secret123');
    empty.token = token;
    const response = await empty.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: "What's my next session?" },
    });
    assert.strictEqual(response.status, 200);
    assert.match(response.json.preview.assistantMessage, /do not have any upcoming/);
  });
});
