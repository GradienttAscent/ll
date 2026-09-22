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

Tokens are opaque 64-char hex strings, stored hashed (SHA-256), and expire after 30 days. The web app uses registration/login and restores a valid stored session through `/api/auth/me`; there are no automatic demo credentials.

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
| POST | `/api/schedule-blocks` | `{ "topicId", "title", "date", "startTime", "durationMinutes", "completed"? }` | `201 { "scheduleBlocks" }`; `404` if `topicId` is not the caller's; `409` on overlap |
| POST | `/api/schedule-blocks/bulk` | `{ "scheduleBlocks": [...] }` | `201 { "scheduleBlocks" }`; `404` if any referenced topic is not the caller's; `409` on overlap |
| PATCH | `/api/schedule-blocks/:id` | any of `{ "title", "date", "startTime", "durationMinutes", "topicId", "completed" }` | `{ "scheduleBlocks" }`; `404` if not the caller's block; `409` on overlap or completed-block rescheduling |

Dates must be real `YYYY-MM-DD` values, times must be `HH:MM` 24-hour values, durations must be positive integers, and blocks cannot cross midnight. Blocks may be adjacent but cannot overlap stored blocks or other blocks in the same bulk request. Bulk schedule writes are atomic.

### Schedule change history
| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/schedule-changes` | `blockId?` | `{ "scheduleChanges" }` |

A change is recorded with `field` = `created`, `rescheduled`, `completed`, `conversational_reschedule`, or `adaptive_revision`. `reason` is populated for legacy adaptive/manual changes. Requests for another user's block return `404`.

Blocks use genuine time-range overlap checks and bulk writes are atomic. Completed blocks cannot be rescheduled on scheduling fields.

### Analytics
| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/analytics` | `{ "analytics" }`; caller-scoped block completion/workload summary |
| GET | `/api/analytics/dashboard` | `{ "analytics" }`; session-derived all-time/7-day summaries, feedback averages, and topic aggregates |

### Legacy adaptive scheduling
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/adaptive/proposals` | `{ "scheduleBlockId", "reason" }` | Non-mutating proposal; `reason` is `missed`, `abandoned`, or `high-difficulty` |
| POST | `/api/adaptive/proposals/accept` | Proposed block with `sourceBlockId` and `reason` | `201 { "scheduleBlocks" }` after ownership and overlap validation |
| POST | `/api/adaptive/proposals/reject` | `{ "sourceBlockId", "reason" }` | `{ "ok": true }`; no writes |

### Conversational scheduling assistant
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/scheduling-assistant/preview` | `{ "message", "selectedBlockId"? }` | `{ "preview" }`; non-mutating answer, changes, or clarification matches |
| POST | `/api/scheduling-assistant/confirm` | `{ "message", "changes", "selectedBlockId"? }` | `{ "scheduleBlocks" }`; atomically revalidates and applies current changes |
| POST | `/api/scheduling-assistant/cancel` | — | `{ "ok": true }`; performs no writes |

Assistant previews are deterministic and never persisted. Confirmation rejects completed/stale/conflicting blocks. Supported operations: `move`/`shorten`, `cancel` (deletes the block), `swap` (exchanges two sessions), and `shift` (moves a whole day). Preview may return `matches` when clarification is needed; re-send with `selectedBlockId`. Queries (`query_schedule`, `query_range`) answer without changes. Constraints — `beforeTime`, `excludedWeekdays` (0=Sunday), `maxDailyMinutes` — are honored when picking replacement slots.

