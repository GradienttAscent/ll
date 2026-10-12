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

Vercel hosts only the frontend bundle; Render hosts the API and its persistent SQLite database. For Vercel Production, define `VITE_API_BASE_URL` as `https://lazylift-backend.onrender.com` before building. `vercel.json` embeds Vercel's Git SHA as `VITE_BUILD_COMMIT`.

Render must deploy this service as the Docker runtime in `render.yaml`. The `Dockerfile` installs `libreoffice-impress` (`soffice`) and `poppler-utils` (`pdftoppm`) into the runtime image; Render's native Node runtime does not include either tool. For an existing dashboard-managed service, sync the Blueprint or update Settings to Runtime `Docker`, Dockerfile path `./Dockerfile`, plan `1c-2g`, and remove the old native Build/Start commands. Then use **Clear build cache & deploy**.

Attach one persistent disk at `/var/data` and set `LAZYLIFT_DATA_DIR=/var/data`. Persistent disks require a paid service and prevent multi-instance scaling, which is required here because the SQLite database, original uploaded PPTX blobs, and rendered-image cache are all on that disk. Set `LAZYLIFT_CORS_ORIGINS` to the Vercel production origin, and configure `GEMINI_API_KEY` and `APP_URL` as needed. Do not use `/tmp` for the database; it is used only for per-conversion temporary files and is cleaned up after each request.

To verify a deployment, inspect the browser console for `[lazylift-runtime]` (frontend build SHA and API origin), then open `<api-origin>/api/health` (backend build SHA and environment). Both deployment builds must contain the expected commit. Render startup logs must contain two `slide-render` `runtime-check` records with `available:true` for `soffice` and `pdftoppm`. Failed slide requests log only a categorized error code and source hash prefix, never request URLs or document tokens. For an upload comparison, match the uploaded file's SHA256 and `revision` from `[academic-diagnostic]` logs; do not log document contents or credentials.

## Scripts

- `npm run dev` — dev server (Vite + API)
- `npm run build` — production build (`dist/`)
- `npm start` — run the production build
- `npm test` — API/database tests (isolation, auth, persistence)
- `npm run lint` — `tsc --noEmit`

## Docs

- `docs/SCHEMA.md` — database schema, migrations, and the no-`study_tasks` decision
- `docs/API.md` — endpoints, auth model, and 404-per-user ownership semantics
