import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createApp } from '../server';
import { closeDatabase } from '../db';
import { Api } from './helpers';

interface RestartableServer {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startServerIn(dbDir: string): Promise<RestartableServer> {
  process.env.LAZYLIFT_DATA_DIR = dbDir;
  process.env.APP_PORT = '0';
  const { app } = await createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('persistence across backend restart', () => {
  let dbDir: string;

  before(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'lazylift-restart-'));
  });

  after(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('login → academic data → schedule → session → feedback → analytics, then survives a backend restart', async () => {
    const first = await startServerIn(dbDir);
    const client = new Api(first.baseUrl);
    const { token, user } = await client.register('restart@lazylift.app', 'secret123');
    client.token = token;
    assert.ok(user.id);

    const topicsRes = await client.request('/api/topics', { method: 'POST', body: { name: 'Graphs', priority: 8, weightage: 40 } });
    const topicId = topicsRes.json.topics[0].id;

    const blockRes = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Survives Restart', date: '2026-10-15', startTime: '09:00', durationMinutes: 60 },
    });
    const blockId = blockRes.json.scheduleBlocks[0].id;

    const sessionRes = await client.request('/api/study-sessions', { method: 'POST', body: { scheduleBlockId: blockId, durationMinutes: 60 } });
    const sessionId = sessionRes.json.studySession.id;
    assert.strictEqual((await client.request(`/api/study-sessions/${sessionId}`, { method: 'PATCH', body: { status: 'completed', actualDurationSeconds: 3000 } })).status, 200);

    const feedbackRes = await client.request('/api/feedback', {
      method: 'POST',
      body: { sessionId, score: 7, maxMarks: 10, source: 'manual', focus: 80, difficulty: 'medium', perceivedProgress: 60, notes: 'Good session' },
    });
    assert.strictEqual(feedbackRes.status, 201);
    const feedbackId = feedbackRes.json.feedback.id;

    const analyticsBefore = (await client.request('/api/analytics')).json.analytics;
    assert.strictEqual(analyticsBefore.plannedMinutes, 60);

    await first.close();
    closeDatabase();

    const second = await startServerIn(dbDir);
    try {
      const resumed = new Api(second.baseUrl);
      await resumed.signInAs('restart@lazylift.app', 'secret123');

      const topics = (await resumed.request('/api/topics')).json.topics;
      assert.strictEqual(topics.length, 1);
      assert.strictEqual(topics[0].name, 'Graphs');

       const blocks = (await resumed.request('/api/schedule-blocks')).json.scheduleBlocks;
       assert.strictEqual(blocks.length, 1);
       assert.strictEqual(blocks[0].title, 'Survives Restart');
       assert.strictEqual(blocks[0].startTime, '09:00');
       assert.strictEqual(blocks[0].blockType, 'study');

      const sessions = (await resumed.request('/api/study-sessions')).json.studySessions;
      assert.strictEqual(sessions[0].status, 'completed');
      assert.strictEqual(sessions[0].actualDurationSeconds, 3000);

      const feedback = (await resumed.request('/api/feedback')).json.feedback;
      assert.ok(feedback.some((f: any) => f.id === feedbackId));
      assert.strictEqual(feedback[0].difficulty, 'medium');
      assert.strictEqual(feedback[0].focus, 80);

      const analyticsAfter = (await resumed.request('/api/analytics')).json.analytics;
      assert.deepStrictEqual(analyticsAfter, analyticsBefore);
    } finally {
      await second.close();
      closeDatabase();
    }
  });
});
