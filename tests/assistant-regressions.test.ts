import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';
import { parseSchedulingAssistantIntent } from '../schedulingAssistant';
import { confirmSchedulingAssistant, previewSchedulingAssistant } from '../services';

function dateAfterToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function registerClient(server: TestServer, emailPrefix: string): Promise<Api> {
  const client = new Api(server.baseUrl);
  const { token } = await client.register(`${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, 'secret123');
  client.token = token;
  return client;
}

describe('hardcoded reschedule requests execute deterministically', () => {
  let server: TestServer;
  // Anchor every scenario to a fixed clock a few days out so "today" is stable and every block is
  // genuinely in the future for both the fixed-time preview and the real-clock confirmation.
  const D = dateAfterToday(3);
  const D1 = dateAfterToday(4);
  const fixedNow = new Date(`${D}T00:00:00.000Z`);

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await void server.close();
    removeTempDir(server.dbDir);
  });

  async function newStudent(prefix: string): Promise<{ client: Api; userId: string }> {
    const client = new Api(server.baseUrl);
    const reg = await client.register(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, 'secret123');
    client.token = reg.token;
    return { client, userId: reg.user.id };
  }

  async function seedBlocks(
    client: Api,
    blocks: Array<{ title: string; date: string; startTime: string; durationMinutes: number }>,
  ): Promise<any[]> {
    const names = [...new Set(blocks.map((block) => block.title))];
    const topics = await client.request('/api/topics/bulk', { method: 'POST', body: { topics: names.map((name) => ({ name })) } });
    const idFor = (name: string) => topics.json.topics.find((topic: any) => topic.name === name).id;
    const created = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST', body: { scheduleBlocks: blocks.map((block) => ({ topicId: idFor(block.title), ...block })) },
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    return created.json.scheduleBlocks;
  }

  it('moves the named 8:30 block to 9:30', async () => {
    const { client, userId } = await newStudent('resched-clock-move');
    await seedBlocks(client, [{ title: 'Clock Move', date: D, startTime: '08:30', durationMinutes: 60 }]);

    const intent = parseSchedulingAssistantIntent('Move the 8:30 block to 9:30.', fixedNow);
    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 1);
    assert.strictEqual(preview.changes[0].proposed.date, D);
    assert.strictEqual(preview.changes[0].proposed.startTime, '09:30');

    const saved = confirmSchedulingAssistant(userId, intent, preview.changes);
    assert.strictEqual(saved.find((block) => block.title === 'Clock Move')!.startTime, '09:30');
  });

  it('moves the 8:30 session to 9:30 and ripples every following block', async () => {
    const { client, userId } = await newStudent('resched-reorder');
    await seedBlocks(client, [
      { title: 'Ripple A', date: D, startTime: '08:30', durationMinutes: 60 },
      { title: 'Ripple B', date: D, startTime: '09:30', durationMinutes: 60 },
      { title: 'Ripple C', date: D, startTime: '10:30', durationMinutes: 60 },
    ]);

    const intent = parseSchedulingAssistantIntent('Move the 8:30 session to 9:30 and reorder every following block.', fixedNow);
    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 3);
    const proposedByTitle = new Map(preview.changes.map((change) => [change.topicName, change.proposed.startTime]));
    assert.strictEqual(proposedByTitle.get('Ripple A'), '09:30');
    assert.strictEqual(proposedByTitle.get('Ripple B'), '10:30');
    assert.strictEqual(proposedByTitle.get('Ripple C'), '11:30');

    const saved = confirmSchedulingAssistant(userId, intent, preview.changes);
    assert.strictEqual(saved.find((block) => block.title === 'Ripple B')!.startTime, '10:30');
  });

  it("moves today's sessions to tomorrow", async () => {
    const { client, userId } = await newStudent('resched-day');
    await seedBlocks(client, [
      { title: 'Today Move A', date: D, startTime: '09:00', durationMinutes: 60 },
      { title: 'Today Move B', date: D, startTime: '11:00', durationMinutes: 60 },
    ]);

    const intent = parseSchedulingAssistantIntent("Move today's session to tomorrow.", fixedNow);
    assert.strictEqual(intent.type, 'reschedule_day');
    assert.strictEqual(intent.sourceDate, D);
    assert.strictEqual(intent.shiftDays, 1);

    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 2);
    assert.ok(preview.changes.every((change) => change.proposed.date === D1));

    const saved = confirmSchedulingAssistant(userId, intent, preview.changes);
    assert.ok(saved.filter((block) => block.title.startsWith('Today Move')).every((block) => block.date === D1));
  });

  it("moves today's 8:30 session to tomorrow at 9:30", async () => {
    const { client, userId } = await newStudent('resched-date-time');
    await seedBlocks(client, [{ title: 'DateTime Move', date: D, startTime: '08:30', durationMinutes: 60 }]);

    const intent = parseSchedulingAssistantIntent("Move today's 8:30 session to tomorrow at 9:30.", fixedNow);
    assert.deepStrictEqual(
      { type: intent.type, sourceDate: intent.sourceDate, sourceTime: intent.sourceTime, targetDate: intent.targetDate, targetTime: intent.targetTime },
      { type: 'move_time', sourceDate: D, sourceTime: '08:30', targetDate: D1, targetTime: '09:30' },
    );

    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 1);
    assert.strictEqual(preview.changes[0].proposed.date, D1);
    assert.strictEqual(preview.changes[0].proposed.startTime, '09:30');
  });

  it('prepares a reschedule proposal for the remaining sessions', async () => {
    const { client, userId } = await newStudent('resched-remaining');
    await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    await client.request('/api/schedule/settings', {
      method: 'PUT',
      body: {
        examDate: dateAfterToday(14),
        availability: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, startTime: '08:00', endTime: '10:00' })),
        dailyMaxMinutes: 120,
      },
    });

    const intent = parseSchedulingAssistantIntent('Reschedule the remaining sessions.', fixedNow);
    assert.strictEqual(intent.type, 'reschedule_remaining');
    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 0);
    assert.ok(preview.scheduleProposal, 'expected a schedule proposal for the remaining sessions');
  });

  it('swaps the 8:30 and 10:00 sessions', async () => {
    const { client, userId } = await newStudent('resched-swap');
    await seedBlocks(client, [
      { title: 'Swap Early', date: D, startTime: '08:30', durationMinutes: 60 },
      { title: 'Swap Late', date: D, startTime: '10:00', durationMinutes: 60 },
    ]);

    const intent = parseSchedulingAssistantIntent('Swap the 8:30 and 10:00 sessions.', fixedNow);
    assert.strictEqual(intent.type, 'swap_sessions');
    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 2);
    assert.ok(preview.changes.every((change) => change.operation === 'swap'));

    const saved = confirmSchedulingAssistant(userId, intent, preview.changes);
    assert.strictEqual(saved.find((block) => block.title === 'Swap Early')!.startTime, '10:00');
    assert.strictEqual(saved.find((block) => block.title === 'Swap Late')!.startTime, '08:30');
  });

  it('shifts every session after 9:30 forward by 30 minutes', async () => {
    const { client, userId } = await newStudent('resched-shift');
    await seedBlocks(client, [
      { title: 'Shift Before', date: D, startTime: '08:00', durationMinutes: 60 },
      { title: 'Shift Mid', date: D, startTime: '10:00', durationMinutes: 60 },
      { title: 'Shift Late', date: D, startTime: '11:00', durationMinutes: 60 },
    ]);

    const intent = parseSchedulingAssistantIntent('Move all sessions after 9:30 forward by 30 minutes.', fixedNow);
    assert.strictEqual(intent.type, 'shift_time');
    assert.strictEqual(intent.shiftMinutes, 30);
    const preview = previewSchedulingAssistant(userId, intent, fixedNow);
    assert.strictEqual(preview.changes.length, 2);
    const proposedByTitle = new Map(preview.changes.map((change) => [change.topicName, change.proposed.startTime]));
    assert.strictEqual(proposedByTitle.get('Shift Mid'), '10:30');
    assert.strictEqual(proposedByTitle.get('Shift Late'), '11:30');

    const saved = confirmSchedulingAssistant(userId, intent, preview.changes);
    assert.strictEqual(saved.find((block) => block.title === 'Shift Before')!.startTime, '08:00');
    assert.strictEqual(saved.find((block) => block.title === 'Shift Mid')!.startTime, '10:30');
  });
});

describe('scheduling assistant conversational regressions', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await void server.close();
    removeTempDir(server.dbDir);
  });

  it('generates and confirms a schedule when asked to "create a schedule"', async () => {
    const client = await registerClient(server, 'assistant-generate');
    const load = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    assert.strictEqual(load.status, 201);

    const settings = await client.request('/api/schedule/settings', {
      method: 'PUT',
      body: {
        examDate: dateAfterToday(14),
        availability: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, startTime: '08:00', endTime: '10:00' })),
        dailyMaxMinutes: 120,
      },
    });
    assert.strictEqual(settings.status, 200);

    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Create a schedule' },
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.json.preview.intent.type, 'generate_schedule');
    assert.strictEqual(preview.json.preview.changes.length, 0);
    assert.ok(preview.json.preview.scheduleProposal, 'expected a schedule proposal');
    assert.strictEqual(typeof preview.json.preview.scheduleProposalToken, 'string');

    const confirmed = await client.request('/api/scheduling-assistant/confirm', {
      method: 'POST',
      body: {
        message: 'Create a schedule',
        changes: [],
        scheduleProposal: preview.json.preview.scheduleProposal,
        scheduleProposalToken: preview.json.preview.scheduleProposalToken,
      },
    });
    assert.strictEqual(confirmed.status, 200);
    assert.ok(confirmed.json.scheduleBlocks.length > 0, 'expected generated blocks on the calendar');
    assert.ok(confirmed.json.scheduleBlocks.every((block: any) => block.topicId && block.durationMinutes >= 30));
  });

  it('completes the next session for "I finished this topic; what\'s next?" and reports the next session', async () => {
    const client = await registerClient(server, 'assistant-complete');
    const tomorrow = dateAfterToday(1);
    const dayAfter = dateAfterToday(2);
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST', body: { topics: [{ name: 'Algorithms' }] },
    });
    const topicId = topics.json.topics.find((topic: any) => topic.name === 'Algorithms').id;
    const created = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST', body: {
        scheduleBlocks: [
          { topicId, title: 'Algorithms review', date: tomorrow, startTime: '09:00', durationMinutes: 60 },
          { topicId, title: 'Algorithms practice', date: dayAfter, startTime: '10:00', durationMinutes: 60 },
        ],
      },
    });
    const firstBlock = created.json.scheduleBlocks.find((block: any) => block.title === 'Algorithms review');

    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: "I finished this topic; what's next?" },
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.json.preview.intent.type, 'complete_topic');
    assert.strictEqual(preview.json.preview.changes.length, 1);
    assert.strictEqual(preview.json.preview.changes[0].operation, 'complete');
    assert.strictEqual(preview.json.preview.changes[0].blockId, firstBlock.id);

    const confirmed = await client.request('/api/scheduling-assistant/confirm', {
      method: 'POST',
      body: { message: "I finished this topic; what's next?", changes: preview.json.preview.changes },
    });
    assert.strictEqual(confirmed.status, 200);
    assert.strictEqual(confirmed.json.scheduleBlocks.find((block: any) => block.id === firstBlock.id).completed, true);
    assert.ok(confirmed.json.nextSession, 'expected a next session after completing a topic');
    assert.strictEqual(confirmed.json.nextSession.topicName, 'Algorithms');
    assert.strictEqual(confirmed.json.nextSession.date, dayAfter);
  });

  it('shows the exact mapped slide, respects a requested date, and never invents a slide number', async () => {
    const client = await registerClient(server, 'assistant-slides');
    await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const ranking = await client.request('/api/academic/what-to-study');
    const mapped = ranking.json.whatToStudy.find((item: any) => item.lectureSource?.mapped && Number.isInteger(item.lectureSource.exactSlide));
    assert.ok(mapped, 'expected a mapped lecture concept from the sample pack');

    const tomorrow = dateAfterToday(1);
    await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId: mapped.topicId, title: 'Study: ' + mapped.conceptTitle, date: tomorrow, startTime: '09:00', durationMinutes: 60 },
    });

    // Explicit date that HAS an upcoming session -> exact slide, no invention.
    const withDate = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Show slides for tomorrow' },
    });
    assert.strictEqual(withDate.status, 200);
    assert.ok(withDate.json.preview.sourceAction, 'expected a source action link');
    assert.strictEqual(withDate.json.preview.sourceAction.exactSlide, mapped.lectureSource.exactSlide);
    assert.match(withDate.json.preview.sourceAction.url, /\/api\/documents\/[^/]+\/view\?slide=\d+$/);

    // No date -> falls back to the next session and still resolves the mapped slide.
    const fallback = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Show me the slides' },
    });
    assert.strictEqual(fallback.json.preview.sourceAction.exactSlide, mapped.lectureSource.exactSlide);

    // Explicit date with NO session that day -> no fallback to another day, no invented slide.
    const noneToday = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: "Show slides for today's topic" },
    });
    assert.strictEqual(noneToday.json.preview.sourceAction, null);
    assert.match(noneToday.json.preview.assistantMessage, /\d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(noneToday.json.preview.assistantMessage, /slide \d+/i);
  });

  it('reports no mapped slide for a topic without source evidence instead of guessing', async () => {
    const client = await registerClient(server, 'assistant-no-slide');
    const tomorrow = dateAfterToday(1);
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST', body: { topics: [{ name: 'Unsourced Topic' }] },
    });
    const topicId = topics.json.topics.find((topic: any) => topic.name === 'Unsourced Topic').id;
    await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Unsourced Topic session', date: tomorrow, startTime: '09:00', durationMinutes: 60 },
    });

    const preview = await client.request('/api/scheduling-assistant/preview', {
      method: 'POST', body: { message: 'Show me the slides' },
    });
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(preview.json.preview.sourceAction, null);
    assert.match(preview.json.preview.assistantMessage, /No exact lecture slide is mapped/);
    assert.doesNotMatch(preview.json.preview.assistantMessage, /\d/);
  });
});

describe('topic scope is limited to uploaded academic evidence', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await void server.close();
    removeTempDir(server.dbDir);
  });

  it('excludes orphan topics without a document source or mapped question from ranking and generation', async () => {
    const client = await registerClient(server, 'scope-evidence');
    await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    await client.request('/api/topics/bulk', {
      method: 'POST', body: { topics: [{ name: 'Totally Unrelated Orphan Topic' }, { name: 'Another Orphan Topic' }] },
    });

    const allTopics = (await client.request('/api/topics')).json.topics as any[];
    assert.ok(allTopics.some((topic: any) => topic.name === 'Totally Unrelated Orphan Topic'));

    const ranking = (await client.request('/api/academic-evidence')).json.academic.ranking as any[];
    assert.ok(ranking.length > 0, 'expected evidence-backed topics to remain');
    assert.ok(ranking.every((topic: any) => topic.sourceDocumentIds.length > 0 || topic.mappedQuestionCount > 0 || topic.syllabusEvidence), 'every ranked topic must carry evidence');
    assert.strictEqual(ranking.find((topic: any) => topic.name === 'Totally Unrelated Orphan Topic'), undefined);
    assert.strictEqual(ranking.find((topic: any) => topic.name === 'Another Orphan Topic'), undefined);

    const dataset = (await client.request('/api/schedule/dataset')).json.dataset as any;
    assert.ok(dataset.topics.length > 0, 'expected evidence-backed topics in the schedule dataset');
    assert.strictEqual(dataset.topics.find((topic: any) => topic.topicName === 'Totally Unrelated Orphan Topic'), undefined);
    assert.strictEqual(dataset.topics.find((topic: any) => topic.topicName === 'Another Orphan Topic'), undefined);
    assert.ok(dataset.topics.length < allTopics.length, 'orphan topics must be filtered out of the dataset');
  });
});
