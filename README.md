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

## Scripts

- `npm run dev` — dev server (Vite + API)
- `npm run build` — production build (`dist/`)
- `npm start` — run the production build
- `npm test` — API/database tests (isolation, auth, persistence)
- `npm run lint` — `tsc --noEmit`

## Docs

- `docs/SCHEMA.md` — database schema, migrations, and the no-`study_tasks` decision
- `docs/API.md` — endpoints, auth model, and 404-per-user ownership semantics
