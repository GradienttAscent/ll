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

async function startServer(dbDir: string) {
  process.env.LAZYLIFT_DATA_DIR = dbDir;
  process.env.APP_PORT = '0';
  const { app } = await createApp();
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('persistent two-user Study Room', () => {
  let dbDir: string;

  before(() => { dbDir = mkdtempSync(join(tmpdir(), 'lazylift-room-')); });
  after(() => { rmSync(dbDir, { recursive: true, force: true }); });

  it('supports membership, shared timer, persistent chat, isolation, and restart', async () => {
    const first = await startServer(dbDir);
    const alice = new Api(first.baseUrl);
    const bob = new Api(first.baseUrl);
    alice.token = (await alice.register('alice-room@lazylift.app', 'secret123')).token;
    bob.token = (await bob.register('bob-room@lazylift.app', 'secret123')).token;

    const created = await alice.request('/api/study-rooms', { method: 'POST', body: { name: 'Graph Focus', topic: 'Dijkstra' } });
    assert.strictEqual(created.status, 201);
    const roomId = created.json.room.id;
    const listedForBob = await bob.request('/api/study-rooms');
    assert.strictEqual(listedForBob.json.rooms[0].joined, false);
    assert.strictEqual((await bob.request(`/api/study-rooms/${roomId}`)).status, 403);

    assert.strictEqual((await bob.request(`/api/study-rooms/${roomId}/join`, { method: 'POST' })).status, 200);
    assert.strictEqual((await alice.request(`/api/study-rooms/${roomId}/session`, { method: 'PATCH', body: { status: 'active', durationMinutes: 25 } })).status, 200);
    assert.strictEqual((await alice.request(`/api/study-rooms/${roomId}/messages`, { method: 'POST', body: { text: 'Starting now', topicTag: 'Dijkstra' } })).status, 201);
    assert.strictEqual((await bob.request(`/api/study-rooms/${roomId}/messages`, { method: 'POST', body: { text: 'I am joining', isQuestion: true } })).status, 201);

    const bobView = await bob.request(`/api/study-rooms/${roomId}`);
    assert.strictEqual(bobView.status, 200);
    assert.strictEqual(bobView.json.members.length, 2);
    assert.strictEqual(bobView.json.messages.length, 2);
    assert.strictEqual(bobView.json.session.status, 'active');

    await first.close();
    closeDatabase();

    const second = await startServer(dbDir);
    try {
      const resumedBob = new Api(second.baseUrl);
      await resumedBob.signInAs('bob-room@lazylift.app', 'secret123');
      const resumed = await resumedBob.request(`/api/study-rooms/${roomId}`);
      assert.strictEqual(resumed.status, 200);
      assert.strictEqual(resumed.json.members.length, 2);
      assert.strictEqual(resumed.json.messages[0].text, 'Starting now');
      assert.strictEqual(resumed.json.session.status, 'active');
      assert.strictEqual((await resumedBob.request(`/api/study-rooms/${roomId}/leave`, { method: 'POST' })).status, 200);
      assert.strictEqual((await resumedBob.request(`/api/study-rooms/${roomId}`)).status, 403);
    } finally {
      await second.close();
      closeDatabase();
    }
  });
});
