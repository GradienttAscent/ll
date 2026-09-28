import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ALLOWED_FEEDBACK_DIFFICULTY,
  ALLOWED_FEEDBACK_SOURCES,
  HttpError,
  VALID_SESSION_STATUSES,
  sendError,
  validateDocumentInput,
  validateEmail,
  validateFeedbackInput,
  validatePassword,
  validateQuestionText,
  validateSessionFeedbackInput,
  validateTopicName,
} from '../validation';

// The remaining pure request validators in validation.ts. The HTTP suites only reach
// whichever branch a given route happens to exercise, so the field-level rules, the
// error-message contract and the allow-lists are pinned here directly.
describe('VAL request validators (validation.ts)', () => {
  // VAL-01 - credentials.
  it('VAL-01 validates email and password shapes', () => {
    for (const email of ['a@b.co', 'first.last+tag@sub.domain.org']) {
      assert.strictEqual(validateEmail(email), null, email);
    }
    for (const email of ['', 'plain', 'no-at-sign.com', 'two@@at.com', 'trailing@dot.', '@nolocal.com', 'spaces in@mail.com']) {
      assert.strictEqual(validateEmail(email), 'A valid email is required.', JSON.stringify(email));
    }
    for (const email of [null, undefined, 42, {}, []]) {
      assert.strictEqual(validateEmail(email), 'A valid email is required.', JSON.stringify(email));
    }

    assert.strictEqual(validatePassword('123456'), null);
    assert.strictEqual(validatePassword('secret123'), null);
    for (const password of ['12345', '']) {
      assert.strictEqual(validatePassword(password), 'Password must be at least 6 characters.', JSON.stringify(password));
    }
    for (const password of [null, undefined, 1234567, {}]) {
      assert.strictEqual(validatePassword(password), 'Password must be at least 6 characters.', JSON.stringify(password));
    }
  });

  // VAL-02 - a whitespace-only name is rejected, so a blank topic cannot be created.
  it('VAL-02 rejects empty and whitespace-only names', () => {
    assert.strictEqual(validateTopicName('Operating Systems'), null);
    assert.strictEqual(validateTopicName('   padded   '), null);
    for (const name of ['', '   ', '\t\n', null, undefined, 0, [], {}]) {
      assert.strictEqual(validateTopicName(name), 'Topic name is required.', JSON.stringify(name));
    }
  });

  // VAL-03 - document input needs only a body and a title.
  it('VAL-03 validates the document payload', () => {
    assert.strictEqual(validateDocumentInput({ title: 'Mid Sem 2025' }), null);
    assert.strictEqual(validateDocumentInput(null), 'Request body is required.');
    assert.strictEqual(validateDocumentInput('not-an-object'), 'Request body is required.');
    assert.strictEqual(validateDocumentInput({}), 'title is required.');
    assert.strictEqual(validateDocumentInput({ title: '   ' }), 'title is required.');
    assert.strictEqual(validateDocumentInput({ title: 42 }), 'title is required.');
  });

  // VAL-04 - question text must be a non-blank string, so an empty bulk question is refused.
  it('VAL-04 rejects blank question text', () => {
    assert.strictEqual(validateQuestionText('Explain BFS traversal'), null);
    for (const text of ['', '   ', '\n\t', null, undefined, 7, {}]) {
      assert.strictEqual(validateQuestionText(text), 'Each question requires questionText.', JSON.stringify(text));
    }
  });

  // VAL-05 - feedback: score and maxMarks are coerced with Number, so a numeric string is
  // accepted, then the ordering and range rules are applied in declaration order.
  it('VAL-05 validates the feedback score and maxMarks pair', () => {
    assert.strictEqual(validateFeedbackInput({ score: 0, maxMarks: 10 }), null);
    assert.strictEqual(validateFeedbackInput({ score: 10, maxMarks: 10 }), null);
    // Numeric strings are coerced rather than rejected.
    assert.strictEqual(validateFeedbackInput({ score: '7', maxMarks: '10' }), null);
    assert.strictEqual(validateFeedbackInput({ score: -1, maxMarks: 10 }), 'score must be a non-negative number.');
    assert.strictEqual(validateFeedbackInput({ score: 'abc', maxMarks: 10 }), 'score must be a non-negative number.');
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 0 }), 'maxMarks must be a positive number.');
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: -5 }), 'maxMarks must be a positive number.');
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: Number.POSITIVE_INFINITY }), 'maxMarks must be a positive number.');
    assert.strictEqual(validateFeedbackInput({ score: 11, maxMarks: 10 }), 'score must not exceed maxMarks.');
    assert.strictEqual(validateFeedbackInput(null), 'Feedback payload is required.');
    assert.strictEqual(validateFeedbackInput('nope'), 'Feedback payload is required.');
  });

  // VAL-06 - the optional feedback fields, each guarded independently.
  it('VAL-06 validates every optional feedback field', () => {
    for (const source of ALLOWED_FEEDBACK_SOURCES) {
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, source }), null, source);
    }
    assert.strictEqual(
      validateFeedbackInput({ score: 1, maxMarks: 2, source: 'gemini-2.5' }),
      `source must be one of: ${ALLOWED_FEEDBACK_SOURCES.join(', ')}.`,
    );
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, source: 7 }), `source must be one of: ${ALLOWED_FEEDBACK_SOURCES.join(', ')}.`);

    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, strengths: [] }), null);
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, strengths: 'hard' }), 'strengths must be an array of strings.');
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, improvements: 'none' }), 'improvements must be an array of strings.');

    // difficulty is matched case-insensitively.
    for (const difficulty of ALLOWED_FEEDBACK_DIFFICULTY) {
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, difficulty }), null, difficulty);
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, difficulty: difficulty.toUpperCase() }), null, difficulty);
    }
    assert.strictEqual(
      validateFeedbackInput({ score: 1, maxMarks: 2, difficulty: 'impossible' }),
      `difficulty must be one of: ${ALLOWED_FEEDBACK_DIFFICULTY.join(', ')}.`,
    );
  });

  // VAL-07 - focus and perceivedProgress are 0..100 inclusive on both ends. Note the
  // Number() coercion: a null value becomes 0 and is accepted, while a non-numeric
  // string becomes NaN and is rejected.
  it('VAL-07 bounds focus and perceivedProgress to 0..100', () => {
    for (const value of [0, 50, 100, '75']) {
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, focus: value }), null, JSON.stringify(value));
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, perceivedProgress: value }), null, JSON.stringify(value));
    }
    for (const value of [-1, 101, 'abc']) {
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, focus: value }), 'focus must be a number between 0 and 100.', JSON.stringify(value));
      assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, perceivedProgress: value }), 'perceivedProgress must be a number between 0 and 100.', JSON.stringify(value));
    }
    // Number(null) is 0, so an explicit null slips through the range check.
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, focus: null }), null);
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, notes: 'clear' }), null);
    assert.strictEqual(validateFeedbackInput({ score: 1, maxMarks: 2, notes: 42 }), 'notes must be a string.');
  });

  // VAL-08 - session feedback ratings are integers 1..5, checked in field declaration
  // order, and notes are length-capped at 2000 characters.
  it('VAL-08 validates session feedback ratings and the notes cap', () => {
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 1, difficultyRating: 5, progressRating: 3 }), null);
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: '4', difficultyRating: 2, progressRating: 2 }), null);
    // The first failing field in declaration order is the one reported.
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 0, difficultyRating: 9, progressRating: 3 }), 'focusRating must be an integer from 1 to 5.');
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 3, difficultyRating: 0, progressRating: 3 }), 'difficultyRating must be an integer from 1 to 5.');
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 3, difficultyRating: 3, progressRating: 6 }), 'progressRating must be an integer from 1 to 5.');
    // A fractional rating is not an integer.
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 3.5, difficultyRating: 3, progressRating: 3 }), 'focusRating must be an integer from 1 to 5.');
    assert.strictEqual(validateSessionFeedbackInput({ focusRating: 3, difficultyRating: 3, progressRating: 3, notes: 'x'.repeat(2000) }), null);
    assert.strictEqual(
      validateSessionFeedbackInput({ focusRating: 3, difficultyRating: 3, progressRating: 3, notes: 'x'.repeat(2001) }),
      'notes must be a string with at most 2000 characters.',
    );
    assert.strictEqual(
      validateSessionFeedbackInput({ focusRating: 3, difficultyRating: 3, progressRating: 3, notes: 42 }),
      'notes must be a string with at most 2000 characters.',
    );
    assert.strictEqual(validateSessionFeedbackInput(null), 'Session feedback payload is required.');
    assert.strictEqual(validateSessionFeedbackInput(undefined), 'Session feedback payload is required.');
    // An array is an object, so it passes the body guard and fails on the ratings instead.
    assert.strictEqual(validateSessionFeedbackInput([]), 'focusRating must be an integer from 1 to 5.');
  });

  // VAL-09 - the allow-lists the rest of the codebase branches on, and the shared HTTP
  // error shape.
  it('VAL-09 pins the allow-lists and the HttpError contract', () => {
    assert.deepStrictEqual(ALLOWED_FEEDBACK_SOURCES, ['gemini', 'simulated', 'local-fallback', 'manual']);
    assert.deepStrictEqual(ALLOWED_FEEDBACK_DIFFICULTY, ['easy', 'medium', 'hard']);
    assert.deepStrictEqual(VALID_SESSION_STATUSES, ['active', 'paused', 'completed', 'stopped']);

    const error = new HttpError(409, 'Schedule blocks cannot overlap.');
    assert.ok(error instanceof Error);
    assert.strictEqual(error.status, 409);
    assert.strictEqual(error.message, 'Schedule blocks cannot overlap.');
    assert.strictEqual(error.name, 'Error');

    // sendError is the single response shape used by the error middleware.
    let captured: any = null;
    const res = {
      status(code: number) {
        captured = { code, body: null as any };
        return res;
      },
      json(body: any) {
        captured.body = body;
        return res;
      },
    } as any;
    sendError(res, 422, 'title is required.');
    assert.deepStrictEqual(captured, { code: 422, body: { error: 'title is required.' } });
  });
});
