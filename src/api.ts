let sessionToken: string | null = null;
const TOKEN_KEY = 'lazylift_session_token';
const DEMO_EMAIL = 'demo@lazylift.app';
const DEMO_PASSWORD = 'demo1234';

const originalFetch: typeof globalThis.fetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : ((..._args: any[]) => Promise.reject(new Error('fetch is not available'))) as typeof globalThis.fetch;

export function getSessionToken(): string | null {
  return sessionToken;
}

export async function ensureSession(): Promise<string | null> {
  if (sessionToken) return sessionToken;

  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      sessionToken = stored;
      return stored;
    }
  } catch {
    // localStorage unavailable
  }

  try {
    const response = await originalFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    const data = await response.json();
    if (response.ok && data.token) {
      sessionToken = data.token;
      try { window.localStorage.setItem(TOKEN_KEY, sessionToken); } catch { /* ignore */ }
      return sessionToken;
    }
  } catch {
    // server not reachable
  }

  return null;
}

async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await ensureSession();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await originalFetch(input, { ...init, headers });

  if (response.status === 401) {
    sessionToken = null;
    try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    const freshToken = await ensureSession();
    if (freshToken) {
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('Authorization', `Bearer ${freshToken}`);
      response = await originalFetch(input, { ...init, headers: retryHeaders });
    }
  }

  return response;
}

export function installFetchWrapper() {
  globalThis.fetch = authorizedFetch as typeof globalThis.fetch;
}