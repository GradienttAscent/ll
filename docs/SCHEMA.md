# LazyLift Database Schema

Storage uses [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly) persisted to a single file (`lazylift.db`). The schema is managed by ordered, versioned migrations; see `db.ts`.

## Data directory

- Default: `<project>/data`
- Override with env var `LAZYLIFT_DATA_DIR` (resolved at startup). Tests use this to point at a temp directory.

## Migration model

- A `meta` table stores `schema_version`.
- `db.ts` runs an ordered list of `MIGRATIONS` (`{ version, name, up }`) once each in a transaction.
- `PRAGMA foreign_keys = ON` is set **after** migrations run (it stays off during migration so legacy-schema rebuilds and `ADD COLUMN` fixes are permitted).
- Current schema version: `16`

## Tables

### `users`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `email` | TEXT | UNIQUE, stored lowercased |
| `password_hash` | TEXT | `scrypt:keylen:salt:hash` (see `auth.ts`) |
| `display_name` | TEXT | |
| `created_at` | TEXT | ISO-8601 |

### `sessions`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `token_hash` | TEXT | UNIQUE; SHA-256 of the opaque bearer token |
| `created_at` | TEXT | |
| `expires_at` | TEXT | 30-day expiry |

### `courses`
Shared course catalog (`course-demo` seeded). Courses are not per-user; topics are namespaced by `user_id`.

### `topics`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `course_id` | TEXT | FK → `courses.id` |
| `name` | TEXT | |
| `priority` | INTEGER | 1–10 |
| `weightage` | REAL | percentage |
| `has_weightage` | INTEGER | `1` when a source declared weightage; distinguishes an absent value from `0` |
| `source` | TEXT | e.g. `extracted` |
| `created_at` | TEXT | |

Unique index: `idx_topics_user_course_name ON topics(user_id, course_id, name)` — the same topic name can exist independently per user, per course.

### `schedule_blocks`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `topic_id` | TEXT | FK → `topics.id` (CASCADE) |
| `title` | TEXT | |
| `date` | TEXT | `YYYY-MM-DD` |
| `start_time` | TEXT | `HH:MM` |
| `duration_minutes` | INTEGER | |
| `completed` | INTEGER | `0`/`1` |
| `created_at` | TEXT | |

> **Decision: no `study_tasks` entity.** `schedule_blocks` already fulfils the MVP task role (a planned block becomes a completed study item). A dedicated `study_tasks` table will only be added when a consumer actually needs an independent task model (e.g. a checklist separate from scheduled blocks). Nothing in the current app reads or writes it.

### `study_sessions`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `schedule_block_id` | TEXT | FK → `schedule_blocks.id` (CASCADE) |
| `started_at` | TEXT | |
| `created_at` | TEXT | |
| `duration_minutes` | INTEGER | planned duration |
| `actual_duration_seconds` | INTEGER | additive counter (accumulated via PATCH) |
| `status` | TEXT | `active` / `paused` / `completed` / `stopped` |
| `active_since` | TEXT nullable | timestamp of the current active interval; cleared while paused/finished |
| `ended_at` | TEXT | auto-set when status becomes `completed` or `stopped` |

### `session_feedback`
Separate from question-answer feedback, with one updatable record per completed study session.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `study_session_id` | TEXT | UNIQUE FK → `study_sessions.id` (CASCADE) |
| `focus_rating` | INTEGER | 1–5 |
| `difficulty_rating` | INTEGER | 1–5; 4–5 qualifies completed sessions for adaptation |
| `progress_rating` | INTEGER | 1–5 |
| `notes` | TEXT nullable | max 2000 characters at API boundary |
| `created_at` / `updated_at` | TEXT | ISO-8601 |

### `documents`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `title` | TEXT | |
| `doc_type` | TEXT | e.g. `Past Paper`, `Syllabus` |
| `content` | TEXT | raw extracted text |
| `file_size` | TEXT | human-readable, informational |
| `created_at` | TEXT | |

### `questions`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `topic_id` | TEXT | FK → `topics.id` (SET NULL) |
| `document_id` | TEXT nullable | FK → `documents.id` (SET NULL); source association for extracted PYQs |
| `question_text` | TEXT | |
| `normalized_text` | TEXT | normalized extracted text; unique with user/document when a document is present |
| `marks` | INTEGER | |
| `question_type` | TEXT | e.g. `Subjective` |
| `source` | TEXT | e.g. `extracted` |
| `suggested_time_minutes` | INTEGER | |
| `mapping_score` | REAL nullable | deterministic topic-token match score |
| `mapping_evidence` | TEXT | JSON list of matched tokens; `[]` when unmatched |
| `mapping_status` | TEXT | `mapped` or `unmatched` |
| `created_at` | TEXT | |

Partial unique index: `idx_questions_user_document_normalized ON questions(user_id, document_id, normalized_text) WHERE document_id IS NOT NULL`. This prevents re-processing the same persisted document from duplicating extracted questions while preserving standalone legacy/manual questions.

