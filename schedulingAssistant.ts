export type AssistantPeriod = 'morning' | 'afternoon' | 'evening';

export type SchedulingAssistantIntent = {
  type: 'query_schedule' | 'unavailable_period' | 'move_topic' | 'move_time' | 'shorten_topic' | 'unsupported';
  topicQuery?: string;
  sourceDate?: string;
  targetDate?: string;
  period?: AssistantPeriod;
  sourceTime?: string;
  targetTime?: string;
  targetTimeMode?: 'exact' | 'after';
  allMatches?: boolean;
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
  return message.toLowerCase().replace(/[.,!?]/g, ' ').replace(/can't/g, 'cannot').replace(/i'm/g, 'i am').replace(/\s+/g, ' ').trim();
}

function parseTime(text: string): string | undefined {
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

function parseDatePeriod(text: string, now: Date): { date?: string; period?: AssistantPeriod } {
  let date: string | undefined;
  let period: AssistantPeriod | undefined;
  if (/\btonight\b/.test(text)) {
    date = dateKey(now);
    period = 'evening';
  } else if (/\btomorrow\b/.test(text)) {
    date = addDays(now, 1);
  } else if (/\btoday\b/.test(text)) {
    date = dateKey(now);
  } else {
    const weekday = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b${name}\\b`).test(text));
    if (weekday) date = weekdayDate(now, WEEKDAYS[weekday]);
  }
  if (/\bmorning\b/.test(text)) period = 'morning';
  if (/\bafternoon\b/.test(text)) period = 'afternoon';
  if (/\bevening\b/.test(text)) period = 'evening';
  return { date, period };
}

function topicText(value: string): string | undefined {
  const topic = value.replace(/\b(my|a|the|session)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return topic || undefined;
}

export function parseSchedulingAssistantIntent(message: string, now = new Date()): SchedulingAssistantIntent {
  const text = normalize(message);
  const datePeriod = parseDatePeriod(text, now);

  if (/\bwhat do i have\b|\bhow busy\b/.test(text)) {
    return { type: 'query_schedule', sourceDate: datePeriod.date || dateKey(now), period: datePeriod.period };
  }
  if (/\bwhat(?:'s| is) my next session\b|\bnext session\b/.test(text)) {
    return { type: 'query_schedule' };
  }
  const whenTopic = /\bwhen (?:(?:do|am) i )?(?:study(?:ing)? )?(.+)$/.exec(text);
  if (whenTopic) return { type: 'query_schedule', topicQuery: topicText(whenTopic[1]) };

  if (/\b(i cannot study|i am busy|clear my schedule)\b/.test(text)) {
    return { type: 'unavailable_period', sourceDate: datePeriod.date || dateKey(now), period: datePeriod.period || 'evening' };
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

  const moveTopic = /\b(?:move|shift) (.+?) to (.+)$/.exec(text);
  if (moveTopic) {
    const target = parseDatePeriod(moveTopic[2], now);
    const targetTime = parseTime(moveTopic[2]);
    const intent: SchedulingAssistantIntent = {
      type: 'move_topic',
      topicQuery: topicText(moveTopic[1]),
    };
    if (target.date) intent.targetDate = target.date;
    if (target.period) intent.period = target.period;
    if (targetTime) {
      intent.targetTime = targetTime;
      intent.targetTimeMode = /\bafter\b/.test(moveTopic[2]) ? 'after' : 'exact';
    }
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

  return { type: 'unsupported' };
}
