export type AssistantPeriod = 'morning' | 'afternoon' | 'evening';

export type SchedulingAssistantIntent = {
  type: 'query_schedule' | 'unavailable_period' | 'move_topic' | 'move_time' | 'shorten_topic'
    | 'extend_topic' | 'swap_sessions' | 'cancel_topic' | 'reschedule_day' | 'query_range' | 'generate_schedule'
    | 'reschedule_remaining' | 'complete_topic' | 'show_source' | 'shift_time' | 'unsupported';
  topicQuery?: string;
  otherTopicQuery?: string;
  sourceDate?: string;
  targetDate?: string;
  period?: AssistantPeriod;
  sourceTime?: string;
  targetTime?: string;
  otherTime?: string;
  targetTimeMode?: 'exact' | 'after';
  beforeTime?: string;
  afterTime?: string;
  excludedWeekdays?: number[];
  maxDailyMinutes?: number;
  allMatches?: boolean;
  rangeEndDate?: string;
  shiftDays?: number;
  shiftMinutes?: number;
  blockPosition?: 'first' | 'next';
  swapFirstTwo?: boolean;
  reorderFollowing?: boolean;
  durationMinutes?: number;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): string {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  return dateKey(result);
}

function weekdayDate(now: Date, weekday: number): string {
  const offset = (weekday - now.getUTCDay() + 7) % 7 || 7;
  return addDays(now, offset);
}

function normalize(message: string): string {
  return message
    .toLowerCase()
    // A decimal point sits between two digits ("1.5 hours") and must survive tokenisation;
    // stash it, drop the remaining sentence punctuation, then restore it.
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
    .replace(/[.,!?;]/g, ' ')
    .replace(/\u0000/g, '.')
    .replace(/can't/g, 'cannot').replace(/i'm/g, 'i am').replace(/\s+/g, ' ').trim();
}

function parseTime(text: string): string | undefined {
  // "half past N" must win over the plain 12-hour match, otherwise "half past 3 pm" is read as
  // 3 pm and the :30 is lost.
  const halfPastClock = /\bhalf past\s+(\d{1,2})\b/.exec(text);
  if (halfPastClock) {
    let hours = Number(halfPastClock[1]);
    if (/\bpm\b/.test(text) && hours !== 12) hours += 12;
    if (/\bam\b/.test(text) && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:30`;
  }
  const twelveHour = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/.exec(text);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2] || 0);
    if (twelveHour[3] === 'pm' && hours !== 12) hours += 12;
    if (twelveHour[3] === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const twentyFourHour = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  return twentyFourHour ? `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}` : undefined;
}

function parseVerboseTime(text: string): string | undefined {
  const existing = parseTime(text);
  if (existing) return existing;
  if (/\bmidnight\b/.test(text)) return '00:00';
  if (/\bnoon\b/.test(text)) return '12:00';
  const halfPast = /\bhalf past\s+(\d{1,2})\b/.exec(text);
  if (halfPast) {
    let hours = Number(halfPast[1]);
    if (/\bpm\b/.test(text)) hours = hours === 12 ? 12 : (hours + 12) % 24;
    if (/\bam\b/.test(text)) hours = hours === 12 ? 0 : hours;
    return `${String(hours).padStart(2, '0')}:30`;
  }
  const bare = /\bat\s+(1[0-2]|0?[1-9])\b/.exec(text);
  if (bare) {
    let hours = Number(bare[1]);
    const isMorning = /\b(?:morning|am)\b/.test(text);
    if (hours !== 12 && !isMorning) hours += 12;
    if (hours === 12 && /\bam\b/.test(text)) hours = 0;
    return `${String(hours).padStart(2, '0')}:00`;
  }
  return undefined;
}

function stripTemporal(value: string): string {
  return value
    .replace(/\b(?:today|tomorrow|tonight|the day after tomorrow|the|this|next|last)\b/g, ' ')
    .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|weekend)\b/g, ' ')
    .replace(/\b(?:morning|afternoon|evening|night|noon|midnight)\b/g, ' ')
    .replace(/\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm|hrs?|h)\b/g, ' ')
    .replace(/\b(?:in|within)\s+\d{1,3}\s*days?\s*(?:from now)?\b/g, ' ')
    .replace(/\b\d{1,3}\s*days?\s*(?:from now)?\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseDatePeriod(text: string, now: Date): { date?: string; period?: AssistantPeriod } {
  let date: string | undefined;
  let period: AssistantPeriod | undefined;
  if (/\btonight\b/.test(text)) {
    date = dateKey(now);
    period = 'evening';
  } else if (/\bthe day after tomorrow\b/.test(text)) {
    date = addDays(now, 2);
  } else if (/\btomorrow\b/.test(text)) {
    date = addDays(now, 1);
  } else if (/\btoday\b/.test(text)) {
    date = dateKey(now);
  } else {
    const weekend = /\bweekend\b/.test(text);
    if (weekend) {
      date = weekdayDate(now, WEEKDAYS.saturday);
    } else {
      const weekday = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b${name}\\b`).test(text));
      if (weekday) date = weekdayDate(now, WEEKDAYS[weekday]);
    }
    const daysFromNow = /\bin\s+(\d+)\s*days?\b/.exec(text);
    if (daysFromNow) date = addDays(now, Number(daysFromNow[1]));
  }
  if (/\bmornings?\b/.test(text)) period = 'morning';
  if (/\bafternoons?\b/.test(text)) period = 'afternoon';
  if (/\bevenings?\b/.test(text)) period = 'evening';
  return { date, period };
}