### `topic_document_sources`
Associates extracted topics with the persisted source document that supplied syllabus evidence.
| column | type | notes |
| --- | --- | --- |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `topic_id` | TEXT | FK → `topics.id` (CASCADE) |
| `document_id` | TEXT | FK → `documents.id` (CASCADE) |
| `created_at` | TEXT | ISO-8601 |

Primary key: `(user_id, topic_id, document_id)`.

### `feedback`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `question_id` | TEXT | FK → `questions.id` (SET NULL) |
| `session_id` | TEXT | FK → `study_sessions.id` (SET NULL); v2, session-evidence feedback |
| `score` | REAL | validated `0 ≤ score ≤ max_marks` |
| `max_marks` | REAL | |
| `source` | TEXT | one of `gemini` / `simulated` / `local-fallback` / `manual` |
| `strengths` | TEXT | JSON array string, e.g. `["..."]` |
| `improvements` | TEXT | JSON array string |
| `feedback_text` | TEXT | |
| `model_answer_snippet` | TEXT | |
| `focus` | REAL | v2; 0–100 session focus score |
| `difficulty` | TEXT | v2; `easy` / `medium` / `hard` session difficulty |
| `perceived_progress` | INTEGER | v2; 0–100 |
| `notes` | TEXT | v2; optional free-text note |
| `created_at` | TEXT | |

### `mock_exams`
Gemini-graded timed mock attempts, one row per exam submission.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `exam_name` | TEXT | display name, defaults to `Timed Mock Examination` |
| `started_at` | TEXT | ISO-8601 |
| `ended_at` | TEXT | ISO-8601; submission time |
| `duration_seconds` | INTEGER | agreed time limit for the attempt |
| `total_score` | REAL | sum of per-question scores |
| `total_max` | REAL | sum of question marks |
| `percentage` | INTEGER | rounded `100 * total_score / total_max` |
| `grade` | TEXT | `A` ≥ 85, `B` ≥ 70, `C` ≥ 50, else `D` |
| `ai_advice` | TEXT | Gemini overall recommendation |
| `question_count` | INTEGER | number of questions in the attempt |
| `created_at` | TEXT | ISO-8601 |

### `mock_exam_questions`
Per-question breakdown for a mock exam attempt (v12).
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `mock_exam_id` | TEXT | FK → `mock_exams.id` (CASCADE); NOT NULL |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `position` | INTEGER | 1-based question order |
| `question_text` | TEXT | submitted question |
| `topic_name` | TEXT | topic label, defaults to `General` |
| `answer` | TEXT | nullable; the submitted answer text |
| `score` | REAL | clamped `0 ≤ score ≤ max_marks`; 0 for blank answers |
| `max_marks` | REAL | marks for the question |
| `strengths` | TEXT | JSON array string |
| `improvements` | TEXT | JSON array string |
| `feedback` | TEXT | per-question Gemini feedback |
| `created_at` | TEXT | |

### `schedule_changes`
History of every create / reschedule / complete event on a block.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `block_id` | TEXT | FK → `schedule_blocks.id` (CASCADE) |
| `field` | TEXT | `created` / `rescheduled` / `completed` / `adaptive_revision` |
| `old_value` | TEXT | nullable |
| `new_value` | TEXT | nullable |
| `reason` | TEXT | nullable (v2); e.g. `manual`, `adaptive-missed` |
| `created_at` | TEXT | |

Enough to reconstruct: affected block (`block_id`), prior scheduling info (`old_value`), new scheduling info (`new_value`), owning user (`user_id`), timestamp (`created_at`), and trigger (`reason`).

## Study Room

A Study Room is a room you can find or host, focus in with other people, and ask questions in. It is
not a chat log and it has no separate task concept: the room itself, its shared focus session, and its
doubt board are the whole feature. There is deliberately **no `study_tasks` table** — a task board
would be a second source of truth for what the shared timer is already doing.

### `study_rooms`
Created in v7, extended in v16 with discovery and lifecycle columns.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `topic` | TEXT | legacy free-text topic |
| `subject` | TEXT | searchable subject, default `''` (v16) |
| `description` | TEXT | default `''` (v16) |
| `visibility` | TEXT | `PUBLIC` / `PRIVATE`, default `PUBLIC` (v16) |
| `max_participants` | INTEGER | default `15`, 2–100 (v16) |
| `status` | TEXT | `ACTIVE` / `CLOSED`, default `ACTIVE` (v16) |
| `expires_at` | TEXT | nullable (v16); treated as `CLOSED` once passed |
| `owner_id` | TEXT | FK → `users.id`; the host, who alone may close the room |
| `created_at` | TEXT | |

`PUBLIC` rooms are discoverable by anyone; `PRIVATE` rooms are visible only to their members. A room
is "closed" when `status = 'CLOSED'` **or** `expires_at` has passed, so an abandoned timer can never
advertise itself as active. Closed rooms stay readable as history for their members.

