import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('black-box upload and feedback boundaries', () => {
  let server: TestServer;
  let client: Api;
  let topicId: string;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('black-box-boundaries@example.com', 'secret123');
    client.token = token;
    const topic = await client.request('/api/topics', { method: 'POST', body: { name: 'Boundary Topic' } });
    topicId = topic.json.topics[0].id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  let sessionSlot = 0;

  async function completedSession() {
    const slotIndex = sessionSlot;
    const date = `2026-12-${String(20 + slotIndex).padStart(2, '0')}`;
    const startTime = `${String(8 + (slotIndex % 6)).padStart(2, '0')}:00`;
    const title = `Boundary block ${date} ${startTime}`;
    sessionSlot += 1;

    const block = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title, date, startTime, durationMinutes: 30 },
    });
    assert.strictEqual(block.status, 201);
    const blocks = await client.request('/api/schedule-blocks');
    const scheduleBlock = blocks.json.scheduleBlocks.find((item: any) => item.title === title);
    assert.ok(scheduleBlock);
    const session = await client.request('/api/study-sessions', {
      method: 'POST', body: { scheduleBlockId: scheduleBlock.id, durationMinutes: 30 },
    });
    await client.request(`/api/study-sessions/${session.json.studySession.id}`, {
      method: 'PATCH', body: { status: 'completed', actualDurationSeconds: 30 },
    });
    return session.json.studySession.id;
  }

  it('accepts exact lower and upper completed-session feedback boundaries', async () => {
    const minimumSession = await completedSession();
    const minimum = await client.request(`/api/study-sessions/${minimumSession}/feedback`, {
      method: 'POST', body: { focusRating: 1, difficultyRating: 1, progressRating: 1 },
    });
    assert.strictEqual(minimum.status, 201);
    assert.deepStrictEqual(
      [minimum.json.feedback.focusRating, minimum.json.feedback.difficultyRating, minimum.json.feedback.progressRating],
      [1, 1, 1],
    );

    const maximumSession = await completedSession();
    const maximum = await client.request(`/api/study-sessions/${maximumSession}/feedback`, {
      method: 'POST', body: { focusRating: 5, difficultyRating: 5, progressRating: 5 },
    });
    assert.strictEqual(maximum.status, 201);
    assert.deepStrictEqual(
      [maximum.json.feedback.focusRating, maximum.json.feedback.difficultyRating, maximum.json.feedback.progressRating],
      [5, 5, 5],
    );
  });

  it('rejects empty and malformed upload payloads', async () => {
    const empty = await client.request('/api/academic-documents/upload', {
      method: 'POST', body: { title: 'empty.txt', docType: 'Past Paper', base64: '', mimeType: 'text/plain' },
    });
    assert.strictEqual(empty.status, 400);

    const malformed = await client.request('/api/academic-documents/upload', {
      method: 'POST', body: { title: 'invalid.txt', docType: 'Past Paper', base64: 'not*base64', mimeType: 'text/plain' },
    });
    assert.strictEqual(malformed.status, 400);
  });

  it('accepts a 15 MB upload and rejects one byte above the upload limit', async () => {
    const limit = 15 * 1024 * 1024;
    const atLimit = await client.request('/api/academic-documents/upload', {
      method: 'POST', body: {
        title: 'at-limit.txt', docType: 'Past Paper', base64: Buffer.alloc(limit, 0x61).toString('base64'), mimeType: 'text/plain',
      },
    });
    assert.strictEqual(atLimit.status, 201);

    const aboveLimit = await client.request('/api/academic-documents/upload', {
      method: 'POST', body: {
        title: 'above-limit.txt', docType: 'Past Paper', base64: Buffer.alloc(limit + 1, 0x61).toString('base64'), mimeType: 'text/plain',
      },
    });
    assert.strictEqual(aboveLimit.status, 413);
  });
});