function topicText(value: string): string | undefined {
  const inner = stripTemporal(value);
  const topic = inner.replace(/\b(my|a|the|session)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return topic || undefined;
}

function excludedWeekdaysFrom(text: string): number[] {
  const result = new Set<number>();
  if (/\bweekdays? only\b|\bonly (?:on )?weekdays?\b/.test(text)) { result.add(0); result.add(6); }
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    const plural = `${name}s`;
    const negated = new RegExp(`\\b(?:not|cannot|can't|except|avoid|skip|never|excluding|other than)\\b[\\s\\w,.-]*\\b(?:on\\s+)?(?:${name}|${plural})\\b`, 'i');
    const declaredOff = new RegExp(`\\b(?:${name}|${plural})(?:\\s+(?:is|are))?\\s+(?:off|out|unavailable|bad)\\b`, 'i');
    if (negated.test(text) || declaredOff.test(text)) result.add(day);
  }
  return [...result];
}

function parseMaxDailyMinutes(text: string): number | undefined {
  const hourlyLimit = /\b(?:max(?:imum)?|at most|no more than|limit|only|just)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|minutes?)\s*\b(?:per|each|every|a)?\s*\bday\b/i.exec(text);
  if (hourlyLimit) {
    const value = Number(hourlyLimit[1]);
    if (Number.isFinite(value)) return /\bminutes?\b/.test(hourlyLimit[0]) ? Math.max(30, Math.round(value)) : Math.max(30, Math.round(value * 60));
  }
  const slashDaily = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|minutes?)\s*\/\s*day\b/i.exec(text);
  if (slashDaily) {
    const value = Number(slashDaily[1]);
    if (Number.isFinite(value)) return /\bminutes?\b/.test(slashDaily[0]) ? Math.max(30, Math.round(value)) : Math.max(30, Math.round(value * 60));
  }
  const bareDaily = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|minutes?)\s*(?:per|each|every|a)\s*day\b/i.exec(text);
  if (bareDaily) {
    const value = Number(bareDaily[1]);
    if (Number.isFinite(value)) return /\bminutes?\b/.test(bareDaily[0]) ? Math.max(30, Math.round(value)) : Math.max(30, Math.round(value * 60));
  }
  return undefined;
}

function targetClauseInfo(clause: string, now: Date): {
  date?: string;
  period?: AssistantPeriod;
  time?: string;
  beforeTime?: string;
  afterMode?: boolean;
  excludedWeekdays?: number[];
  maxDailyMinutes?: number;
} {
  const datePeriod = parseDatePeriod(clause, now);
  const beforeTimeMatch = /\b(?:before|by|no later than)\s+((?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)?|noon|midnight|half past\s+\d+)\b/.exec(clause);
  let beforeTime: string | undefined;
  if (beforeTimeMatch) {
    beforeTime = parseVerboseTime(beforeTimeMatch[1].trim());
  }
  const afterMode = /\bafter\b/.test(clause);
  const excludedWeekdays = excludedWeekdaysFrom(clause);
  const maxDailyMinutes = parseMaxDailyMinutes(clause);
  const time = beforeTimeMatch ? undefined : parseVerboseTime(clause);
  return { date: datePeriod.date, period: datePeriod.period, time, beforeTime, afterMode, excludedWeekdays, maxDailyMinutes };
}

