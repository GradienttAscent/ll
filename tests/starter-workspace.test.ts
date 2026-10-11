import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('starter workspace', () => {
  let server: TestServer;
  let previousNodeEnv: string | undefined;

  before(async () => {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    server = await createTestServer();
    process.env.NODE_ENV = 'production';
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('privately seeds every account once without duplicating its workspace on login', async () => {
    const first = new Api(server.baseUrl);
    first.token = (await first.register('starter-one@example.com', 'secret123')).token;
    const second = new Api(server.baseUrl);
    second.token = (await second.register('starter-two@example.com', 'secret123')).token;

    const [firstTopics, firstSchedule, firstRooms, firstExams, firstMemory, secondTopics] = await Promise.all([
      first.request('/api/topics'), first.request('/api/schedule-blocks'), first.request('/api/study-rooms'), first.request('/api/mock-exams'), first.request('/api/memory/topics'), second.request('/api/topics'),
    ]);
    assert.ok(firstTopics.json.topics.length > 0);
    const plannedRevisions = firstSchedule.json.scheduleBlocks.filter((block: any) => !block.completed && block.blockType === 'revision');
    assert.strictEqual(plannedRevisions.length, 3);
    const revisionDates = plannedRevisions.map((block: any) => Date.parse(`${block.date}T00:00:00Z`));
    assert.strictEqual(revisionDates[1] - revisionDates[0], 2 * 86_400_000);
    assert.strictEqual(revisionDates[2] - revisionDates[1], 2 * 86_400_000);
    assert.ok(firstRooms.json.rooms.length > 0);
    assert.ok(firstExams.json.mockExams.length > 0);
    assert.strictEqual(firstTopics.json.topics.length, secondTopics.json.topics.length);

    const firstTopicIds = new Set(firstTopics.json.topics.map((topic: any) => topic.id));
    assert.ok(secondTopics.json.topics.every((topic: any) => !firstTopicIds.has(topic.id)));
    assert.ok(firstTopics.json.topics.some((topic: any) => topic.name === 'Page Replacement and TLBs'));
    const pagingTrace = firstMemory.json.memory.topics.find((topic: any) => topic.topicName === 'Page Replacement and TLBs');
    const fileSystemsTrace = firstMemory.json.memory.topics.find((topic: any) => topic.topicName === 'File Systems and Disk Scheduling');
    assert.ok(pagingTrace.predictedRetention < 1);
    assert.ok(fileSystemsTrace.predictedRetention < 1);

    const returning = new Api(server.baseUrl);
    returning.token = (await returning.login('starter-one@example.com', 'secret123')).token;
    const afterLogin = await returning.request('/api/mock-exams');
    assert.strictEqual(afterLogin.json.mockExams.length, firstExams.json.mockExams.length);
  });
});
