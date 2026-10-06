import type { Response } from 'express';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sendError(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}

export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'A valid email is required.';
  }
  return null;
}

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 6) {
    return 'Password must be at least 6 characters.';
  }
  return null;
}

export function validateTopicName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) {
    return 'Topic name is required.';
  }
  return null;
}

export function validateBlockInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.topicId !== 'string' || !body.topicId) return 'topicId is required.';
  if (typeof body.title !== 'string' || !body.title.trim()) return 'title is required.';
  if (!isValidScheduleDate(body.date)) return 'date must be a real YYYY-MM-DD date.';
  const startMinutes = scheduleStartMinutes(body.startTime);
  if (startMinutes === null) return 'startTime must be a valid HH:MM 24-hour time.';
  const minutes = Number(body.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 1) return 'durationMinutes must be a positive integer.';
  if (startMinutes + minutes > 24 * 60) return 'Schedule blocks cannot cross midnight.';
  return null;
}

export function scheduleStartMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isValidScheduleDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDocumentInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.title !== 'string' || !body.title.trim()) return 'title is required.';
  return null;
}

export const ALLOWED_FEEDBACK_SOURCES = ['gemini', 'simulated', 'local-fallback', 'manual'];
export const ALLOWED_FEEDBACK_DIFFICULTY = ['easy', 'medium', 'hard'];

export function validateFeedbackInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Feedback payload is required.';
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 0) return 'score must be a non-negative number.';
  const maxMarks = Number(body.maxMarks);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) return 'maxMarks must be a positive number.';
  if (score > maxMarks) return 'score must not exceed maxMarks.';
  if (body.source !== undefined) {
    if (typeof body.source !== 'string' || !ALLOWED_FEEDBACK_SOURCES.includes(body.source)) {
      return `source must be one of: ${ALLOWED_FEEDBACK_SOURCES.join(', ')}.`;
    }
  }
  if (body.strengths !== undefined && !Array.isArray(body.strengths)) return 'strengths must be an array of strings.';
  if (body.improvements !== undefined && !Array.isArray(body.improvements)) return 'improvements must be an array of strings.';
  if (body.difficulty !== undefined) {
    if (typeof body.difficulty !== 'string' || !ALLOWED_FEEDBACK_DIFFICULTY.includes(body.difficulty.toLowerCase())) {
      return `difficulty must be one of: ${ALLOWED_FEEDBACK_DIFFICULTY.join(', ')}.`;
    }
  }
  if (body.focus !== undefined && (!Number.isFinite(Number(body.focus)) || Number(body.focus) < 0 || Number(body.focus) > 100)) {
    return 'focus must be a number between 0 and 100.';
  }
  if (body.perceivedProgress !== undefined && (!Number.isFinite(Number(body.perceivedProgress)) || Number(body.perceivedProgress) < 0 || Number(body.perceivedProgress) > 100)) {
    return 'perceivedProgress must be a number between 0 and 100.';
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') return 'notes must be a string.';
  return null;
}

export function validateSessionFeedbackInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Session feedback payload is required.';
  for (const field of ['focusRating', 'difficultyRating', 'progressRating']) {
    const rating = Number(body[field]);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return `${field} must be an integer from 1 to 5.`;
  }
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
    return 'notes must be a string with at most 2000 characters.';
  }
  return null;
}

export function validateQuestionText(questionText: unknown): string | null {
  if (typeof questionText !== 'string' || !questionText.trim()) {
    return 'Each question requires questionText.';
  }
  return null;
}

export const VALID_SESSION_STATUSES = ['active', 'paused', 'completed', 'stopped'];

export const STUDY_ROOM_VISIBILITIES = ['PUBLIC', 'PRIVATE'];
export const FOCUS_SESSION_PHASES = ['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'];

// Focus sessions are timestamp-derived, so the duration only fixes `ends_at` once. The bounds
// keep a room usable (>= 5 minutes) and stop a client from parking a session open all day.
export const MIN_FOCUS_SECONDS = 5 * 60;
export const MAX_FOCUS_SECONDS = 120 * 60;
export const DEFAULT_FOCUS_SECONDS = 25 * 60;
export const DEFAULT_ROOM_MAX_PARTICIPANTS = 15;
export const MAX_ROOM_PARTICIPANTS = 100;

export function validateStudyRoomInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.name !== 'string' || !body.name.trim()) return 'Room name is required.';
  if (body.name.trim().length > 120) return 'Room name must be 120 characters or fewer.';
  for (const field of ['topic', 'subject', 'description']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') return `${field} must be a string.`;
  }
  if (body.visibility !== undefined && !STUDY_ROOM_VISIBILITIES.includes(body.visibility)) {
    return `visibility must be one of: ${STUDY_ROOM_VISIBILITIES.join(', ')}.`;
  }
  if (body.maxParticipants !== undefined) {
    const maxParticipants = Number(body.maxParticipants);
    if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > MAX_ROOM_PARTICIPANTS) {
      return `maxParticipants must be a whole number between 2 and ${MAX_ROOM_PARTICIPANTS}.`;
    }
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (typeof body.expiresAt !== 'string' || !Number.isFinite(Date.parse(body.expiresAt))) {
      return 'expiresAt must be an ISO timestamp.';
    }
    if (Date.parse(body.expiresAt) <= Date.now()) return 'expiresAt must be in the future.';
  }
  return null;
}

/**
 * Resolves the requested focus length in seconds from either `durationSeconds` or
 * `durationMinutes`, or `null` when the request is out of range. Callers use the same helper
 * for validation and for the value handed to the service, so the timer can never be created
 * from a duration the API would have rejected.
 */
export function focusDurationSeconds(body: any): number | null {
  const requested =
    body?.durationSeconds !== undefined && body?.durationSeconds !== null
      ? Number(body.durationSeconds)
      : body?.durationMinutes !== undefined && body?.durationMinutes !== null
        ? Number(body.durationMinutes) * 60
        : DEFAULT_FOCUS_SECONDS;
  if (!Number.isFinite(requested) || !Number.isInteger(requested)) return null;
  if (requested < MIN_FOCUS_SECONDS || requested > MAX_FOCUS_SECONDS) return null;
  return requested;
}

export function validateFocusSessionInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (body.phase !== undefined && !FOCUS_SESSION_PHASES.includes(body.phase)) {
    return `phase must be one of: ${FOCUS_SESSION_PHASES.join(', ')}.`;
  }
  if (focusDurationSeconds(body) === null) {
    const minutes = `${MIN_FOCUS_SECONDS / 60}-${MAX_FOCUS_SECONDS / 60}`;
    return `duration must be a whole number of minutes between ${minutes}.`;
  }
  return null;
}

export function validateStudyDoubtInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.title !== 'string' || !body.title.trim()) return 'Doubt title is required.';
  if (body.title.trim().length > 200) return 'Doubt title must be 200 characters or fewer.';
  if (typeof body.content !== 'string' || !body.content.trim()) return 'Doubt question is required.';
  if (body.content.length > 5000) return 'Doubt question must be 5000 characters or fewer.';
  return null;
}

export function validateStudyDoubtAnswerInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.content !== 'string' || !body.content.trim()) return 'Answer content is required.';
  if (body.content.length > 5000) return 'Answer must be 5000 characters or fewer.';
  return null;
}
