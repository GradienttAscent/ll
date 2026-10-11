// Single source of truth for the backend origin.
//
// Locally, VITE_API_BASE_URL is unset, so every path stays root-relative and the request is
// same-origin: `npm run dev` serves the API and the SPA from one Express process.
// On Vercel the value must be set at BUILD time, because Vite inlines import.meta.env when
// it bundles, and must point at the Render backend, e.g. https://lazylift-backend.onrender.com
const configured = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : '') ?? '';

export const API_BASE_URL = (() => {
  // If running in a browser on loopback (localhost / 127.0.0.1), always keep requests
  // root-relative / same-origin so they reach the local Express dev server.
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
      return '';
    }
  }
  return configured.trim().replace(/\/+$/, '');
})();

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves a server path such as `/api/topics` against the configured backend origin.
 * Absolute URLs and non-root-relative values are passed through untouched, so an explicit
 * URL in a call site still wins.
 */
export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  if (ABSOLUTE_URL.test(path)) return path;
  if (!path.startsWith('/')) return path;
  return `${API_BASE_URL}${path}`;
}