### `study_room_memberships`
| column | type | notes |
| --- | --- | --- |
| `room_id` | TEXT | FK → `study_rooms.id` (CASCADE) |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `joined_at` | TEXT | |
| | | PK (`room_id`, `user_id`) |

The host is inserted as a member when the room is created, so "is in the room" is a single question.
`memberCount` is a `COUNT(*)` over this table, which is why `max_participants` is checked against it
before a join rather than against a stored counter.

### `study_room_messages`
The original room chat, kept for API backward compatibility. The Study Room UI does not read it.

### `study_room_sessions`
The original per-user room timer, kept for API backward compatibility. Superseded by `focus_sessions`
for anything room-wide; the UI does not read it.

### `focus_sessions` (v16)
One shared timer per room. Any member may start it; the phase is room-wide because the room is
studying together, not independently.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `room_id` | TEXT | FK → `study_rooms.id` (CASCADE) |
| `started_by_user_id` | TEXT | FK → `users.id` (CASCADE) |
| `phase` | TEXT | `FOCUS` / `SHORT_BREAK` / `LONG_BREAK` |
| `duration_seconds` | INTEGER | 300–7200 |
| `started_at` | TEXT | |
| `ends_at` | TEXT | authoritative deadline; clients derive the countdown from it |
| `status` | TEXT | `ACTIVE` / `COMPLETED` / `CANCELLED` |
| `created_at` | TEXT | |

`idx_focus_sessions_single_active` is a **partial unique index** on `room_id WHERE status = 'ACTIVE'`,
so two concurrent starts cannot leave two timers running. Expiry is settled lazily: reading a room
marks any session whose `ends_at` has passed as `COMPLETED`, which keeps it correct even if nobody
polled while it was running. Closing a room cancels its active session.

### `focus_session_participants` (v16)
| column | type | notes |
| --- | --- | --- |
| `session_id` | TEXT | FK → `focus_sessions.id` (CASCADE) |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `joined_at` | TEXT | |
| `left_at` | TEXT | nullable; set when someone steps away mid-session |
| | | PK (`session_id`, `user_id`) |

Presence is derived, never stored: a participant in a `FOCUS` phase is `FOCUSING`, in a break phase
`ON_BREAK`, and any other member of the room is `IN_ROOM`. Leaving the room stamps `left_at` too, so
a member who walks away stops counting as focusing immediately.

### `study_doubts` (v16)
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `room_id` | TEXT | FK → `study_rooms.id` (CASCADE) |
| `user_id` | TEXT | FK → `users.id` (CASCADE); the asker, who alone may accept or resolve |
| `title` | TEXT | ≤ 200 chars |
| `content` | TEXT | ≤ 5000 chars |
| `status` | TEXT | `OPEN` / `RESOLVED` |
| `created_at` | TEXT | |
| `resolved_at` | TEXT | nullable |

### `study_doubt_answers` (v16)
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `doubt_id` | TEXT | FK → `study_doubts.id` (CASCADE) |
| `user_id` | TEXT | FK → `users.id` (CASCADE) |
| `content` | TEXT | ≤ 5000 chars |
| `is_accepted` | INTEGER | at most one accepted answer per doubt; the service clears the others in one transaction |
| `created_at` | TEXT | |

Accepting an answer and resolving the doubt are deliberately separate: accepting pins *which* answer
was right, resolving says the question is done and drops it off the open list.

## Legacy data handling (migrations v1-v16)

If a pre-auth database exists:
- `topics` is rebuilt to add `user_id` (legacy rows get an empty owner and are invisible until owned by a user).
- `schedule_blocks` / `study_sessions` gain `user_id` via `ADD COLUMN`; `study_sessions` also gains `ended_at`, `actual_duration_seconds`, `created_at`.
- All new tables are created afresh.
- v2 adds schedule-change reasons and legacy session fields to question-answer feedback.
- v3-v4 add document-backed academic evidence, deterministic PYQ mapping, and topic-source associations.
- v5 adds `topics.has_weightage` so ranking can present declared weightage truthfully.
- v6 adds `study_sessions.active_since` and the dedicated `session_feedback` table.
- v7-v11 add persistent study rooms, uploaded-document payload/extraction metadata, and schedule-block types.
- v12 adds Gemini-graded mock exam persistence (`mock_exams`, `mock_exam_questions`). Practice evaluations persist into the existing `feedback` table with `source = 'gemini'`.
- v13-v15 add document payload/extraction metadata, schedule-block types, and study-topic bookkeeping.
- v16 turns `study_rooms` into a discoverable, closable room and adds `focus_sessions`,
  `focus_session_participants`, `study_doubts`, and `study_doubt_answers`. The added columns are
  `ALTER TABLE ... ADD COLUMN` with defaults, so existing rooms keep working and appear as active
  public rooms.
