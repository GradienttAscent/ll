# Gowri Arun - CSE312 Test Record

## Section 5 - Black-box

| ID | Input / precondition | Expected | Actual | Result | Script | Command | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-AUTH | Register `alice@example.com` / `secret123`; log in with same credentials, then `wrong-password`; register same email again | 201/200; wrong password 401; duplicate 409 | Matched | PASS | `tests/auth.test.ts` | `npx tsx --test tests/auth.test.ts tests/scheduling.test.ts tests/session-feedback.test.ts tests/academic-upload.test.ts tests/black-box-boundaries.test.ts` | `evidence/logs/gowri-focused-api.log` |
| BB-SCH | Topic `Schedule Safety`; 10:00-11:00, 10:30-11:30, 11:00-12:00; 23:30 plus 31 min | Disjoint/adjacent 201; overlap 409; cross-midnight 400 | Matched | PASS | `tests/scheduling.test.ts` | `npx tsx --test tests/auth.test.ts tests/scheduling.test.ts tests/session-feedback.test.ts tests/academic-upload.test.ts tests/black-box-boundaries.test.ts` | `evidence/logs/gowri-focused-api.log` |
| BB-FB | Completed sessions; ratings `(1,1,1)`, `(5,5,5)`, `(0,3,3)`, `(3,6,3)` | 1 and 5 accepted; 0 and 6 rejected (400) | Matched; range is integer 1-5 | PASS | `tests/black-box-boundaries.test.ts`, `tests/session-feedback.test.ts` | `npx tsx --test tests/auth.test.ts tests/scheduling.test.ts tests/session-feedback.test.ts tests/academic-upload.test.ts tests/black-box-boundaries.test.ts` | `evidence/logs/gowri-focused-api.log` |
| BB-UPL | TXT `at-limit.txt` with 15 MiB `a`; `above-limit.txt` with 15 MiB + 1 byte; empty and invalid base64; valid embedded-text PDF | TXT/PDF 201; empty/malformed 400/422; above limit 413 | Matched; upload limit is 15 MiB | PASS | `tests/black-box-boundaries.test.ts`, `tests/academic-upload.test.ts` | `npx tsx --test tests/auth.test.ts tests/scheduling.test.ts tests/session-feedback.test.ts tests/academic-upload.test.ts tests/black-box-boundaries.test.ts` | `evidence/logs/gowri-focused-api.log` |

## Section 9 - System

SYS-01 and SYS-02 are browser E2E tests run with Playwright. SYS-03 through SYS-05 are API/integration tests run with `tsx --test`.

| ID | Input / precondition | Expected | Actual | Result | Script | Command | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SYS-01 | Fresh `sys01-<timestamp>-0@example.com`; syllabus Graph Algorithms/Dynamic Programming; two-question PYQ; generate schedule; reload calendar | Topics/questions extracted and saved schedule remains in calendar after reload | Matched | PASS | `e2e/sys-01.spec.ts` | `npx playwright test e2e/sys-01.spec.ts --workers=1` | `evidence/screenshots/SYS-01.png`, `evidence/logs/SYS-01-playwright.log` |
| SYS-02 | Fresh `sys02-<timestamp>-0@example.com`; Graph Algorithms syllabus; generated block; start, pause, resume, complete; ratings 4/4/4 and note `Solid improvement plan with a clear milestone.` | Dashboard and history show completed session and submitted feedback | Original run failed: dashboard passed, history showed `Feedback Status None` and omitted reflection. After BUG-02 fix and retest, history shows `Submitted` and the reflection. | PASS | `e2e/sys-02.spec.ts` | `npx playwright test e2e/sys-02.spec.ts --workers=1`; `npx playwright test e2e/sys-01.spec.ts e2e/sys-02.spec.ts --workers=1` | Before: `evidence/logs/SYS-02-playwright.log`; after: `evidence/screenshots/SYS-02.png` |
| SYS-03 | Isolated eligible stopped/high-difficulty session and free future slot | Proposal accepted; shorter revision block and adaptive history persist | Matched | PASS | `tests/adaptive.test.ts` | `npx tsx --test tests/adaptive.test.ts tests/exam-practice.test.ts tests/study-room.test.ts` | `evidence/logs/gowri-system-api.log` |
| SYS-04 | Hermetic fallback header; practice hint/evaluation; mock-exam submission | Hint/evaluation returned; exam result persisted | Matched | PASS | `tests/gemini-fallback.test.ts` | `npx tsx --test tests/gemini-fallback.test.ts` | `evidence/logs/SYS-04-api.log` |
| SYS-05 | Alice creates `Graph Focus` / `Dijkstra`; Bob joins; shared active 25-min session; messages `Starting now` and `I am joining`; server restart | Two members, messages and active session persist after restart | Matched | PASS | `tests/study-room.test.ts` | `npx tsx --test tests/adaptive.test.ts tests/exam-practice.test.ts tests/study-room.test.ts` | `evidence/logs/gowri-system-api.log` |

## Verification

| Check | Result | Command | Evidence |
| --- | --- | --- | --- |
| Type check | PASS | `npm run lint` | `evidence/logs/gowri-lint.log` |
| Production build | PASS (bundle-size warning only) | `npm run build` | `evidence/logs/gowri-build.log` |

## BUG-02 — Completed-session feedback missing from Session History

| Item | Record |
| --- | --- |
| Original result | SYS-02 failed after a successful completed-session feedback submission: History showed `Feedback Status None` and no reflection. |
| Root cause | Feedback persisted in `session_feedback` and was available through `/api/study-sessions/:id/feedback`, but Session History joined sessions to the unrelated legacy `/api/feedback` contract. |
| Fix | `GET /api/study-sessions` now includes each session's current `session_feedback` object; Session History renders that contract. |
| Regression coverage | `tests/session-feedback.test.ts`: `BUG-02 — Completed-session feedback missing from Session History: includes feedback in the session-list contract` passed via `npx tsx --test tests/session-feedback.test.ts`. |
| Retest | SYS-02 passed alone and with SYS-01 via the commands recorded above. |
| Evidence | Before: `evidence/logs/SYS-02-playwright.log`; after: `evidence/screenshots/SYS-02.png`. |