// Removes every clock/bare-time token plus generic block words so a clause such as
// "today's 8:30 session" leaves no topic behind. Topic-bearing clauses keep their words.
function stripClock(value: string): string {
  return value
    .replace(/\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm|o'clock)\b/g, ' ')
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, ' ')
    .replace(/\b(?:half past|quarter past|quarter to)\s+\d{1,2}\b/g, ' ')
    .replace(/\b(?:noon|midnight)\b/g, ' ')
    .replace(/\b(?:session|sessions|block|blocks|class|classes|slot|slots)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Splits a "move X to Y" clause so the source and target carry independent date/period/time
// information. `topic` is undefined when the source clause is purely temporal (e.g. "8:30 block").
function sourceClauseInfo(clause: string, now: Date): {
  date?: string;
  period?: AssistantPeriod;
  time?: string;
  topic?: string;
} {
  const datePeriod = parseDatePeriod(clause, now);
  const time = parseTime(clause) || parseVerboseTime(clause);
  // Drop possessive clitics ("today's") so a purely temporal clause leaves no topic residue.
  const topic = topicText(stripClock(clause).replace(/'s\b/g, ' '));
  return {
    date: datePeriod.date,
    period: datePeriod.period,
    time,
    topic: /[a-z0-9]/i.test(topic || '') ? topic : undefined,
  };
}

function parseRange(text: string, now: Date): { sourceDate: string; rangeEndDate: string } | null {
  if (/\b(?:this|the) week\b/.test(text)) {
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    const monday = addDays(now, -mondayOffset);
    return { sourceDate: monday, rangeEndDate: addDays(now, 6 - mondayOffset) };
  }
  if (/\bnext week\b/.test(text)) {
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    return { sourceDate: addDays(now, 7 - mondayOffset), rangeEndDate: addDays(now, 13 - mondayOffset) };
  }
  if (/\b(?:this|the) weekend\b/.test(text)) {
    return { sourceDate: dateKey(now), rangeEndDate: addDays(now, 7) };
  }
  if (/\bnext weekend\b/.test(text)) {
    return { sourceDate: addDays(now, 7), rangeEndDate: addDays(now, 14) };
  }
  const nextDays = /\b(?:in the|the|over the)?\s*next\s+(\d+)\s+days\b/.exec(text);
  if (nextDays) {
    const days = Number(nextDays[1]);
    return { sourceDate: dateKey(now), rangeEndDate: addDays(now, Math.max(1, Math.min(30, days))) };
  }
  return null;
}

export function parseSchedulingAssistantIntent(message: string, now = new Date()): SchedulingAssistantIntent {
  const text = normalize(message);
  const datePeriod = parseDatePeriod(text, now);

  if (/\b(?:generate|create|make|build) (?:me )?(?:my |a |an )?(?:study |revised |new )?schedule\b/.test(text)) return { type: 'generate_schedule' };
  if (/\b(?:could not|couldn't|cannot|can't|was unable to) study today\b/.test(text) && /\b(reschedule|schedule|remaining|unfinished)\b/.test(text)) {
    return { type: 'reschedule_remaining' };
  }
  if (/\breschedule\b/.test(text) && /\b(?:remaining|unfinished|left\s*over|leftover|outstanding|rest)\b/.test(text)) {
    return { type: 'reschedule_remaining' };
  }
  const completeMatch = /\b(?:finished|completed|done with|wrapped up|through with)\s+(?:this |the |that |a |an )?(?:(.+?)\s+)?(?:topic|subject|chapter|unit|section)\b/.exec(text);
  if (completeMatch && /\bwhat(?:'s| is) next\b|\bnext\b/.test(text)) {
    return { type: 'complete_topic', topicQuery: topicText(completeMatch[1] || '') };
  }
  if (/\bshow (?:me )?(?:the )?slides?\b/.test(text)) {
    const showIntent: SchedulingAssistantIntent = { type: 'show_source' };
    // Only pin a date when the request names one; otherwise the handler uses the next session.
    if (datePeriod.date) showIntent.sourceDate = datePeriod.date;
    return showIntent;
  }

  const range = parseRange(text, now);
  if (range && /\b(what|how much|how many|my|plan|scheduled|busy|free)\b/.test(text)) {
    return { type: 'query_range', sourceDate: range.sourceDate, rangeEndDate: range.rangeEndDate };
  }

  if (/\bwhat do i have\b|\bhow busy\b/.test(text)) {
    return { type: 'query_schedule', sourceDate: datePeriod.date || dateKey(now), period: datePeriod.period };
  }
  if (/\bwhat(?:'s| is) my next session\b|\bnext session\b/.test(text) && !/\b(?:move|shift|reschedule|shorten|extend|cancel|remove|delete)\b/.test(text)) {
    return { type: 'query_schedule' };
  }
  const whenTopic = /\bwhen (?:(?:do|am) i )?(?:study(?:ing)? )?(.+)$/.exec(text);
  if (whenTopic) return { type: 'query_schedule', topicQuery: topicText(whenTopic[1]) };

  if (/\b(i cannot study|i am busy|unavailable)\b/.test(text)) {
    const excludedWeekdays = excludedWeekdaysFrom(text);
    if (excludedWeekdays.length > 0) {
      return { type: 'unavailable_period', sourceDate: dateKey(now), period: datePeriod.period || 'evening', excludedWeekdays };
    }
    return { type: 'unavailable_period', sourceDate: datePeriod.date || dateKey(now), period: datePeriod.period || 'evening' };
  }

  if (/\bswap my first two blocks?\b/.test(text)) {
    return { type: 'swap_sessions', swapFirstTwo: true };
  }

  const positionalMove = /\b(?:move|shift|reschedule) my (first|next) block to (.+)$/.exec(text);
  if (positionalMove) {
    const target = targetClauseInfo(positionalMove[2], now);
    if (!target.date || !target.time) return { type: 'unsupported' };
    return {
      type: 'move_topic', blockPosition: positionalMove[1] as 'first' | 'next', targetDate: target.date,
      targetTime: target.time, targetTimeMode: 'exact',
    };
  }

  const positionalShorten = /\bshorten my (first|next) session to (\d+)\s*minutes?\b/.exec(text);
  if (positionalShorten) {
    return { type: 'shorten_topic', blockPosition: positionalShorten[1] as 'first' | 'next', durationMinutes: Number(positionalShorten[2]) };
  }

  const positionalExtend = /\bextend my (first|next) session to (\d+)\s*minutes?\b/.exec(text);
  if (positionalExtend) {
    return { type: 'extend_topic', blockPosition: positionalExtend[1] as 'first' | 'next', durationMinutes: Number(positionalExtend[2]) };
  }

  const positionalCancel = /\b(?:cancel|remove|delete) my (first|next) session\b/.exec(text);
  if (positionalCancel) {
    return { type: 'cancel_topic', blockPosition: positionalCancel[1] as 'first' | 'next' };
  }

  if (/\b(cancel|remove|delete|drop|clear)\b/.test(text)) {
    if (/clear my (?:entire )?schedule/.test(text)
      || /\b(?:cancel|remove|delete|drop|clear)\s+(?:all|every|any)(?:\s+of)?\s+(?:my |the )?(?:sessions?|classes?|study blocks?|schedule|appointments?|blocks?)\b/.test(text)) {
      return { type: 'cancel_topic', allMatches: true, sourceDate: dateKey(now) };
    }
    const remainder = text.replace(/\b(?:cancel|remove|delete|drop|clear)\b/g, ' ').trim();
    const topic = topicText(remainder.replace(/\bsessions?\b/g, ' '));
    if (topic && !/\b(cannot|no|can't|never)\b/.test(text)) {
      return { type: 'cancel_topic', topicQuery: topic, sourceDate: datePeriod.date };
    }
  }

  if (/\bswap\b/.test(text)) {
    const afterVerb = text.replace(/^.*?\bswap\b/, '').trim();
    const parties = afterVerb.split(/\b(?:with|and|vs\.?|&|for)\b/) as string[];
    if (parties.length >= 2) {
      // A swap anchored on clock times ("swap the 8:30 and 10:00 sessions") carries no topic;
      // both sides reduce to pure clock tokens once dates and generic block words are stripped.
      const timeA = parseTime(parties[0]);
      const timeB = parseTime(parties[1]);
      const residualA = topicText(stripClock(parties[0]));
      const residualB = topicText(stripClock(parties.slice(1).join(' ')));
      if (timeA && timeB && !/[a-z]/i.test(residualA || '') && !/[a-z]/i.test(residualB || '')) {
        const timeSwap: SchedulingAssistantIntent = { type: 'swap_sessions', sourceTime: timeA, otherTime: timeB };
        if (datePeriod.date) timeSwap.sourceDate = datePeriod.date;
        return timeSwap;
      }
      const topicA = topicText(parties[0]);
      const topicB = topicText(parties.slice(1).join(' '));
      if (topicA && topicB && topicA !== topicB) {
        const swapIntent: SchedulingAssistantIntent = { type: 'swap_sessions', topicQuery: topicA, otherTopicQuery: topicB };
        if (datePeriod.date) swapIntent.sourceDate = datePeriod.date;
        return swapIntent;
      }
    }
  }

  const bulkTimeShift = /\b(?:move|shift|push|bring|reschedule)\b[\s\S]*?\b(forward|later|ahead|back|earlier|up)\b\s*by\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/.exec(text);
  if (bulkTimeShift && !/\b to \b/.test(text)) {
    const direction = /forward|later|ahead|up/.test(bulkTimeShift[1]) ? 1 : -1;
    const unitMinutes = /hour|hr/.test(bulkTimeShift[3]) ? 60 : 1;
    const shiftIntent: SchedulingAssistantIntent = { type: 'shift_time', shiftMinutes: direction * Math.round(Number(bulkTimeShift[2]) * unitMinutes), allMatches: true };
    const anchor = /\bafter\s+((?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:am|pm)?|\d{1,2}:\d{2})\b/.exec(text);
    if (anchor) {
      const anchorTime = parseTime(anchor[1]);
      if (anchorTime) shiftIntent.afterTime = anchorTime;
    }
    if (datePeriod.date) shiftIntent.sourceDate = datePeriod.date;
    return shiftIntent;
  }

  const dayShift = /\b(?:push|move|shift|bring|reschedule)\b.*?\b(back|forward|earlier|later)\b(?:\s+by)?\s*(?:(\d+)|one|a)\s*days?\b/.exec(text);
  if (dayShift && !/\b to \b/.test(text)) {
    const direction = dayShift[1];
    const count = Number(dayShift[2] || 1);
    const shiftDays = direction === 'back' || direction === 'earlier' ? -count : count;
    return { type: 'reschedule_day', sourceDate: datePeriod.date || dateKey(now), shiftDays };
  }

  const bulkShift = /\b(?:move|shift|bring|reschedule|push) all (?:my )?(?:sessions?|classes?|study blocks?|schedule|appointments?)\s+from\s+(.+?)\s+to\s+(.+)$/.exec(text);
  if (bulkShift && !/\b(?:before|after|at\s+\d)\b/.test(bulkShift[2])) {
    const fromDate = parseDatePeriod(bulkShift[1], now).date || datePeriod.date || dateKey(now);
    const targetDate = parseDatePeriod(bulkShift[2], now).date;
    if (targetDate) {
      const diff = Math.round((Date.UTC(Number(targetDate.slice(0, 4)), Number(targetDate.slice(5, 7)) - 1, Number(targetDate.slice(8, 10)))
        - Date.UTC(Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)) - 1, Number(fromDate.slice(8, 10)))) / 86400000);
      return { type: 'reschedule_day', sourceDate: fromDate, shiftDays: diff };
    }
  }

  const moveClauses = /\b(?:move|shift|reschedule|bring|push)\s+(?:my |the )?(.+?)\s+to\s+(.+)$/.exec(text);
  if (moveClauses) {
    const source = sourceClauseInfo(moveClauses[1], now);
    const target = targetClauseInfo(moveClauses[2], now);
    const reorderFollowing = /\breorder\b|\bfollowing\b|\bsubsequent\b|\brest of\b/.test(moveClauses[2]);
    if (source.time && !source.topic) {
      // A clock-anchored source ("the 8:30 block") names a specific session by start time.
      const intent: SchedulingAssistantIntent = { type: 'move_time', sourceTime: source.time };
      intent.sourceDate = source.date || datePeriod.date || dateKey(now);
      intent.targetDate = target.date || intent.sourceDate;
      if (target.time) intent.targetTime = target.time;
      if (target.period) intent.period = target.period;
      if (target.beforeTime) intent.beforeTime = target.beforeTime;
      if (target.excludedWeekdays && target.excludedWeekdays.length > 0) intent.excludedWeekdays = target.excludedWeekdays;
      if (reorderFollowing) intent.reorderFollowing = true;
      return intent;
    }
    if (!source.topic && source.date && target.date) {
      // A bare date source ("today's session") moves the whole day's sessions to the target date.
      const diff = Math.round((Date.UTC(Number(target.date.slice(0, 4)), Number(target.date.slice(5, 7)) - 1, Number(target.date.slice(8, 10)))
        - Date.UTC(Number(source.date.slice(0, 4)), Number(source.date.slice(5, 7)) - 1, Number(source.date.slice(8, 10)))) / 86400000);
      return { type: 'reschedule_day', sourceDate: source.date, shiftDays: diff };
    }
  }

  const timeMove = /\b(?:move|shift) (?:my )?(.+?) session to (.+)$/.exec(text);
  if (timeMove) {
    return {
      type: 'move_time',
      sourceDate: datePeriod.date || dateKey(now),
      sourceTime: parseTime(timeMove[1]),
      targetDate: datePeriod.date || dateKey(now),
      targetTime: parseTime(timeMove[2]),
    };
  }

  const constrainedMove = /\b(?:move|shift|reschedule|bring|push) (.+)$/.exec(text);
  if (constrainedMove && !/\b to \b/.test(text) && /\b(?:before|after|keeping|with|at most|no more than|max(?:imum)?|limiting|per day|each day|every day|only)\b/.test(text)) {
    const target = targetClauseInfo(text, now);
    const intent: SchedulingAssistantIntent = { type: 'move_topic' };
    const topicPart = constrainedMove[1].split(/\b(?:keeping|with|before|after|at most|no more than|max(?:imum)?|limiting)\b/)[0];
    const topic = topicText(topicPart);
    if (!topic) return { type: 'unsupported' };
    intent.topicQuery = topic;
    if (target.beforeTime) intent.beforeTime = target.beforeTime;
    if (target.time && target.afterMode) { intent.targetTime = target.time; intent.targetTimeMode = 'after'; }
    if (target.time && !target.afterMode && !target.beforeTime) { intent.targetTime = target.time; intent.targetTimeMode = 'exact'; }
    if (target.excludedWeekdays && target.excludedWeekdays.length > 0) intent.excludedWeekdays = target.excludedWeekdays;
    if (target.maxDailyMinutes) intent.maxDailyMinutes = target.maxDailyMinutes;
    if (target.date) intent.targetDate = target.date;
    if (/\ball\b/.test(constrainedMove[1])) intent.allMatches = true;
    return intent;
  }

  const moveTopic = /\b(?:move|shift|reschedule|bring|push) (.+?) to (.+)$/.exec(text);
  if (moveTopic) {
    const target = targetClauseInfo(moveTopic[2], now);
    const intent: SchedulingAssistantIntent = {
      type: 'move_topic',
      topicQuery: topicText(moveTopic[1]),
    };
    if (target.date) intent.targetDate = target.date;
    if (target.period) intent.period = target.period;
    if (target.beforeTime) {
      intent.beforeTime = target.beforeTime;
    } else if (target.time) {
      intent.targetTime = target.time;
      intent.targetTimeMode = target.afterMode ? 'after' : 'exact';
    }
    if (target.excludedWeekdays && target.excludedWeekdays.length > 0) intent.excludedWeekdays = target.excludedWeekdays;
    if (target.maxDailyMinutes) intent.maxDailyMinutes = target.maxDailyMinutes;
    if (/\ball\b/.test(moveTopic[1])) intent.allMatches = true;
    return intent;
  }

  const shortenAfter = /\b(?:make|shorten) (.+?) shorter(?:\s+(.*))?$/.exec(text);
  const shortenBefore = /\bgive me a shorter (.+?)(?: session)?(?:\s+(today|tomorrow|[a-z]+(?: morning| afternoon| evening)?))?$/.exec(text);
  if (shortenAfter || shortenBefore) {
    const match = shortenAfter || shortenBefore!;
    const source = parseDatePeriod(match[2] || '', now);
    return { type: 'shorten_topic', topicQuery: topicText(match[1]), sourceDate: source.date || datePeriod.date };
  }

  const extendAfter = /\b(?:make|extend) (.+?) longer(?:\s+(.*))?$/.exec(text);
  const extendTo = /\bextend (.+?) to (\d+)\s*minutes?\b/.exec(text);
  if (extendTo || extendAfter) {
    const match = extendTo || extendAfter!;
    const source = parseDatePeriod(extendAfter ? match[2] || '' : '', now);
    return {
      type: 'extend_topic',
      topicQuery: topicText(match[1]),
      durationMinutes: extendTo ? Number(match[2]) : undefined,
      sourceDate: source.date || datePeriod.date,
    };
  }

  return { type: 'unsupported' };
}
