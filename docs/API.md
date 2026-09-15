# LazyLift HTTP API

Base URL: `http://localhost:3000` in dev. JSON in, JSON out. Error shape: `{ "error": string }`.

## Authentication

**Public endpoints** (no auth):

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok" }` (no `hasGeminiKey`) |
| POST | `/api/auth/register` | `{ "email", "password", "displayName"? }` → `201 { "token", "user" }`; `409` if the email is taken |
| POST | `/api/auth/login` | `{ "email", "password" }` → `{ "token", "user" }`; `401` invalid creds |
| GET | `/api/auth/me` | requires `Authorization` → `{ "user" }` |
| POST | `/api/auth/logout` | requires `Authorization` → `{ "ok": true }`, token invalidated |

**Everything else under `/api` requires a session.** Send the token as:

```
Authorization: Bearer <token>
```

Tokens are opaque 64-char hex strings, stored hashed (SHA-256), expire after 30 days. The web app acquires the demo session automatically (see `src/api.ts`); default demo credentials are `demo@lazylift.app` / `demo1234`.

## Authorization model

**Decision: every query filters by `id AND user_id`, and any access to another user's resource returns `404 Not Found` (indistinguishable from "does not exist").** There is no enumeration; a caller can never tell whether a foreign id exists.

- Reads: lists are always scoped to the caller (`WHERE user_id = ?`).
- Reads of a single resource: `WHERE id = ? AND user_id = ?` → `404` on miss.
- Creates that reference an owned entity (topic → block, block → session, question → feedback): the referenced id must belong to the caller, else `404`.
- Writes/patches: `WHERE user_id = ? AND id = ?` → `404` on miss.

## Endpoints

### Topics
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/topics` | — | `{ "topics" }` (caller's only) |
| POST | `/api/topics` | `{ "name", "priority"?, "weightage"?, "source"?, "courseId"? }` | `201 { "topics" }` |
| POST | `/api/topics/bulk` | `{ "topics": [...] }` | `201 { "topics" }` |

Upsert key is `(user_id, course_id, name)` — two users can use the same topic name independently.

### Schedule blocks
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/schedule-blocks` | — | `{ "scheduleBlocks" }` |
| POST | `/api/schedule-blocks` | `{ "topicId", "title", "date", "startTime", "durationMinutes", "completed"? }` | `201 { "scheduleBlocks" }`; `404` if `topicId` is not the caller's |
| POST | `/api/schedule-blocks/bulk` | `{ "scheduleBlocks": [...] }` | `201 { "scheduleBlocks" }`; `404` if any referenced topic is not the caller's |
| PATCH | `/api/schedule-blocks/:id` | any of `{ "title", "date", "startTime", "durationMinutes", "topicId", "completed" }` | `{ "scheduleBlocks" }`; `404` if not the caller's block |

### Schedule change history
| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/schedule-changes` | `blockId?` | `{ "scheduleChanges" }` |

A change is recorded with `field` = `created` (on block create), `rescheduled` (on title/date/time/duration/topic change), or `completed`. `?blockId=` on another user's block → `404`. An optional `reason` string is stored on each change (e.g. `manual` for manual PATCH reschedules, `adaptive-missed` for accepted adaptive proposals).

### Schedule lifecycle rules

**Overlap detection (genuine time-range):** schedule blocks are compared on `(<date>, <startTime>, <startTime> + durationMinutes)`. Two blocks on the same date conflict when `startA < endB AND endA > startB`. This rejects partial overlap, contained/containing intervals and identical intervals; exact boundaries (`10:00–11:00` then `11:00–12:00`) and fully non-overlapping intervals are allowed. All checks are scoped to the caller's own blocks.

Errors: `409` if a single POST, a bulk POST, or a PATCH that changes `date`/`startTime`/`durationMinutes`/`topicId` would overlap an existing block.

**Completed-block protection:** `PATCH /api/schedule-blocks/:id` on a completed block that changes any scheduling field (`date`, `startTime`, `durationMinutes`, `topicId`) → `409`. Toggling `completed` or editing `title` remains allowed. Adaptive proposal/accept flows reject completed source blocks with `409`.

### Analytics
| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/analytics` | `{ "analytics" }` |

Computed from the caller's persisted schedule data (never simulated). `today` is the server's local `YYYY-MM-DD`.

```json
{
  "analytics": {
    "plannedMinutes": 240,
    "completedMinutes": 120,
    "completedCount": 2,
    "missedCount": 1,
    "completionRate": 0.666,
    "upcomingWorkloadMinutes": 180,
    "topicProgress": [
      { "topicId": "topic-…", "topicName": "Graphs", "totalBlocks": 3, "completedBlocks": 2, "completionRate": 0.666 }
    ],
    "today": "2026-09-15"
  }
}
```

Definitions:
- `plannedMinutes` — Σ `duration_minutes` over all of the caller's blocks.
- `completedMinutes` — Σ duration of blocks with `completed = true`.
- `completedCount` — number of completed blocks.
- `missedCount` — number of non-completed blocks with `date < today`.
- `completionRate` — `completedCount / (completedCount + missedCount)` (0 when there are no due blocks).
- `upcomingWorkloadMinutes` — Σ duration of non-completed blocks with `date >= today`.
- `topicProgress` — per-topic totals and completion ratio for topics that have schedule blocks (sorted by `totalBlocks` desc).

