# Member 1 (Shivha) - Verification Evidence

All figures below are copied from the logs in this directory. Nothing is estimated.

- Environment: Node v24.18.0, tsx 4.23.15, Windows.
- Baseline before this work: `npm test` -> 144 tests / 26 suites, 0 fail
  (the "177 tests / 37 suites" figure circulating in the repo is not reproducible here).
- Final state: `npm test` -> **233 tests / 37 suites, 233 pass, 0 fail, 0 skipped**
  (`npm-test.log`), 89 tests added across 6 new files.

## Commands and exit codes

| ID | Command | Exit | Evidence |
| --- | --- | --- | --- |
| AUTO-E-01 | `npm test` | 0 | `npm-test.log` (233 tests, 37 suites, 0 fail) |
| AUTO-E-02 | `npm run lint` (`tsc --noEmit`) | 0 | `lint.log` (no diagnostics) |
| AUTO-E-03 | `npm run build` | 0 | `build.log` (vite built in 3.54s, 2098 modules, `dist/assets/index-CQaJaEwC.js` 589.25 kB) |
| COV-E-01 | `npx tsx --test --experimental-test-coverage --test-coverage-include=... "tests/**/*.test.ts"` | 0 | `test-with-coverage.log` |

All four logs are UTF-8 without a BOM and colour codes stripped, so they diff as
readable text. `*.log` is ignored by the repository `.gitignore`, so the logs were
added with `git add -f`; they are evidence artifacts, not build noise.

The JS bundle is over Vite's 500 kB warning threshold. That is a pre-existing
frontend build characteristic, unrelated to this work, and the build exits 0.

## Code coverage (COV-E-01)

Scope is the five modules in Member 1's Sections 6 / 6.1 / 7 assignment.
Node's built-in coverage is used, so no new dependency was added.

| File | Line % | Branch % | Funcs % | Uncovered lines |
| --- | --- | --- | --- | --- |
| `validation.ts` | 100.00 | 100.00 | 100.00 | - |
| `auth.ts` | 100.00 | 92.59 | 100.00 | - |
| `schedulingAssistant.ts` | 92.86 | 98.57 | 100.00 | 1, 3-21, 143-145, 205 |
| `pdfText.ts` | 98.11 | 92.00 | 100.00 | 41 |
| `services.ts` | 97.39 | 83.17 | 95.70 | see log |
| **all files** | **97.10** | **86.95** | **96.30** | |

Notes on the residual gaps:

- `schedulingAssistant.ts` lines 1 and 3-21 are the `export type` declarations. They
  are erased at runtime but V8 still attributes them line hits; they cannot be covered.
  Line 205 is the `parseSchedulingAssistantIntent` signature. Lines 143-145 are the
  `Number.isFinite` guard inside `parseMaxDailyMinutes`, which is unreachable because
  the matching regex can only capture digits.
- `pdfText.ts` line 41 is the `extractPdfText` signature; it reported as covered in one
  run and not in another, so this single line is a source-map artefact rather than a
  real gap. Every behavioural branch of the function is covered by PDF-01..PDF-10.
- `services.ts` is a 2646-line module shared with the Study Room, mock exam, adaptive
  scheduling and session-lifecycle features. The uncovered ranges belong to those
  features, not to the scheduling / memory / academic logic in Member 1's scope.

## Reproducing

```powershell
npm test
npm run lint
npm run build
npx tsx --test --experimental-test-coverage `
  --test-coverage-include=validation.ts `
  --test-coverage-include=services.ts `
  --test-coverage-include=schedulingAssistant.ts `
  --test-coverage-include=auth.ts `
  --test-coverage-include=pdfText.ts `
  "tests/**/*.test.ts"
```
