# LazyLift Database Schema

Storage uses [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly) persisted to a single file (`lazylift.db`). The schema is managed by ordered, versioned migrations; see `db.ts`.

## Data directory

- Default: `<project>/data`
- Override with env var `LAZYLIFT_DATA_DIR` (resolved at startup). Tests use this to point at a temp directory.

## Migration model

- A `meta` table stores `schema_version`.
- `db.ts` runs an ordered list of `MIGRATIONS` (`{ version, name, up }`) once each in a transaction.
- `PRAGMA foreign_keys = ON` is set **after** migrations run (it stays off during migration so legacy-schema rebuilds and `ADD COLUMN` fixes are permitted).
- Current schema version: `1`

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
| `ended_at` | TEXT | auto-set when status becomes `completed` or `stopped` |

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
| `question_text` | TEXT | |
| `marks` | INTEGER | |
| `question_type` | TEXT | e.g. `Subjective` |
| `source` | TEXT | e.g. `extracted` |
| `suggested_time_minutes` | INTEGER | |
| `created_at` | TEXT | |

### `feedback`
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `question_id` | TEXT | FK → `questions.id` (SET NULL) |
| `score` | REAL | validated `0 ≤ score ≤ max_marks` |
| `max_marks` | REAL | |
| `source` | TEXT | one of `gemini` / `simulated` / `local-fallback` / `manual` |
| `strengths` | TEXT | JSON array string, e.g. `["..."]` |
| `improvements` | TEXT | JSON array string |
| `feedback_text` | TEXT | |
| `model_answer_snippet` | TEXT | |
| `created_at` | TEXT | |

### `schedule_changes`
History of every create / reschedule / complete event on a block.
| column | type | notes |
| --- | --- | --- |
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → `users.id` (CASCADE); NOT NULL |
| `block_id` | TEXT | FK → `schedule_blocks.id` (CASCADE) |
| `field` | TEXT | `created` / `rescheduled` / `completed` |
| `old_value` | TEXT | nullable |
| `new_value` | TEXT | nullable |
| `created_at` | TEXT | |

## Legacy data handling (migration v1)

If a pre-auth database exists:
- `topics` is rebuilt to add `user_id` (legacy rows get an empty owner and are invisible until owned by a user).
- `schedule_blocks` / `study_sessions` gain `user_id` via `ADD COLUMN`; `study_sessions` also gains `ended_at`, `actual_duration_seconds`, `created_at`.
- All new tables are created afresh.