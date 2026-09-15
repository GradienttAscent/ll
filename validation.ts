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
