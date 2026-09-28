import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scheduleStartMinutes, validateBlockInput } from '../validation';

// Direct unit coverage for validation.ts. Every other suite reaches this module only through
// HTTP status codes, so the rule that selects WHICH message is returned, and the inclusive
// boundaries, were previously unobservable.

const VALID = {
  topicId: 'topic-1',
  title: 'Operating Systems',
  date: '2026-10-01',
  startTime: '10:00',
  durationMinutes: 60,
};

describe('UT-SCH schedule block input validation (validation.ts)', () => {
  // UT-SCH-01 - a well-formed block passes every rule, returning null (no error message).
  it('UT-SCH-01 accepts a valid schedule block and returns null', () => {
    assert.strictEqual(validateBlockInput(VALID), null);
    // Earliest legal start and the shortest legal duration are both accepted.
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '00:00', durationMinutes: 1 }), null);
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:59', durationMinutes: 1 }), null);
    // Surrounding whitespace in the title is tolerated because only emptiness is rejected.
    assert.strictEqual(validateBlockInput({ ...VALID, title: '  Operating Systems  ' }), null);
  });

  // UT-SCH-02 - durationMinutes must be a positive integer. This boundary is never reached by
  // the existing HTTP suites, which only ever post 30/60/90-minute blocks.
  it('UT-SCH-02 rejects zero, negative and non-integer durations', () => {
    const cases: Array<[unknown, string]> = [
      [0, 'durationMinutes must be a positive integer.'],
      [-5, 'durationMinutes must be a positive integer.'],
      [-0.5, 'durationMinutes must be a positive integer.'],
      [1.5, 'durationMinutes must be a positive integer.'],
      [Number.NaN, 'durationMinutes must be a positive integer.'],
      [undefined, 'durationMinutes must be a positive integer.'],
      ['sixty', 'durationMinutes must be a positive integer.'],
      [null, 'durationMinutes must be a positive integer.'],
    ];
    for (const [durationMinutes, expected] of cases) {
      assert.strictEqual(
        validateBlockInput({ ...VALID, durationMinutes }),
        expected,
        `durationMinutes=${String(durationMinutes)} should be rejected`,
      );
    }
    // The inclusive lower bound: 1 minute is the smallest accepted duration.
    assert.strictEqual(validateBlockInput({ ...VALID, durationMinutes: 1 }), null);
  });

  // UT-SCH-03 - the date must be a real calendar date and the time a real HH:MM clock time.
  it('UT-SCH-03 rejects impossible dates and malformed or out-of-range times', () => {
    const dates: unknown[] = ['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-1', '26-01-01', 'not-a-date', '', 20261001, null];
    for (const date of dates) {
      assert.strictEqual(validateBlockInput({ ...VALID, date }), 'date must be a real YYYY-MM-DD date.', `date=${String(date)} should be rejected`);
    }
    // 2028 is a leap year, so 29 February is a real date; 2026 is not.
    assert.strictEqual(validateBlockInput({ ...VALID, date: '2028-02-29' }), null);
    assert.strictEqual(validateBlockInput({ ...VALID, date: '2026-02-29' }), 'date must be a real YYYY-MM-DD date.');

    const times: unknown[] = ['9:00', '24:00', '10:60', '23:60', '1000', '10:00:00', '10:00 PM', '', 1000, null, undefined];
    for (const startTime of times) {
      assert.strictEqual(
        validateBlockInput({ ...VALID, startTime }),
        'startTime must be a valid HH:MM 24-hour time.',
        `startTime=${String(startTime)} should be rejected`,
      );
    }
    // The time rule is checked independently of duration, so a 1-minute block is used here to
    // isolate it from the cross-midnight rule.
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '00:00', durationMinutes: 1 }), null);
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:59', durationMinutes: 1 }), null);
  });

  // UT-SCH-04 - a block may end exactly at midnight but not one minute past it.
  it('UT-SCH-04 rejects blocks that cross midnight and allows the exact midnight boundary', () => {
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:30', durationMinutes: 31 }), 'Schedule blocks cannot cross midnight.');
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:59', durationMinutes: 2 }), 'Schedule blocks cannot cross midnight.');
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '12:00', durationMinutes: 721 }), 'Schedule blocks cannot cross midnight.');
    // The decision is `startMinutes + minutes > 1440`, so exactly 1440 is accepted.
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:30', durationMinutes: 30 }), null);
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '23:00', durationMinutes: 60 }), null);
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '00:00', durationMinutes: 1440 }), null);
  });

  // UT-SCH-05 - the guard clauses run in a fixed order, so the first failing field is reported.
  it('UT-SCH-05 reports the first failing field in declaration order', () => {
    assert.strictEqual(validateBlockInput(null), 'Request body is required.');
    assert.strictEqual(validateBlockInput('not-an-object'), 'Request body is required.');
    assert.strictEqual(validateBlockInput({ ...VALID, topicId: '' }), 'topicId is required.');
    assert.strictEqual(validateBlockInput({ ...VALID, topicId: 42 }), 'topicId is required.');
    assert.strictEqual(validateBlockInput({ ...VALID, title: '' }), 'title is required.');
    assert.strictEqual(validateBlockInput({ ...VALID, title: '   ' }), 'title is required.');
    assert.strictEqual(validateBlockInput({ ...VALID, title: 42 }), 'title is required.');
    // titleId and title both invalid -> topicId wins because it is checked first.
    assert.strictEqual(validateBlockInput({ ...VALID, topicId: '', title: '' }), 'topicId is required.');
    // An invalid date is reported before an invalid duration.
    assert.strictEqual(validateBlockInput({ ...VALID, date: 'nope', durationMinutes: 0 }), 'date must be a real YYYY-MM-DD date.');
    // An invalid startTime is reported before an invalid duration.
    assert.strictEqual(validateBlockInput({ ...VALID, startTime: '99:99', durationMinutes: 0 }), 'startTime must be a valid HH:MM 24-hour time.');
  });

  // UT-SCH-06 - scheduleStartMinutes is the single source of truth for the overlap checks and
  // for the midnight arithmetic, so its two-digit contract and its range ceiling matter.
  it('UT-SCH-06 scheduleStartMinutes converts HH:MM to minutes and rejects everything else', () => {
    const accepted: Array<[string, number]> = [['00:00', 0], ['09:00', 540], ['09:30', 570], ['11:00', 660], ['23:59', 1439]];
    for (const [value, expected] of accepted) {
      assert.strictEqual(scheduleStartMinutes(value), expected, `${value} should convert to ${expected} minutes`);
    }
    const rejected: unknown[] = ['9:00', '24:00', '23:60', '0900', '09:00:00', '09:00 PM', '', ' 09:00', 'ab:cd', 900, null, undefined, {}];
    for (const value of rejected) {
      assert.strictEqual(scheduleStartMinutes(value), null, `${JSON.stringify(value)} should not convert`);
    }
  });
});
