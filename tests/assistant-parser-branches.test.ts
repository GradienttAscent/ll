import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseSchedulingAssistantIntent, SchedulingAssistantIntent } from '../schedulingAssistant';

// Branch coverage for the deterministic intent parser in schedulingAssistant.ts.
//
// tests/scheduling-assistant.test.ts already pins the main happy paths (move topic, move date and
// period, shorten, swap, range query, next session, unsupported). These cases deliberately cover
// only branches that file never reaches: the weekday roll-forward, verbose clock words, the
// daily-minute floor, the clear-schedule shortcut, the self-swap guard, and degenerate input.
// Every assertion uses an injected clock, so nothing here depends on the wall clock.

const NOW = new Date('2026-09-14T10:00:00.000Z'); // Monday 2026-09-14
const parse = (message: string): SchedulingAssistantIntent => parseSchedulingAssistantIntent(message, NOW);

describe('ASST assistant parser branches (schedulingAssistant.ts)', () => {
  // ASST-01 - weekday interpretation. `weekdayDate` computes
  //   (weekday - now.getUTCDay() + 7) % 7 || 7
  // so the `|| 7` guard means naming TODAY's weekday resolves to the same weekday NEXT week
  // rather than to today. The other weekdays resolve to the next occurrence.
  it('ASST-01 resolves weekday names, rolling todays weekday forward a full week', () => {
    const cases: Array<[string, string]> = [
      ['Move OS to tuesday', '2026-09-15'],
      ['Move OS to wednesday', '2026-09-16'],
      ['Move OS to thursday', '2026-09-17'],
      ['Move OS to friday', '2026-09-18'],
      ['Move OS to saturday', '2026-09-19'],
      ['Move OS to sunday', '2026-09-20'],
      // NOW is a Monday, so "monday" must roll forward 7 days, not resolve to today.
      ['Move OS to monday evening', '2026-09-21'],
    ];
    for (const [message, expectedDate] of cases) {
      assert.deepStrictEqual(parse(message), { type: 'move_topic', topicQuery: 'os', targetDate: expectedDate, ...(message.includes('evening') ? { period: 'evening' } : {}) }, message);
    }
    // "weekend" is its own branch and resolves to the upcoming Saturday, with no period.
    assert.deepStrictEqual(parse('Move OS to the weekend'), { type: 'move_topic', topicQuery: 'os', targetDate: '2026-09-19' });
    // A leading "next" is stripped by stripTemporal and does not add a further week.
    assert.deepStrictEqual(parse('Move neural networks to next friday'), { type: 'move_topic', topicQuery: 'neural networks', targetDate: '2026-09-18' });
  });

  // ASST-02 - clock-word parsing. The 12 AM / 12 PM cases are the two special-cases in parseTime
  // where the hour must not be shifted; the verbose words are the fallbacks in parseVerboseTime.
  it('ASST-02 parses 12 AM, 12 PM, 24-hour and verbose clock words', () => {
    const cases: Array<[string, string]> = [
      ['Move OS to 12 AM', '00:00'],   // 12 am collapses to hour 0
      ['Move OS to 12 PM', '12:00'],   // 12 pm is not shifted to 24
      ['Move OS to 11:30 PM', '23:30'],
      ['Move OS to 9:05', '09:05'],
      ['Move OS to 2 PM', '14:00'],
      ['Move OS to noon', '12:00'],
      ['Move OS to midnight', '00:00'],
      ['Move OS to half past 3', '03:30'],
      ['Move OS to at 9 am', '09:00'],
    ];
    for (const [message, expectedTime] of cases) {
      assert.deepStrictEqual(
        parse(message),
        { type: 'move_topic', topicQuery: 'os', targetTime: expectedTime, targetTimeMode: 'exact' },
        message,
      );
    }
    // A bare "half past 3 pm" is captured by the 12-hour branch first, so the :30 is lost and
    // only 15:00 survives. Recorded as DEFECT-ASST-02; the assertion pins the current behaviour.
    assert.deepStrictEqual(parse('Move OS to half past 3 pm'), { type: 'move_topic', topicQuery: 'os', targetTime: '15:00', targetTimeMode: 'exact' });
  });

  // ASST-03 - `parseTime` yields no value for a target with no clock word at all. The intent is
  // still `move_time`, but with an undefined targetTime, which is the branch that later makes
  // the preview unable to place the block.
  it('ASST-03 emits a move_time intent with no target time when no clock word is present', () => {
    const intent = parse('Move my session to at 3');
    assert.strictEqual(intent.type, 'move_time');
    assert.strictEqual(intent.targetTime, undefined);
    assert.strictEqual(intent.sourceTime, undefined);
    assert.strictEqual(intent.sourceDate, '2026-09-14');
    assert.strictEqual(intent.targetDate, '2026-09-14');
  });

  // ASST-04 - the daily-minute cap. Hours are converted to minutes and everything is floored at
  // 30 minutes so a cap can never be smaller than one usable block.
  it('ASST-04 converts and floors the max daily minutes cap', () => {
    const cases: Array<[string, number]> = [
      ['Move all my DBMS sessions keeping 90 minutes per day', 90],
      ['Move all my DBMS sessions keeping 1 hours per day', 60],
      ['Move all my DBMS sessions keeping 1 hour per day', 60],
      ['Move all my DBMS sessions keeping 2 hours per day', 120],
      ['Move all my DBMS sessions keeping 3 hrs per day', 180],
      // The Math.max(30, ...) floor: 10 and 20 minutes both clamp up to 30.
      ['Move all my DBMS sessions keeping 10 minutes per day', 30],
      ['Move all my DBMS sessions keeping 20 minutes per day', 30],
    ];
    for (const [message, expected] of cases) {
      const intent = parse(message);
      assert.strictEqual(intent.type, 'move_topic', message);
      assert.strictEqual(intent.maxDailyMinutes, expected, message);
    }
  });

  // ASST-05 - DEFECT-ASST-01. `normalize` replaces '.' with a space before the cap is read, so a
  // fractional-hour cap has its decimal point removed and the integer remainder is re-matched as
  // a whole number of hours: "1.5 hours" becomes "1 5 hours" and is read as 5 hours = 300 minutes.
  // This is the opposite of the user's request and inflates the cap by more than 3x.
  it('ASST-05 documents the fractional-hour cap defect in the current parser', () => {
    const cases: Array<[string, number, number]> = [
      // message, minutes the user asked for, minutes the parser currently returns
      ['Move all my DBMS sessions keeping 1.5 hours per day', 90, 300],
      ['Move all my DBMS sessions keeping 0.5 hours per day', 30, 300],
      ['Move all my DBMS sessions keeping 1.25 hours per day', 75, 1500],
    ];
    for (const [message, requested, actual] of cases) {
      const intent = parse(message);
      assert.strictEqual(intent.type, 'move_topic', message);
      assert.strictEqual(intent.maxDailyMinutes, actual, `${message} currently yields ${actual} minutes`);
      assert.notStrictEqual(actual, requested, `${message} should ideally yield ${requested} minutes`);
    }
  });

  // ASST-06 - the clear-schedule shortcut is the only cancel path that sets `allMatches`, and it
  // is matched before the topic is extracted.
  it('ASST-06 sets allMatches only for the clear-schedule shortcut', () => {
    assert.deepStrictEqual(parse('clear my entire schedule'), { type: 'cancel_topic', allMatches: true, sourceDate: '2026-09-14' });
    assert.deepStrictEqual(parse('clear my schedule'), { type: 'cancel_topic', allMatches: true, sourceDate: '2026-09-14' });
    // A targeted cancel keeps a topic query and no allMatches flag.
    assert.deepStrictEqual(parse('cancel my os'), { type: 'cancel_topic', topicQuery: 'os', sourceDate: undefined });
    // DEFECT-ASST-03: "remove all my sessions" never reaches the allMatches branch, so "all"
    // is treated as a literal topic name and the cancel will not match the user's sessions.
    assert.deepStrictEqual(parse('remove all my sessions'), { type: 'cancel_topic', topicQuery: 'all', sourceDate: undefined });
  });

  // ASST-07 - an unavailable-period request with no named period falls back to 'evening', and
  // `excludedWeekdays` is only ever emitted when the message names two or more weekdays.
  it('ASST-07 defaults the unavailable period and gates excluded weekdays on a weekday count', () => {
    // No period word -> the 'evening' default.
    assert.deepStrictEqual(parse('I cannot study'), { type: 'unavailable_period', sourceDate: '2026-09-14', period: 'evening' });
    // "on fridays" is not a negation, so nothing is excluded.
    assert.deepStrictEqual(parse('I cannot study on fridays'), { type: 'unavailable_period', sourceDate: '2026-09-14', period: 'evening' });
    // Two named weekdays satisfy the `weekdayCount > 1` guard, so the excluded set survives.
    assert.deepStrictEqual(
      parse('I cannot study monday and wednesday afternoons'),
      { type: 'unavailable_period', sourceDate: '2026-09-14', period: 'afternoon', excludedWeekdays: [1, 3] },
    );
    // A bare "weekdays" also satisfies the guard through the `/\bweekdays?\b/` alternative.
    assert.deepStrictEqual(
      parse('I cannot study on weekdays only'),
      { type: 'unavailable_period', sourceDate: '2026-09-14', period: 'evening', excludedWeekdays: [0, 6] },
    );
    // DEFECT-ASST-04: a SINGLE named weekday is negated or declared off correctly by
    // excludedWeekdaysFrom, but the `weekdayCount > 1` guard then routes the request to the
    // return that omits the field, so the weekday is silently not excluded. These assertions
    // pin the current behaviour so a future fix is detectable.
    assert.deepStrictEqual(parse('I cannot study monday mornings'), { type: 'unavailable_period', sourceDate: '2026-09-21', period: 'morning' });
    assert.deepStrictEqual(parse('I am busy because friday is off'), { type: 'unavailable_period', sourceDate: '2026-09-18', period: 'evening' });
    assert.deepStrictEqual(parse('I cannot study on monday'), { type: 'unavailable_period', sourceDate: '2026-09-21', period: 'evening' });
  });

  // ASST-08 - a swap of a topic with itself is rejected by the `topicA !== topicB` guard, which
  // prevents a no-op swap from being previewed as a real change.
  it('ASST-08 rejects a self-swap as unsupported', () => {
    assert.deepStrictEqual(parse('swap os with os'), { type: 'unsupported' });
    assert.deepStrictEqual(parse('Swap DBMS with DBMS'), { type: 'unsupported' });
    // The guard is on the parsed topics, so two differently-named topics still parse.
    assert.deepStrictEqual(parse('Swap DBMS with OS'), { type: 'swap_sessions', topicQuery: 'dbms', otherTopicQuery: 'os' });
  });

  // ASST-09 - a multi-word topic must survive normalisation intact, because the service layer
  // matches this string against owned topic names. An ambiguous phrase is preserved verbatim
  // rather than being reduced to a single token.
  it('ASST-09 preserves multi-word topic names in the topicQuery', () => {
    const cases: Array<[string, string]> = [
      ['Move computer networks to tomorrow morning', 'computer networks'],
      ['move machine learning to friday', 'machine learning'],
      ['Make data structures shorter', 'data structures'],
      ['Cancel my operating systems sessions', 'operating systems'],
      ['give me a shorter machine learning session', 'machine learning'],
      ['move data structures to tomorrow', 'data structures'],
    ];
    for (const [message, expectedTopic] of cases) {
      assert.strictEqual(parse(message).topicQuery, expectedTopic, message);
    }
  });

  // ASST-10 - degenerate input must resolve to the unsupported type rather than throwing or
  // producing a partially populated intent.
  it('ASST-10 returns unsupported for empty and unrecognisable messages', () => {
    const cases = ['', '    ', '\t\n', 'what is the weather', 'hello there', '12345', '...', '!!!'];
    for (const message of cases) {
      assert.deepStrictEqual(parse(message), { type: 'unsupported' }, JSON.stringify(message));
    }
  });

  // ASST-11 - the range horizon is clamped, so a very large "next N days" cannot ask the
  // service to scan an unbounded window.
  it('ASST-11 clamps the query range horizon', () => {
    assert.deepStrictEqual(parse('what do i have in the next 0 days'), { type: 'query_range', sourceDate: '2026-09-14', rangeEndDate: '2026-09-15' });
    assert.deepStrictEqual(parse('what do i have in the next 3 days'), { type: 'query_range', sourceDate: '2026-09-14', rangeEndDate: '2026-09-17' });
    // 40 days is clamped to the 30 day maximum, giving a 2026-10-14 end date.
    assert.deepStrictEqual(parse('what do i have in the next 40 days'), { type: 'query_range', sourceDate: '2026-09-14', rangeEndDate: '2026-10-14' });
  });

  // ASST-12 - the bare "at N" clock branch. With no am/pm marker, 12 stays noon and every
  // other hour is read as a PM hour, so "at 3" means 15:00.
  it('ASST-12 reads a bare "at N" clock as a 12-hour time', () => {
    const cases: Array<[string, string]> = [
      ['move os to at 3', '15:00'],
      ['move os to at 11', '23:00'],
      ['move os to at 7 am', '07:00'],
      // An explicit pm is what disambiguates the bare 12.
      ['move os to at 12 pm', '12:00'],
      ['move os to at 12', '12:00'],
    ];
    for (const [message, expected] of cases) {
      assert.strictEqual(parse(message).targetTime, expected, message);
    }
  });

  // ASST-13 - the relative-day keywords. "tonight" is the only phrase that pins both a
  // date and a period; the others supply a date and leave the period to the default.
  it('ASST-13 resolves tonight and the day after tomorrow', () => {
    assert.deepStrictEqual(parse('make tonight unavailable'), { type: 'unavailable_period', sourceDate: '2026-09-14', period: 'evening' });
    assert.deepStrictEqual(parse('make the day after tomorrow unavailable'), { type: 'unavailable_period', sourceDate: '2026-09-16', period: 'evening' });
    assert.strictEqual(parse('move os to the day after tomorrow').targetDate, '2026-09-16');
    // Without an intent verb the same phrases are not recognised at all.
    assert.deepStrictEqual(parse('block the day after tomorrow'), { type: 'unsupported' });
  });

  // ASST-14 - the "N hours/day" slash form of the daily cap, including the minutes variant
  // and the shared 30 minute floor.
  it('ASST-14 reads the slash-form daily cap', () => {
    assert.strictEqual(parse('Move all my DBMS sessions keeping 2 hours/day').maxDailyMinutes, 120);
    assert.strictEqual(parse('Move all my DBMS sessions keeping 45 minutes/day').maxDailyMinutes, 45);
    assert.strictEqual(parse('Move all my DBMS sessions keeping 10 minutes/day').maxDailyMinutes, 30);
    // DEFECT-ASST-01 again: the decimal point is stripped before the cap is read.
    assert.strictEqual(parse('Move all my DBMS sessions keeping 1.5 hours/day').maxDailyMinutes, 300);
  });

  // ASST-15 - the weekly and weekend range windows.
  it('ASST-15 resolves this week and the weekend windows', () => {
    // 2026-09-14 is a Monday, so this week is the 14th through the 20th.
    assert.deepStrictEqual(parse('what is my plan this week'), { type: 'query_range', sourceDate: '2026-09-14', rangeEndDate: '2026-09-20' });
    assert.deepStrictEqual(parse('what do i have this weekend'), { type: 'query_range', sourceDate: '2026-09-14', rangeEndDate: '2026-09-21' });
    assert.deepStrictEqual(parse('how busy am i next weekend'), { type: 'query_range', sourceDate: '2026-09-21', rangeEndDate: '2026-09-28' });
    // A bare range phrase with no question word is not a query.
    assert.deepStrictEqual(parse('this week'), { type: 'unsupported' });
  });

  // ASST-16 - day shifts. "back"/"earlier" are negative and "forward"/"later" positive, and a
  // missing count defaults to one day.
  it('ASST-16 converts a relative day shift into a signed shiftDays', () => {
    const cases: Array<[string, number]> = [
      ['push my os sessions back 2 days', -2],
      ['move my sessions earlier by 3 days', -3],
      ['shift everything forward one day', 1],
      ['push my os sessions back a day', -1],
    ];
    for (const [message, expected] of cases) {
      const intent = parse(message);
      assert.strictEqual(intent.type, 'reschedule_day', message);
      assert.strictEqual(intent.shiftDays, expected, message);
      assert.strictEqual(intent.sourceDate, '2026-09-14', message);
    }
  });

  // ASST-17 - a bulk move between two named days becomes a day shift computed from the
  // resolved dates, and a two-party swap becomes a swap_sessions intent.
  it('ASST-17 resolves a bulk day move and a two-topic swap', () => {
    // "monday" rolls forward to the next Monday, the 21st; "wednesday" is the 16th.
    assert.deepStrictEqual(parse('move all my sessions from monday to wednesday'), { type: 'reschedule_day', sourceDate: '2026-09-21', shiftDays: -5 });
    assert.deepStrictEqual(parse('shift all my classes from today to friday'), { type: 'reschedule_day', sourceDate: '2026-09-14', shiftDays: 4 });
    assert.deepStrictEqual(parse('swap os and dbms'), { type: 'swap_sessions', topicQuery: 'os', otherTopicQuery: 'dbms' });
    assert.deepStrictEqual(parse('swap my os session with my dbms session'), { type: 'swap_sessions', topicQuery: 'os', otherTopicQuery: 'dbms' });
  });
});
