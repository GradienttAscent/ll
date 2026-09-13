import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

describe('auth', () => {
  let server: TestServer;
  let api: Api;

  before(async () => {
    server = await createTestServer();
    api = new Api(server.baseUrl);
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  it('health is public and no longer exposes hasGeminiKey', async () => {
    const { status, json } = await api.request('/api/health');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(json, { status: 'ok' });
    assert.ok(!('hasGeminiKey' in json));
  });

  it('register creates a session token and user', async () => {
    const { status, json } = await api.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'secret123', displayName: 'Alice' },
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(typeof json.token, 'string');
    assert.ok(json.token.length >= 32);
    assert.strictEqual(json.user.email, 'alice@example.com');
    assert.strictEqual(json.user.displayName, 'Alice');
    assert.ok(json.user.id);
  });

  it('rejects duplicate registration with 409', async () => {
    const { status } = await api.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'secret123' },
    });
    assert.strictEqual(status, 409);
  });

  it('validates missing/invalid inputs', async () => {
    const bad = await api.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'secret123' },
    });
    assert.strictEqual(bad.status, 400);

    const short = await api.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'bob@example.com', password: '123' },
    });
    assert.strictEqual(short.status, 400);
  });

  it('login succeeds with correct password and fails otherwise', async () => {
    const good = await api.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'secret123' },
    });
    assert.strictEqual(good.status, 200);
    assert.strictEqual(typeof good.json.token, 'string');
    assert.strictEqual(good.json.user.email, 'alice@example.com');

    const bad = await api.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'wrong-password' },
    });
    assert.strictEqual(bad.status, 401);
  });

  it('me returns the session user and protected routes require auth', async () => {
    const alice = new Api(server.baseUrl);
    await alice.signInAs('alice@example.com', 'secret123');

    const me = await alice.request('/api/auth/me');
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.json.user.email, 'alice@example.com');

    const anonymous = new Api(server.baseUrl);
    const topics = await anonymous.request('/api/topics');
    assert.strictEqual(topics.status, 401);
  });

  it('logout invalidates the session token', async () => {
    const alice = new Api(server.baseUrl);
    const { token } = await alice.login('alice@example.com', 'secret123');
    alice.token = token;

    const loggedOut = await alice.request('/api/auth/logout', { method: 'POST' });
    assert.strictEqual(loggedOut.status, 200);

    const me = await alice.request('/api/auth/me');
    assert.strictEqual(me.status, 401);
  });
});