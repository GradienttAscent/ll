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
  if (typeof body.date !== 'string' || !body.date.trim()) return 'date is required.';
  if (typeof body.startTime !== 'string' || !body.startTime.trim()) return 'startTime is required.';
  const minutes = Number(body.durationMinutes);
  if (!Number.isFinite(minutes) || minutes < 1) return 'durationMinutes must be a positive number.';
  return null;
}

export function validateDocumentInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Request body is required.';
  if (typeof body.title !== 'string' || !body.title.trim()) return 'title is required.';
  return null;
}

export const ALLOWED_FEEDBACK_SOURCES = ['gemini', 'simulated', 'local-fallback', 'manual'];

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
  return null;
}

export function validateQuestionText(questionText: unknown): string | null {
  if (typeof questionText !== 'string' || !questionText.trim()) {
    return 'Each question requires questionText.';
  }
  return null;
}

export const VALID_SESSION_STATUSES = ['active', 'paused', 'completed', 'stopped'];