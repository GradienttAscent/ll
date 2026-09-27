import type { NextFunction, Request, Response } from 'express';

// The web client authenticates with an `Authorization: Bearer` header read from
// localStorage, never with a cookie, so this API is a non-credentialed CORS resource.
// `Access-Control-Allow-Credentials` is therefore deliberately never emitted: combining
// it with a wildcard origin is rejected by browsers, and there is no cookie surface to
// protect in the first place.
const ALLOWED_METHODS = 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Authorization,Content-Type,Accept';
const PREFLIGHT_MAX_AGE_SECONDS = '86400';
const WILDCARD = '*';

// A separately served Vite dev server talks to this API from loopback during local
// development. Loopback is only permitted when no allowlist has been configured, so it can
// never widen the policy of a deployed backend.
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export interface CorsPolicy {
  /** `*` was requested explicitly, so any origin may be reflected. */
  allowAnyOrigin: boolean;
  /** Exact, already-normalized origins that may be reflected. */
  origins: Set<string>;
  /** Loopback origins are tolerated; true only when no allowlist was configured. */
  allowLoopback: boolean;
}

/**
 * Reduces an origin to `scheme://host[:port]`, rejecting anything unparseable or on a
 * non-HTTP scheme. Guarantees the value echoed back in `Access-Control-Allow-Origin` can
 * never carry a path, query or injected header.
 */
export function normalizeOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin;
}

/**
 * Parses `LAZYLIFT_CORS_ORIGINS` (a comma-separated list) into a policy.
 *
 * - unset/empty -> loopback only, which keeps `npm run dev` and a standalone Vite dev
 *   server working without any configuration.
 * - `*`         -> reflect any origin. Only safe because no cookies are used.
 * - otherwise   -> exactly the listed origins; loopback is no longer implicitly allowed.
 */
export function resolveCorsPolicy(raw: string | undefined): CorsPolicy {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry === WILDCARD ? WILDCARD : normalizeOrigin(entry)))
    .filter((entry): entry is string => entry !== null);

  if (entries.length === 0) {
    return { allowAnyOrigin: false, origins: new Set(), allowLoopback: true };
  }
  if (entries.includes(WILDCARD)) {
    return { allowAnyOrigin: true, origins: new Set(), allowLoopback: false };
  }
  return { allowAnyOrigin: false, origins: new Set(entries), allowLoopback: false };
}

export function isOriginAllowed(origin: string, policy: CorsPolicy): boolean {
  if (policy.allowAnyOrigin) return true;
  if (policy.origins.has(origin)) return true;
  return policy.allowLoopback && LOOPBACK_ORIGIN.test(origin);
}

/**
 * Emits CORS headers and answers preflights.
 *
 * Must be registered before the body parser and before the `/api` auth gate: a browser
 * never attaches `Authorization` to a preflight, so letting `requireAuth` answer would
 * return 401 with no CORS headers and the browser would surface a CORS failure instead of
 * the real response.
 */
export function corsMiddleware(rawAllowedOrigins?: string) {
  const policy = resolveCorsPolicy(rawAllowedOrigins);

  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.origin;
    if (typeof header === 'string' && header) {
      const origin = normalizeOrigin(header);
      // A disallowed origin simply gets no `Access-Control-Allow-Origin`; the browser
      // then blocks the response, which is the control we want.
      if (origin && isOriginAllowed(origin, policy)) {
        res.setHeader('Access-Control-Allow-Origin', policy.allowAnyOrigin ? WILDCARD : origin);
      }
    }
    // Without this, a cache could hand one origin's response to another origin.
    res.vary('Origin');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS);
      res.status(204).end();
      return;
    }

    next();
  };
}
