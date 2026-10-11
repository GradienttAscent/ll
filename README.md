# LazyLift

Single-user-friendly exam prep app backed by a multi-user persistence layer (auth + per-user isolation).

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Optionally set `GEMINI_API_KEY` in `.env.local` (or `.env`) for live Gemini analysis. The app uses a text-aware local fallback when no key is configured.
3. Run the app:
   `npm run dev`

Open `http://localhost:3000`. SQLite data is created automatically at `data/lazylift.db`.

## Authentication

Register or log in through the web client. LazyLift stores an authenticated session locally and restores it on refresh while the server-side session remains valid. There is no automatic demo authentication.

## Split Deployment

Vercel hosts only the frontend bundle; Render hosts the API and its persistent SQLite database. For Vercel Production, define `VITE_API_BASE_URL` as `https://lazylift-backend.onrender.com` before building. `vercel.json` embeds Vercel's Git SHA as `VITE_BUILD_COMMIT`. On Render, set `LAZYLIFT_CORS_ORIGINS` to `https://ll-three-gilt.vercel.app` and keep `LAZYLIFT_DATA_DIR` on the persistent disk mount `/var/data`; changing either deployment setting requires a redeploy. The Render service must use a paid service tier because persistent disks are unavailable on the free tier, and the disk must be declared in `render.yaml`. Do not use `/tmp` for the database because Render may clear it when the service restarts or is redeployed.

To verify a deployment, inspect the browser console for `[lazylift-runtime]` (frontend build SHA and API origin), then open `<api-origin>/api/health` (backend build SHA and environment). Both deployment builds must contain the expected commit. For an upload comparison, match the uploaded file's SHA256 and `revision` from `[academic-diagnostic]` logs; do not log document contents or credentials.

## Scripts

- `npm run dev` — dev server (Vite + API)
- `npm run build` — production build (`dist/`)
- `npm start` — run the production build
- `npm test` — API/database tests (isolation, auth, persistence)
- `npm run lint` — `tsc --noEmit`

## Docs

- `docs/SCHEMA.md` — database schema, migrations, and the no-`study_tasks` decision
- `docs/API.md` — endpoints, auth model, and 404-per-user ownership semantics