### Study sessions
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/study-sessions` | — | `{ "studySessions" }` |
| POST | `/api/study-sessions` | `{ "scheduleBlockId", "durationMinutes"? }` | `201 { "studySession" }`; `404` if the block is not the caller's |
| PATCH | `/api/study-sessions/:id` | `{ "status", "actualDurationSeconds"? }` | `{ "studySession": { "id", "status" } }`; `404` if not the caller's session |
| GET | `/api/study-sessions/:id/feedback` | — | `{ "feedback" }`; `404` if not the caller's session |
| POST | `/api/study-sessions/:id/feedback` | `{ "focusRating", "difficultyRating", "progressRating", "notes"? }` | `201 { "feedback" }`; ratings are integers 1–5 and the session must be completed |

`status` ∈ `active | paused | completed | stopped`. Setting `completed`/`stopped` stamps `endedAt`. `actualDurationSeconds` is a non-negative integer **delta** added to the session accumulator. `activeSince` identifies the current active interval and is cleared on pause/finish. Completing a session also marks its source schedule block complete atomically.

### Dashboard analytics
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/analytics/dashboard` | — | `{ "analytics" }`; caller-scoped all-time summary, rolling seven-day summary, feedback averages, and topic aggregates |

All-time planned minutes come from distinct persisted `schedule_blocks`; actual seconds and session completion/stopped counts come from persisted `study_sessions`. Upcoming workload includes only unfinished blocks whose date/time is in the future. The rolling seven-day window covers the current UTC day and six preceding UTC dates; active unpersisted timer time is deliberately excluded.

### Adaptive revision proposals
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/adaptive-proposals` | `{ "studySessionId" }` | `{ "proposal", "message"? }`; a proposal is generated only from an owned stopped session |
| POST | `/api/adaptive-proposals/accept` | `{ "studySessionId", "proposedDate", "proposedStartTime", "proposedDurationMinutes" }` | `201 { "scheduleBlock", "scheduleBlocks" }`; `409` if the deterministic proposal has changed or conflicts |
| POST | `/api/adaptive-proposals/reject` | `{ "studySessionId" }` | `{ "ok": true }`; no schedule changes |

Proposal generation is stateless and never writes a schedule block. A stopped session, or a completed session with persisted session-feedback difficulty 4 or 5, qualifies for a proposal. Acceptance rebuilds the proposal from persisted session/block/feedback data, verifies the submitted proposal still matches, then uses normal schedule validation before creating the shorter same-topic revision block.

### Documents
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/documents` | — | `{ "documents" }` |
| POST | `/api/documents` | `{ "title", "docType"?, "content"?, "fileSize"? }` | `201 { "document" }` |
| GET | `/api/documents/:id` | — | `{ "document" }`; `404` if not the caller's |

### Academic ingestion and evidence
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/academic-documents/analyze` | `{ "title", "docType": "Syllabus" | "Past Paper", "content", "fileSize"? }` | `201 { "analysis" }` |
| POST | `/api/academic-documents/upload` | `{ "title", "docType": "Syllabus" | "Past Paper", "base64", "mimeType"? }` | `201 { "analysis" }`; extracts the uploaded PDF on the server |
| GET | `/api/academic-evidence` | — | `{ "academic": { "documents", "questions", "ranking" } }` |

Academic ingestion persists the source document and, for binary uploads, stores the original payload with its MIME type and extraction method. Syllabus topics are stored even if the source has no questions and are linked to their originating document. Numbered past-paper questions and their sub-parts (`(a)`, `(b)`, `i)`, …) are normalized and deduplicated per persisted source document; each sub-part becomes its own question and marks are read from each original question section. When a syllabus exists, mapping targets only syllabus topics — AI classifications are aligned to syllabus names when possible and never create new topics. Matching requires at least one distinctive (non-generic) keyword; matches based solely on words like `management`, `while`, `PM`, `system`, or `process` are rejected and the question stays `unmatched`. Questions without sufficient evidence remain `unmatched` with no topic id; an unmapped sub-part can inherit the topic of a mapped sibling sub-part within the same question. Ranking is persisted to `topics.priority` and returns its score, mapped-question count, calculated marks weightage, syllabus presence, source document ids, and a human-readable reason. Repeating the same title/content does not create duplicate document questions. The upload response also reports `analysis.aiStatus` describing whether AI classification ran and why it might have been skipped or failed.

### Questions
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/questions` | — | `{ "questions" }` |
| GET | `/api/questions/:id` | — | `{ "question" }`; `404` if not the caller's |
| POST | `/api/questions/bulk` | `{ "questions": [{ "topicId"? , "topicName"?, "documentId"?, "questionText", "marks"?, "questionType"?, "source"?, "suggestedTimeMinutes"? }] }` | `201 { "questions" }`; `404` if a `topicId` or `documentId` is not the caller's |

