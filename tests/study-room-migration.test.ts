import { it, describe, after } from 'node:test';
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
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

describe('Study Room migration', () => {
  let dbDir: string;
  let server: Awaited<ReturnType<typeof startServer>>;

  after(async () => {
    await server?.close();
    closeDatabase();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('repairs a database that recorded the colliding legacy v16 migration without losing rooms', async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'lazylift-upgrade-'));
    server = await startServer(dbDir);
    const owner = new Api(server.baseUrl);
    owner.token = (await owner.register('legacy-owner@lazylift.app', 'secret123', 'Legacy Owner')).token;

    const legacyRoom = await owner.request('/api/study-rooms', { method: 'POST', body: { name: 'Legacy Room', topic: 'Paging' } });
    assert.strictEqual(legacyRoom.status, 201);
    const roomId = legacyRoom.json.room.id;

    // A prior main branch used schema version 16 for unrelated material-library changes. Its
    // database skips the current Study Room v16 migration, so emulate that already-stamped state.
    const db = await getDatabase();
    for (const table of ['focus_sessions', 'focus_session_participants', 'study_doubts', 'study_doubt_answers']) {
      db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    db.prepare('DROP INDEX IF EXISTS idx_study_rooms_status').run();
    db.prepare('DROP INDEX IF EXISTS idx_study_rooms_subject').run();
    for (const column of ['description', 'subject', 'visibility', 'max_participants', 'status', 'expires_at']) {
      db.prepare(`ALTER TABLE study_rooms DROP COLUMN ${column}`).run();
    }
    db.prepare("UPDATE meta SET value = '16' WHERE key = 'schema_version'").run();

    await server.close();
    closeDatabase();
    server = await startServer(dbDir);

    const version = (await getDatabase()).prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    assert.ok(Number(version.value) >= 18);

    const reloaded = new Api(server.baseUrl);
    await reloaded.signInAs('legacy-owner@lazylift.app', 'secret123');
    const upgraded = await reloaded.request(`/api/study-rooms/${roomId}`);
    assert.strictEqual(upgraded.status, 200);
    assert.strictEqual(upgraded.json.room.name, 'Legacy Room');
    assert.strictEqual(upgraded.json.room.subject, '');
    assert.strictEqual(upgraded.json.room.description, '');
    assert.strictEqual(upgraded.json.room.visibility, 'PUBLIC');
    assert.strictEqual(upgraded.json.room.maxParticipants, 15);
    assert.strictEqual(upgraded.json.room.memberCount, 1);
    assert.strictEqual(upgraded.json.room.status, 'ACTIVE');
    assert.deepStrictEqual(upgraded.json.doubts, []);
    assert.strictEqual(upgraded.json.focusSession, null);

    // The collaboration tables exist and are usable after the upgrade.
    const doubt = await reloaded.request(`/api/study-rooms/${roomId}/doubts`, {
      method: 'POST',
      body: { title: 'After the upgrade', content: 'Does paging still work?' },
    });
    assert.strictEqual(doubt.status, 201);
    const session = await reloaded.request(`/api/study-rooms/${roomId}/sessions`, { method: 'POST', body: { durationMinutes: 25 } });
    assert.strictEqual(session.status, 201);
    assert.strictEqual(session.json.session.status, 'ACTIVE');
  });
});