Errors: `401` unauthenticated; a caller only ever sees their own data.

### Adaptive scheduling (proposal → accept / reject; never auto-applied)
The backend never modifies the schedule on its own. Gowri's client consumes these three endpoints.

**`POST /api/adaptive/proposals`** — suggest a shorter revision block after a missed / abandoned / high-difficulty session.
- Auth: required.
- Request:
```json
{ "scheduleBlockId": "block-…", "reason": "missed" }
```
`reason` ∈ `missed | abandoned | high-difficulty`.
- Response `200` (pure computation, no writes; the slot is the next free interval the caller has, searched forward from today):
```json
{
  "proposal": {
    "sourceBlockId": "block-…",
    "reason": "missed",
    "topicId": "topic-…",
    "topicName": "Graphs",
    "title": "Revision: Study Graphs",
    "date": "2026-09-16",
    "startTime": "09:00",
    "durationMinutes": 30
  }
}
```
- Errors: `400` missing/invalid payload; `404` block not owned; `409` completed source block, or no free slot in the next 14 days.

**`POST /api/adaptive/proposals/accept`** — apply a validated change.
- Auth: required.
- Request (the client returns the final block it wants, adjusting the proposal if desired):
```json
{
  "sourceBlockId": "block-…",
  "reason": "missed",
  "topicId": "topic-…",
  "title": "Revision: Study Graphs",
  "date": "2026-09-16",
  "startTime": "09:00",
  "durationMinutes": 30
}
```
- Response `201`:
```json
{ "scheduleBlocks": [ … ] }
```
- Behaviour on accept: re-validates topic ownership (`404`), refuses completed source blocks (`409`), re-checks real time-range overlap (`409`), persists the new block, and writes a `created` schedule-change history entry with `reason` = `adaptive-<reason>`.
- Errors: `400`, `404`, `409` as above.

**`POST /api/adaptive/proposals/reject`** — decline a proposal.
- Auth: required.
- Request:
```json
{ "sourceBlockId": "block-…", "reason": "missed" }
```
- Response `200`:
```json
{ "ok": true }
```
- The schedule is left completely unchanged (no block creation, no history row).

### Study sessions
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/study-sessions` | — | `{ "studySessions" }` |
| POST | `/api/study-sessions` | `{ "scheduleBlockId", "durationMinutes"? }` | `201 { "studySession" }`; `404` if the block is not the caller's |
| PATCH | `/api/study-sessions/:id` | `{ "status", "actualDurationSeconds"? }` | `{ "studySession": { "id", "status" } }`; `404` if not the caller's session |

`status` ∈ `active | paused | completed | stopped`. Setting `completed`/`stopped` stamps `endedAt`. `actualDurationSeconds` is **additive** (accumulates on the session).

### Documents
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/documents` | — | `{ "documents" }` |
| POST | `/api/documents` | `{ "title", "docType"?, "content"?, "fileSize"? }` | `201 { "document" }` |
| GET | `/api/documents/:id` | — | `{ "document" }`; `404` if not the caller's |

### Questions
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/questions` | — | `{ "questions" }` |
| GET | `/api/questions/:id` | — | `{ "question" }`; `404` if not the caller's |
| POST | `/api/questions/bulk` | `{ "questions": [{ "topicId"? , "topicName"?, "questionText", "marks"?, "questionType"?, "source"?, "suggestedTimeMinutes"? }] }` | `201 { "questions" }`; `404` if a `topicId` is not the caller's |

`topicName` falls back to the caller's topic by name (creating it if needed). `topicId` must be owned.

### Feedback
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/feedback` | `{ "questionId"?, "sessionId"?, "score", "maxMarks", "source"?, "strengths"?, "improvements"?, "feedbackText"?, "modelAnswerSnippet"?, "focus"?, "difficulty"?, "perceivedProgress"?, "notes"? }` | `201 { "feedback" }`; `404` if `questionId` or `sessionId` is not the caller's |
| GET | `/api/feedback` | — | `{ "feedback" }` |

Validation: `score` ≥ 0, `maxMarks` > 0, `score ≤ maxMarks`, `source` ∈ `gemini | simulated | local-fallback | manual`. `strengths`/`improvements` are sent as arrays and stored as JSON text.

Session-evidence fields (used by adaptive scheduling — a high-difficulty session triggers revision proposals): `sessionId` links to a study session (`404` if not owned), `difficulty` ∈ `easy | medium | hard`, `focus` ∈ [0, 100], `perceivedProgress` ∈ [0, 100], `notes` is free text. All optional.

### Gemini
`POST /api/gemini/analyze-document`, `POST /api/gemini/evaluate-answer`, `POST /api/gemini/generate-plan` — all require auth; unchanged behavior otherwise (`generate-plan` is intentionally not wired into the UI).

## Frontend fetch wrapper

`src/api.ts` installs a global `fetch` wrapper (imported once from `src/main.tsx`, zero component edits):

1. Ensures a session (demand-login or restored from `localStorage`).
2. Injects `Authorization: Bearer <token>` on every request.
3. On a single `401`, clears the token, re-acquires the demo session, and retries exactly once.