`topicName` falls back to the caller's topic by name (creating it if needed). `topicId` must be owned.

### Feedback
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/feedback` | `{ "questionId"?, "sessionId"?, "score", "maxMarks", "source"?, "strengths"?, "improvements"?, "feedbackText"?, "modelAnswerSnippet"?, "focus"?, "difficulty"?, "perceivedProgress"?, "notes"? }` | `201 { "feedback" }`; `404` if `questionId` or `sessionId` is not the caller's |
| GET | `/api/feedback` | — | `{ "feedback" }` |

Validation: `score` ≥ 0, `maxMarks` > 0, `score ≤ maxMarks`, `source` ∈ `gemini | simulated | local-fallback | manual`. `strengths`/`improvements` are sent as arrays and stored as JSON text.

Session-evidence fields (used by adaptive scheduling — a high-difficulty session triggers revision proposals): `sessionId` links to a study session (`404` if not owned), `difficulty` ∈ `easy | medium | hard`, `focus` ∈ [0, 100], `perceivedProgress` ∈ [0, 100], `notes` is free text. All optional.

### Gemini
`POST /api/gemini/analyze-document`, `POST /api/gemini/evaluate-answer`, `POST /api/gemini/generate-plan` — all require auth; unchanged behavior otherwise (`generate-plan` is intentionally not wired into the UI). All Gemini outbound calls use the `GEMINI_MODEL` model constant (`gemini-3.6-flash` by default).

### AI practice mode
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/practice/evaluate` | `{ "question", "studentAnswer", "maxMarks"? }` | `{ "success", "source": "gemini", "data": { "score", "maxMarks", "strengths", "improvements", "feedbackText", "modelAnswerSnippet" }, "persisted": true, "feedbackId" }` |
| POST | `/api/practice/hint` | `{ "question", "maxMarks"? }` | `{ "success", "source": "gemini", "data": { "hint" } }` |

Requires auth. `question` and a non-empty `studentAnswer` are mandatory (answers capped at 20,000 characters). `maxMarks` is clamped to [1, 100] (default 10). Without a configured `GEMINI_API_KEY` both routes return `503` with a readable message. Scores are clamped to `[0, maxMarks]` and the normalized evaluation is persisted into `feedback` with `source = 'gemini'`, so every practice submission appears in the study history and feedback analytics. `POST /api/practice/hint` returns a concise, question-specific concept hint (key idea, relevant concepts/formulas, edge cases) generated per question — it never returns the generic fallback sentence and never writes the full solution.

### Timed mock exams
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/mock-exams` | `{ "examName"?, "durationSeconds"?, "startedAt"?, "endedAt"?, "questions": [{ "questionText", "topicName"?, "marks"?, "answer"? }] }` | `201 { "mockExam" }` |
| GET | `/api/mock-exams` | — | `{ "mockExams" }` (most recent first) |
| GET | `/api/mock-exams/:id` | — | `{ "mockExam" }`; `404` if not the caller's |

All require auth. At least one question is mandatory (max 25); each question needs `questionText`, and `marks` is clamped to [1, 100]. On submission, Gemini grades every question (1-based index) against its individual mark budget; blank answers always score 0. The report is recomputed server-side: per-question totals, overall percentage, grade (`A` ≥ 85, `B` ≥ 70, `C` ≥ 50, else `D`), per-topic breakdown, and overall advice. The attempt is persisted (`mock_exams` + `mock_exam_questions`) so results survive in History. Without `GEMINI_API_KEY` the route returns `503`.

## Frontend fetch wrapper

`src/api.ts` installs a global `fetch` wrapper (imported once from `src/main.tsx`, zero component edits):

1. Restores an existing session from `localStorage` through `GET /api/auth/me`.
2. Injects `Authorization: Bearer <token>` while a session is active.
3. On a protected `401` for the current token, clears stale state and returns the user to login. There is no automatic demo authentication or retry.
