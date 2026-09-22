import type { UserAccount } from './types';

let sessionToken: string | null = null;
const TOKEN_KEY = 'lazylift_session_token';
let onSessionExpired: (() => void) | null = null;

const originalFetch: typeof globalThis.fetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : ((..._args: any[]) => Promise.reject(new Error('fetch is not available'))) as typeof globalThis.fetch;

export function getSessionToken(): string | null {
  return sessionToken;
}

export function hasStoredSession(): boolean {
  return Boolean(sessionToken || storedToken());
}

function storedToken(): string | null {
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    return stored || null;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionToken = null;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage unavailable
  }
}

function clearSessionIfCurrent(token: string | null) {
  if (token && (sessionToken || storedToken()) !== token) return;
  clearSession();
}

function saveSession(token: string) {
  sessionToken = token;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage unavailable
  }
}

async function authRequest(path: string, body: Record<string, string>) {
  const response = await originalFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token || !data.user) {
    throw new Error(data.error || 'Unable to authenticate. Please try again.');
  }
  saveSession(data.token);
  return data.user as UserAccount;
}

export function login(email: string, password: string) {
  return authRequest('/api/auth/login', { email, password });
}

export function register(displayName: string, email: string, password: string) {
  return authRequest('/api/auth/register', { displayName, email, password });
}

export async function restoreSession(): Promise<UserAccount | null> {
  const token = sessionToken || storedToken();
  if (!token) return null;
  sessionToken = token;
  const response = await originalFetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.user) {
    clearSessionIfCurrent(token);
    return null;
  }
  return data.user as UserAccount;
}

export async function logout() {
  const token = sessionToken || storedToken();
  clearSessionIfCurrent(token);
  if (token) await originalFetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = sessionToken || storedToken();
  if (token) sessionToken = token;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await originalFetch(input, { ...init, headers });

  if (response.status === 401 && token && !String(input).includes('/api/auth/') && (sessionToken || storedToken()) === token) {
    clearSession();
    onSessionExpired?.();
  }

  return response;
}

export function installFetchWrapper() {
  try {
    // Attempt standard assignment first
    globalThis.fetch = authorizedFetch as typeof globalThis.fetch;
  } catch {
    // If window.fetch has only a getter or is non-writable, define it on the window/globalThis instance
    try {
      Object.defineProperty(globalThis, 'fetch', {
        value: authorizedFetch,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      // If globalThis fails, attempt on window directly if available
      if (typeof window !== 'undefined') {
        try {
          Object.defineProperty(window, 'fetch', {
            value: authorizedFetch,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          // Ignore if environment strictly forbids overriding window.fetch
        }
      }
    }
  }
}
