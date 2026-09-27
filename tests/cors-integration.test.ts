import './corsEnv';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestServer, removeTempDir, type TestServer } from './helpers';
import { corsMiddleware, isOriginAllowed, normalizeOrigin, resolveCorsPolicy } from '../cors';

const VERCEL_ORIGIN = 'https://lazylift.vercel.app';
const PREVIEW_ORIGIN = 'https://lazylift-git-main-team.vercel.app';
const BLOCKED_ORIGIN = 'https://evil.example.com';
const LOOPBACK_ORIGIN = 'http://127.0.0.1:5173';

// Mounts an app on an ephemeral port so raw response headers can be inspected, which the
// Api helper deliberately discards.
async function listen(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('COR CORS policy resolution (cors.ts)', () => {
  // COR-01 - an unconfigured backend must not silently trust every origin; it falls back
  // to loopback only so `npm run dev` keeps working.
  it('COR-01 defaults to loopback only when no allowlist is configured', () => {
    for (const raw of [undefined, '', '   ', ',,']) {
      const policy = resolveCorsPolicy(raw);
      assert.strictEqual(policy.allowAnyOrigin, false);
      assert.strictEqual(policy.allowLoopback, true);
      assert.strictEqual(policy.origins.size, 0);
    }
  });

  // COR-02 - a configured allowlist replaces the loopback default entirely.
  it('COR-02 parses a comma-separated allowlist and normalizes each origin', () => {
    const policy = resolveCorsPolicy(` ${VERCEL_ORIGIN}/ , ${PREVIEW_ORIGIN} ,, `);
    assert.strictEqual(policy.allowAnyOrigin, false);
    assert.strictEqual(policy.allowLoopback, false);
    assert.deepStrictEqual([...policy.origins].sort(), [PREVIEW_ORIGIN, VERCEL_ORIGIN].sort());
    // Trailing slashes and stray whitespace must not create a second, unreachable entry.
    assert.strictEqual(policy.origins.has(`${VERCEL_ORIGIN}/`), false);
  });

  // COR-03 - "*" is honoured as an explicit opt-in.
  it('COR-03 supports an explicit wildcard and ignores other entries alongside it', () => {
    const policy = resolveCorsPolicy(`${VERCEL_ORIGIN}, *`);
    assert.strictEqual(policy.allowAnyOrigin, true);
    assert.strictEqual(policy.allowLoopback, false);
  });

  // COR-04 - anything that is not a plain http(s) origin is dropped rather than trusted.
  it('COR-04 rejects unparseable and non-http origins when building the allowlist', () => {
    const policy = resolveCorsPolicy('not a url,ftp://files.example.com,javascript:alert(1),file:///etc/passwd');
    assert.strictEqual(policy.origins.size, 0);
    // Everything was invalid, so this is indistinguishable from "unset": loopback default.
    assert.strictEqual(policy.allowLoopback, true);
  });

  // COR-05 - normalization strips path/query so an echoed header cannot carry injected content.
  it('COR-05 normalizes origins to scheme, host and port only', () => {
    assert.strictEqual(normalizeOrigin('https://a.example.com/evil?x=1'), 'https://a.example.com');
    assert.strictEqual(normalizeOrigin('https://a.example.com:8443'), 'https://a.example.com:8443');
    assert.strictEqual(normalizeOrigin('http://localhost:3000/'), 'http://localhost:3000');
    assert.strictEqual(normalizeOrigin('ftp://a.example.com'), null);
    assert.strictEqual(normalizeOrigin('javascript:alert(1)'), null);
    assert.strictEqual(normalizeOrigin(''), null);
  });

  // COR-06 - matching is exact. A prefix/suffix trick must not pass, and loopback is only
  // reachable while no allowlist is configured.
  it('COR-06 matches origins exactly and does not widen to subdomains or suffixes', () => {
    const allowlist = resolveCorsPolicy(VERCEL_ORIGIN);
    assert.strictEqual(isOriginAllowed(VERCEL_ORIGIN, allowlist), true);
    assert.strictEqual(isOriginAllowed(`https://evil.vercel.app`, allowlist), false);
    assert.strictEqual(isOriginAllowed(`${VERCEL_ORIGIN}.evil.com`, allowlist), false);
    assert.strictEqual(isOriginAllowed(`https://${VERCEL_ORIGIN}`, allowlist), false);
    assert.strictEqual(isOriginAllowed('http://lazylift.vercel.app', allowlist), false);
    assert.strictEqual(isOriginAllowed(LOOPBACK_ORIGIN, allowlist), false);

    const fallback = resolveCorsPolicy(undefined);
    assert.strictEqual(isOriginAllowed(LOOPBACK_ORIGIN, fallback), true);
    assert.strictEqual(isOriginAllowed('http://localhost:5173', fallback), true);
    assert.strictEqual(isOriginAllowed(VERCEL_ORIGIN, fallback), false);

    const wildcard = resolveCorsPolicy('*');
    assert.strictEqual(isOriginAllowed(BLOCKED_ORIGIN, wildcard), true);
  });
});

describe('COR CORS middleware behaviour', () => {
  let server: { baseUrl: string; close: () => Promise<void> };

  before(async () => {
    const app = express();
    app.use(corsMiddleware(`${VERCEL_ORIGIN},${PREVIEW_ORIGIN}`));
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));
    app.post('/api/ping', (_req, res) => res.json({ ok: true }));
    server = await listen(app);
  });

  after(async () => {
    await server.close();
  });

  // COR-07 - an allowed origin is echoed back and the response is marked as origin-varying.
  it('COR-07 echoes an allowed origin and sets Vary', async () => {
    const response = await fetch(`${server.baseUrl}/api/ping`, { headers: { Origin: VERCEL_ORIGIN } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
    assert.match(response.headers.get('vary') ?? '', /Origin/i);
  });

  // COR-08 - a blocked origin simply receives no allow header, which is what makes the
  // browser refuse the response. The request itself is untouched.
  it('COR-08 omits the allow header for a blocked origin but still serves the request', async () => {
    const response = await fetch(`${server.baseUrl}/api/ping`, { headers: { Origin: BLOCKED_ORIGIN } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
    assert.match(response.headers.get('vary') ?? '', /Origin/i);
  });

  // COR-09 - a same-origin request with no Origin header must not gain one.
  it('COR-09 leaves a request without an Origin header alone', async () => {
    const response = await fetch(`${server.baseUrl}/api/ping`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
  });

  // COR-10 - the preflight the browser actually sends for a Bearer + JSON request.
  it('COR-10 answers the preflight with 204 and the headers the client needs', async () => {
    const response = await fetch(`${server.baseUrl}/api/ping`, {
      method: 'OPTIONS',
      headers: {
        Origin: VERCEL_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
    const methods = response.headers.get('access-control-allow-methods') ?? '';
    for (const method of ['GET', 'POST', 'PATCH', 'OPTIONS']) {
      assert.match(methods, new RegExp(method), `${method} must be allowed`);
    }
    const allowed = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    assert.match(allowed, /authorization/);
    assert.match(allowed, /content-type/);
    assert.ok(Number(response.headers.get('access-control-max-age')) > 0);
  });

  // COR-11 - auth is a Bearer header, not a cookie. Emitting Allow-Credentials would force
  // a specific origin for no benefit and is invalid alongside a wildcard, so it must never
  // be sent.
  it('COR-11 never emits Access-Control-Allow-Credentials', async () => {
    for (const request of [
      fetch(`${server.baseUrl}/api/ping`, { headers: { Origin: VERCEL_ORIGIN } }),
      fetch(`${server.baseUrl}/api/ping`, {
        method: 'OPTIONS',
        headers: { Origin: VERCEL_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      }),
    ]) {
      const response = await request;
      assert.strictEqual(response.headers.get('access-control-allow-credentials'), null);
    }
  });

  // COR-12 - wildcard mode still refuses to claim credential support.
  it('COR-12 returns a literal wildcard only when one was configured', async () => {
    const app = express();
    app.use(corsMiddleware('*'));
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));
    const open = await listen(app);
    try {
      const response = await fetch(`${open.baseUrl}/api/ping`, { headers: { Origin: BLOCKED_ORIGIN } });
      assert.strictEqual(response.headers.get('access-control-allow-origin'), '*');
      assert.strictEqual(response.headers.get('access-control-allow-credentials'), null);
    } finally {
      await open.close();
    }
  });
});

describe('COR middleware registration order is load-bearing', () => {
  // COR-13 - documents the bug this integration had to avoid. When the auth gate is
  // registered first it answers the preflight with 401 and no CORS headers, and the
  // browser reports a CORS failure instead of the real response.
  it('COR-13 shows a misplaced auth gate turns a preflight into a 401', async () => {
    const app = express();
    app.use('/api', (_req: express.Request, res: express.Response) => res.status(401).json({ error: 'Authentication required.' }));
    app.use(corsMiddleware(VERCEL_ORIGIN));
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));
    const wrong = await listen(app);
    try {
      const response = await fetch(`${wrong.baseUrl}/api/ping`, {
        method: 'OPTIONS',
        headers: { Origin: VERCEL_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      });
      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
    } finally {
      await wrong.close();
    }
  });
});

describe('COR cross-origin requests against the real application', () => {
  let server: TestServer;

  before(async () => {
    // Runs with LAZYLIFT_CORS_ORIGINS set by ./corsEnv, so this exercises the real
    // server.ts wiring rather than a synthetic app.
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  // COR-14 - the health check Render polls must be reachable and readable cross-origin.
  it('COR-14 serves the public health check with the allow header', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, { headers: { Origin: VERCEL_ORIGIN } });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: 'ok' });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  });

  // COR-15 - the preflight that a real "load my schedule" call makes, against a route
  // that sits behind the auth gate. It must be answered with 204, never 401.
  it('COR-15 answers the preflight for a protected route with 204 instead of 401', async () => {
    const response = await fetch(`${server.baseUrl}/api/schedule-blocks`, {
      method: 'OPTIONS',
      headers: {
        Origin: VERCEL_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /authorization/i);
    assert.ok(!(await response.text()).includes('Authentication required'));
  });

  // COR-16 - the full cross-origin round trip: register from the Vercel origin, then read
  // a protected resource with the Bearer token.
  it('COR-16 completes a cross-origin authenticated round trip', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: VERCEL_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cors-round-trip@example.com', password: 'secret123', displayName: 'CORS' }),
    });
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
    const { token } = await response.json();
    assert.ok(token);

    const authorized = await fetch(`${server.baseUrl}/api/schedule-blocks`, {
      headers: { Origin: VERCEL_ORIGIN, Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(authorized.status, 200);
    assert.strictEqual(authorized.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
    assert.strictEqual(authorized.headers.get('access-control-allow-credentials'), null);
  });

  // COR-17 - a second configured origin (a Vercel preview deployment) is allowed too.
  it('COR-17 allows every configured origin, including preview deployments', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, { headers: { Origin: PREVIEW_ORIGIN } });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), PREVIEW_ORIGIN);
  });

  // COR-18 - and anything unlisted is refused at the header level.
  it('COR-18 refuses an unlisted origin on a real API response', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, { headers: { Origin: BLOCKED_ORIGIN } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('access-control-allow-origin'), null);
  });

  // COR-19 - a 401 from the auth gate must still carry CORS headers, otherwise the browser
  // reports an opaque CORS error and the client cannot run its session-expiry handling.
  it('COR-19 keeps the allow header on an authentication failure', async () => {
    const response = await fetch(`${server.baseUrl}/api/schedule-blocks`, { headers: { Origin: VERCEL_ORIGIN } });
    assert.strictEqual(response.status, 401);
    assert.deepStrictEqual(await response.json(), { error: 'Authentication required.' });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  });
});
