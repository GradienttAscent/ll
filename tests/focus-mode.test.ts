import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { normalizeDomain } from '../services';
import { createTestServer, Api, removeTempDir, TestServer } from './helpers';

describe('Real Focus Mode & Distraction Shield', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('focus-tester@example.com', 'secret123');
    client.token = token;
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  describe('domain normalization logic', () => {
    it('normalizes various URL and domain formats correctly', () => {
      assert.strictEqual(normalizeDomain('youtube.com'), 'youtube.com');
      assert.strictEqual(normalizeDomain('https://www.youtube.com/watch?v=123'), 'youtube.com');
      assert.strictEqual(normalizeDomain('http://REDDIT.COM/r/learnprogramming/'), 'reddit.com');
      assert.strictEqual(normalizeDomain('web.whatsapp.com:443'), 'web.whatsapp.com');
      assert.strictEqual(normalizeDomain('https://instagram.com#feed'), 'instagram.com');
    });

    it('rejects invalid or malformed domain strings', () => {
      assert.strictEqual(normalizeDomain(''), null);
      assert.strictEqual(normalizeDomain('not a domain'), null);
      assert.strictEqual(normalizeDomain('---'), null);
      assert.strictEqual(normalizeDomain(null as any), null);
    });
  });

  describe('focus session lifecycle API', () => {
    it('starts a focus session with custom duration and domains', async () => {
      const res = await client.request('/api/focus-mode/start', {
        method: 'POST',
        body: {
          durationMinutes: 45,
          taskTitle: 'Database Indexing Research',
          domains: ['youtube.com', 'https://reddit.com/r/all', 'invalid--'],
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.success, true);
      const session = res.json.session;
      assert.strictEqual(session.durationMinutes, 45);
      assert.strictEqual(session.taskTitle, 'Database Indexing Research');
      assert.strictEqual(session.status, 'ACTIVE');
      assert.deepStrictEqual(session.blockedDomains, ['youtube.com', 'reddit.com']);
    });

    it('returns active focus session via GET /api/focus-mode/active', async () => {
      const res = await client.request('/api/focus-mode/active');
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.activeSession);
      assert.strictEqual(res.json.activeSession.taskTitle, 'Database Indexing Research');
    });

    it('allows companion extension to check active session unauthenticated', async () => {
      const anon = new Api(server.baseUrl);
      const res = await anon.request('/api/focus-mode/active');
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.activeSession, 'Extension should observe active local session');
      assert.strictEqual(res.json.activeSession.taskTitle, 'Database Indexing Research');
    });

    it('stops active focus session cleanly via POST /api/focus-mode/stop', async () => {
      const stopRes = await client.request('/api/focus-mode/stop', { method: 'POST' });
      assert.strictEqual(stopRes.status, 200);
      assert.strictEqual(stopRes.json.success, true);

      // Verify active session is now cleared
      const checkRes = await client.request('/api/focus-mode/active');
      assert.strictEqual(checkRes.status, 200);
      assert.strictEqual(checkRes.json.activeSession, null);
    });

    it('persists and retrieves user custom blocklist', async () => {
      const saveRes = await client.request('/api/focus-mode/blocklist', {
        method: 'POST',
        body: {
          domains: ['twitch.tv', 'https://twitter.com/home', 'discord.com'],
        },
      });
      assert.strictEqual(saveRes.status, 200);
      assert.deepStrictEqual(saveRes.json.domains, ['twitch.tv', 'twitter.com', 'discord.com']);

      const getRes = await client.request('/api/focus-mode/blocklist');
      assert.strictEqual(getRes.status, 200);
      assert.deepStrictEqual(getRes.json.domains, ['twitch.tv', 'twitter.com', 'discord.com']);
    });

    it('validates duration bounds on start', async () => {
      const invalidRes = await client.request('/api/focus-mode/start', {
        method: 'POST',
        body: { durationMinutes: 0 },
      });
      assert.strictEqual(invalidRes.status, 400);
    });
  });
});
