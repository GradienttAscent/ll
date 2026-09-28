# LazyLift — Antigravity Handoff

## Current Task

We are fixing the academic PDF question extraction pipeline.

The REAL scanned PDF upload now works successfully with Gemini after fixing the Gemini model/configuration.

Do NOT revisit or change Gemini/PDF configuration.

---

## Current Working PDF Flow

Current/old flow:

PDF
→ Gemini reads/extracts text
→ existing academic parser
→ structured questions
→ database

Problem: the existing academic parser is incorrectly interpreting some Gemini-extracted academic text.

Observed problems with a real Compiler Design question paper:

- Q1 total 20 marks was displayed as 10 marks.
- Q2 was incorrectly split into `QUESTION 2(A) • 1 MARKS` and the remaining content.
- Q3/Q4 equations/grammar were displayed as raw LaTeX.
- Q5 total 20 marks was displayed as 12 marks.
- Code fences appeared literally.
- Some topic mapping showed `GENERAL ACADEMIC CONCEPTS`.

The real scanned PDF itself is successfully reaching Gemini, so OCR/PDF access is NOT the current problem.

---

## Existing Academic Parser

The existing academic parser is already used elsewhere and has automated tests.

It handles things such as:

- question number detection
- lettered/Roman subquestions
- marks extraction
- marks propagation
- markdown cleanup
- headings/separators/noise
- scenario/context preservation
- topic mapping
- provisional PYQ-derived topics

There are currently 10 failing branch tests in:

`tests/academic-parser-branches.test.ts`

The failures are around:

- Roman numeral subparts
- furniture/noise text
- marks parsing
- marks propagation
- trailing parenthesized marks
- confidence mapping
- paper-derived topic mapping
- exact syllabus-name mapping

IMPORTANT:

Do NOT attempt to fix these parser tests as part of this task.

---

# REQUIRED CHANGE

For ACADEMIC PDF UPLOADS ONLY:

Do NOT send Gemini's extracted text through the existing academic parser.

Instead:

PDF
→ Gemini reads the ORIGINAL PDF
→ Gemini directly returns structured question JSON
→ minimal validation
→ existing question/database storage flow

The existing academic parser must remain untouched and continue to work for other paths.

---

## Gemini Structured Output

Gemini should return structured data containing:

- question number
- complete question text
- subquestions when present
- subquestion label (`a`, `b`, `c`, etc.)
- marks for each subquestion
- total marks
- equations preserved cleanly
- code preserved cleanly

Example conceptual structure:

{
  "questions": [
    {
      "questionNumber": 1,
      "text": "Complete question text...",
      "totalMarks": 20,
      "subquestions": [
        {
          "label": "a",
          "text": "...",
          "marks": 10
        },
        {
          "label": "b",
          "text": "...",
          "marks": 10
        }
      ]
    }
  ]
}

The exact existing application's types/storage format should be reused where possible.

Do NOT create a large new architecture just for this.

---

## Validation

Only minimal deterministic validation is needed:

- questions is an array
- question number is valid
- question text is non-empty
- marks are numeric when available
- subquestions have valid labels/text
- total marks are numeric when available

If all subquestion marks are known, total marks may be derived from their sum if appropriate.

Do not build a complicated parser fallback.

---

## IMPORTANT EXISTING WORK

Gemini PDF functionality was already fixed.

Current configured model:

`GEMINI_MODEL=gemini-3.8-flash`

Do NOT change this.

Real scanned PDF upload has been successfully tested.

There is also an existing PDF OCR fallback test:

`tests/pdf-ocr-fallback.test.ts`

It currently has 8 passing tests.

---

## Baseline Before This Change

After the PDF OCR fix:

- 274 total tests
- 264 passing
- 10 failing
- The same 10 failures are in `tests/academic-parser-branches.test.ts`

Also:

`npm run lint` → PASS

`npm run build` → PASS

Do NOT treat the existing 10 parser failures as part of this task.

---

## Critical Constraints

This is a SMALL focused change.

DO NOT:

- modify the frontend
- modify Gemini/PDF configuration
- install packages
- modify `.env`
- change the existing academic parser
- fix the 10 academic parser tests
- refactor unrelated code
- redesign database schema
- redesign question-bank architecture
- run the full test suite
- run browser tests
- spend credits on broad investigation

Prefer the smallest implementation possible.

Reuse the existing database/question storage flow.

---

## Verification

After implementation, perform ONLY a minimal targeted check that confirms:

1. The changed code compiles/type-checks.
2. Structured Gemini output can reach the existing question storage flow.

Do NOT run the full project test suite.

Do NOT run browser testing.

---

## STOP CONDITION

After making the smallest working change:

STOP.

Report:

1. Exact files changed.
2. What changed in each file.
3. Whether the targeted check passed.
4. Any remaining issue.

Do not make additional improvements unless explicitly requested.