const TOKEN_KEY = 'lazylift_session_token';

const originalFetch: typeof globalThis.fetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : ((..._args: any[]) => Promise.reject(new Error('fetch is not available'))) as typeof globalThis.fetch;

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await originalFetch(input, { ...init, headers });

  if (response.status === 401) {
    // If receiving 401 on protected endpoint, clear stale token
    const isAuthEndpoint = typeof input === 'string' && input.includes('/api/auth/');
    if (!isAuthEndpoint) {
      try {
        window.localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  return response;
}

export function installFetchWrapper() {
  globalThis.fetch = authorizedFetch as typeof globalThis.fetch;
}