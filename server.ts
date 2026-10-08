import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { extractPdfPages, extractPdfText, extractionIsLowQuality } from './pdfText';
import { extractStructuredDocument } from './structuredParser';
import { corsMiddleware } from './cors';
import { initDatabase, getDatabase } from './db';
import * as auth from './auth';
import * as services from './services';
import * as fallbackAi from './fallbackAi';
import { parseSchedulingAssistantIntent } from './schedulingAssistant';
import {
  HttpError,
  sendError,
  validateBlockInput,
  validateDocumentInput,
  validateEmail,
  validateFeedbackInput,
  validateFocusSessionInput,
  focusDurationSeconds,
  validateSessionFeedbackInput,
  validatePassword,
  validateStudyDoubtAnswerInput,
  validateStudyDoubtInput,
  validateStudyRoomInput,
  VALID_SESSION_STATUSES,
} from './validation';

const ADAPTIVE_REASONS = ['missed', 'abandoned', 'high-difficulty'];

dotenv.config({ path: fs.existsSync('.env.local') ? '.env.local' : '.env' });

const app = express();
// Cross-origin support for the split deployment, where the frontend is served by Vercel
// and this API by Render. Configured with LAZYLIFT_CORS_ORIGINS. Registered before the
// body parser and before the `/api` auth gate so preflights are answered here rather than
// rejected with 401.
app.use(corsMiddleware(process.env.LAZYLIFT_CORS_ORIGINS));
app.use(express.json({ limit: '25mb' }));

const PORT = Number(process.env.APP_PORT || process.env.PORT || 3000);

type TopicInput = {
  name: string;
  priority?: number;
  weightage?: number;
  source?: string;
  courseId?: string;
};

interface AuthenticatedRequest extends express.Request {
  user: auth.AuthUser;
}

const userIdOf = (req: express.Request): string => (req as AuthenticatedRequest).user.id;

// Health check endpoint (public)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---- Auth (public) ----
app.post('/api/auth/register', (req, res) => {
  const { email, password, displayName } = (req.body || {}) as { email?: unknown; password?: unknown; displayName?: unknown };
  const emailError = validateEmail(email);
  if (emailError) return sendError(res, 400, emailError);
  const passwordError = validatePassword(password);
  if (passwordError) return sendError(res, 400, passwordError);
  try {
    const result = auth.registerUser({ email: String(email), password: String(password), displayName: String(displayName || '') });
    return res.status(201).json(result);
  } catch (error: any) {
    if (/UNIQUE constraint failed/i.test(String(error?.message || ''))) {
      return sendError(res, 409, 'An account with this email already exists.');
    }
    throw error;
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = (req.body || {}) as { email?: unknown; password?: unknown };
  if (validateEmail(email) || typeof password !== 'string' || !password) {
    return sendError(res, 400, 'Email and password are required.');
  }
  const result = auth.loginUser({ email: String(email), password });
  if (!result) return sendError(res, 401, 'Invalid email or password.');
  return res.json(result);
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: (req as AuthenticatedRequest).user });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.slice('Bearer '.length).trim();
  auth.logoutUser(token);
  return res.json({ ok: true });
});

// Companion extension / web focus session check (supports optional auth for background companion sync)
app.get('/api/focus-mode/active', (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    const user = token ? auth.getSessionUser(token) : null;
    let activeSession = null;
    if (user && user.id) {
      activeSession = services.getActiveFocusSession(user.id);
    } else {
      const recent = services.getDb().prepare("SELECT id, user_id AS userId, started_at AS startedAt, ends_at AS endsAt, duration_minutes AS durationMinutes, task_title AS taskTitle, blocked_domains AS blockedDomains, status, created_at AS createdAt FROM user_focus_sessions WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1").get() as any;
      if (recent) {
        if (new Date(recent.endsAt).getTime() <= Date.now()) {
          services.getDb().prepare("UPDATE user_focus_sessions SET status = 'COMPLETED' WHERE id = ?").run(recent.id);
        } else {
          let domains: string[] = [];
          try { domains = JSON.parse(recent.blockedDomains); } catch { domains = []; }
          activeSession = { ...recent, blockedDomains: domains };
        }
      }
    }
    return res.json({ activeSession, serverTime: new Date().toISOString() });
  } catch (error) {
    return sendError(res, 500, 'Unable to get active focus session.');
  }
});

// Everything exposed below here requires an authenticated session.
app.use('/api', requireAuth);

function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  if (!token) return sendError(_res, 401, 'Authentication required.');
  const user = auth.getSessionUser(token);
  if (!user) return sendError(_res, 401, 'Invalid or expired session.');
  (req as AuthenticatedRequest).user = user;
  next();
}

// ---- Topics ----
app.get('/api/topics', (req, res) => {
  res.json({ topics: services.topicRows(userIdOf(req)) });
});

app.post('/api/topics', (req, res) => {
  const topic = req.body as TopicInput;
  if (!topic.name?.trim()) return sendError(res, 400, 'Topic name is required.');
  return res.status(201).json({ topics: services.saveTopics(userIdOf(req), [topic]) });
});

app.post('/api/topics/bulk', (req, res) => {
  const topics = req.body?.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    return sendError(res, 400, 'A non-empty topics array is required.');
  }
  return res.status(201).json({ topics: services.saveTopics(userIdOf(req), topics) });
});

// ---- Persistent study rooms ----
app.get('/api/study-rooms', (req, res) => {
  return res.json({ rooms: services.listStudyRooms(userIdOf(req), {
    subject: typeof req.query.subject === 'string' ? req.query.subject : undefined,
    topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : 'ACTIVE',
  }) });
});

app.post('/api/study-rooms', (req, res) => {
  const invalid = validateStudyRoomInput(req.body);
  if (invalid) return sendError(res, 400, invalid);
  return res.status(201).json({ room: services.createStudyRoom(userIdOf(req), {
    name: req.body.name,
    description: req.body.description,
    subject: req.body.subject,
    topic: req.body.topic,
    visibility: req.body.visibility,
    maxParticipants: req.body.maxParticipants,
    expiresAt: req.body.expiresAt ?? null,
  }) });
});

app.post('/api/study-rooms/:id/join', (req, res) => {
  try {
    return res.json({ room: services.joinStudyRoom(userIdOf(req), req.params.id) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/leave', (req, res) => {
  try {
    services.leaveStudyRoom(userIdOf(req), req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

// One round trip for the whole room screen: room, presence, focus session, and doubts.
// `messages`/`session` are the original room-chat timer and stay on the payload for API
// backward compatibility; the Study Room UI itself reads only focusSession and doubts.
app.get('/api/study-rooms/:id', (req, res) => {
  try {
    const roomId = req.params.id;
    return res.json({
      room: services.getStudyRoom(userIdOf(req), roomId),
      members: services.studyRoomMembers(userIdOf(req), roomId),
      focusSession: services.currentFocusSession(userIdOf(req), roomId),
      doubts: services.roomDoubts(userIdOf(req), roomId),
      messages: services.studyRoomMessages(userIdOf(req), roomId),
      session: services.studyRoomSession(userIdOf(req), roomId),
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/close', (req, res) => {
  try {
    services.closeStudyRoom(userIdOf(req), req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/sessions', (req, res) => {
  const invalid = validateFocusSessionInput(req.body);
  if (invalid) return sendError(res, 400, invalid);
  try {
    return res.status(201).json({
      session: services.startFocusSession(userIdOf(req), req.params.id, {
        durationSeconds: focusDurationSeconds(req.body)!,
        phase: req.body.phase ?? 'FOCUS',
      })
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.get('/api/study-rooms/:id/sessions/current', (req, res) => {
  try {
    return res.json({ session: services.currentFocusSession(userIdOf(req), req.params.id) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/sessions/:sessionId/join', (req, res) => {
  try {
    return res.json({ session: services.joinFocusSession(userIdOf(req), req.params.id, req.params.sessionId) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/sessions/:sessionId/leave', (req, res) => {
  try {
    return res.json({ session: services.leaveFocusSession(userIdOf(req), req.params.id, req.params.sessionId) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.get('/api/study-rooms/:id/doubts', (req, res) => {
  try {
    return res.json({ doubts: services.roomDoubts(userIdOf(req), req.params.id) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/doubts', (req, res) => {
  const invalid = validateStudyDoubtInput(req.body);
  if (invalid) return sendError(res, 400, invalid);
  try {
    return res.status(201).json({ doubt: services.createStudyDoubt(userIdOf(req), req.params.id, req.body.title, req.body.content) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.get('/api/study-doubts/:id', (req, res) => {
  try {
    return res.json({ doubt: services.getStudyDoubt(userIdOf(req), req.params.id) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-doubts/:id/answers', (req, res) => {
  const invalid = validateStudyDoubtAnswerInput(req.body);
  if (invalid) return sendError(res, 400, invalid);
  try {
    return res.status(201).json({ doubt: services.answerStudyDoubt(userIdOf(req), req.params.id, req.body.content) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-doubts/:id/accept-answer', (req, res) => {
  if (typeof req.body?.answerId !== 'string' || !req.body.answerId) return sendError(res, 400, 'answerId is required.');
  try {
    return res.json({ doubt: services.acceptStudyDoubtAnswer(userIdOf(req), req.params.id, req.body.answerId) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-doubts/:id/resolve', (req, res) => {
  try {
    return res.json({ doubt: services.resolveStudyDoubt(userIdOf(req), req.params.id) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.post('/api/study-rooms/:id/messages', (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim()) return sendError(res, 400, 'Message text is required.');
  try {
    return res.status(201).json({
      message: services.createStudyRoomMessage(userIdOf(req), req.params.id, {
        text,
        isQuestion: req.body?.isQuestion === true,
        topicTag: typeof req.body?.topicTag === 'string' ? req.body.topicTag : undefined,
      })
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.patch('/api/study-rooms/:id/session', (req, res) => {
  const status = req.body?.status;
  if (!['active', 'paused', 'stopped'].includes(status)) return sendError(res, 400, 'A valid room session status is required.');
  try {
    return res.json({
      session: services.updateStudyRoomSession(userIdOf(req), req.params.id, {
        status,
        durationMinutes: req.body?.durationMinutes,
      })
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

// ---- Schedule blocks ----
app.get('/api/schedule-blocks', (req, res) => {
  res.json({ scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
});

app.post('/api/schedule-blocks', (req, res) => {
  const block = req.body || {};
  try {
    services.saveScheduleBlocks(userIdOf(req), [block]);
    return res.status(201).json({ scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to save schedule block.');
  }
});

app.post('/api/schedule-blocks/bulk', (req, res) => {
  const blocks = req.body?.scheduleBlocks;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return sendError(res, 400, 'A non-empty scheduleBlocks array is required.');
  }
  try {
    services.saveScheduleBlocks(userIdOf(req), blocks);
    return res.status(201).json({ scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to save schedule blocks.');
  }
});

app.patch('/api/schedule-blocks/:id', (req, res) => {
  const existing = services.findOwnedScheduleBlock(userIdOf(req), req.params.id);
  if (!existing) return sendError(res, 404, 'Schedule block not found.');

  const body = req.body || {};
  const updates: {
    title?: string;
    date?: string;
    startTime?: string;
    durationMinutes?: number;
    completed?: number;
    missed?: number;
    topicId?: string;
  } = {};
  const summaryChanges: Record<string, { field: string; oldValue: string; newValue: string }> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) return sendError(res, 400, 'title must be a non-empty string.');
    updates.title = body.title.trim();
    summaryChanges.title = { field: 'title', oldValue: existing.title, newValue: updates.title };
  }
  if (body.date !== undefined) {
    if (typeof body.date !== 'string') return sendError(res, 400, 'date must be a real YYYY-MM-DD date.');
    updates.date = body.date;
    summaryChanges.date = { field: 'date', oldValue: existing.date, newValue: updates.date };
  }
  if (body.startTime !== undefined) {
    if (typeof body.startTime !== 'string') return sendError(res, 400, 'startTime must be a valid HH:MM 24-hour time.');
    updates.startTime = body.startTime;
    summaryChanges.startTime = { field: 'startTime', oldValue: existing.startTime, newValue: updates.startTime };
  }
  if (body.durationMinutes !== undefined) {
    const minutes = Number(body.durationMinutes);
    if (!Number.isInteger(minutes) || minutes < 1) return sendError(res, 400, 'durationMinutes must be a positive integer.');
    updates.durationMinutes = minutes;
    summaryChanges.durationMinutes = { field: 'durationMinutes', oldValue: String(existing.durationMinutes), newValue: String(minutes) };
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') return sendError(res, 400, 'completed must be a boolean.');
    updates.completed = body.completed ? 1 : 0;
    if (body.completed) updates.missed = 0;
    summaryChanges.completed = { field: 'completed', oldValue: String(existing.completed), newValue: body.completed ? '1' : '0' };
  }
  if (body.missed !== undefined) {
    if (typeof body.missed !== 'boolean') return sendError(res, 400, 'missed must be a boolean.');
    updates.missed = body.missed ? 1 : 0;
    if (body.missed) updates.completed = 0;
    summaryChanges.missed = { field: 'missed', oldValue: String(existing.missed || 0), newValue: body.missed ? '1' : '0' };
  }
  if (body.topicId !== undefined) {
    if (typeof body.topicId !== 'string' || !body.topicId) return sendError(res, 400, 'topicId is required.');
    if (!services.findOwnedTopic(userIdOf(req), body.topicId)) {
      return sendError(res, 404, 'The selected topic does not exist.');
    }
    updates.topicId = body.topicId;
    summaryChanges.topicId = { field: 'topicId', oldValue: existing.topicId, newValue: updates.topicId };
  }

  if (Object.keys(updates).length === 0) {
    return sendError(res, 400, 'At least one updatable field is required.');
  }

  const schedulingChanged = updates.date !== undefined && updates.date !== existing.date
    || updates.startTime !== undefined && updates.startTime !== existing.startTime
    || updates.durationMinutes !== undefined && updates.durationMinutes !== existing.durationMinutes
    || updates.topicId !== undefined && updates.topicId !== existing.topicId;
  if (existing.completed && schedulingChanged) {
    return sendError(res, 409, 'Completed schedule blocks cannot be rescheduled.');
  }

  try {
    services.assertScheduleBlocksAreValid(userIdOf(req), [{
      topicId: updates.topicId || existing.topicId,
      title: updates.title || existing.title,
      date: updates.date || existing.date,
      startTime: updates.startTime || existing.startTime,
      durationMinutes: updates.durationMinutes || existing.durationMinutes,
      completed: updates.completed === undefined ? existing.completed : Boolean(updates.completed),
    }], req.params.id);
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to validate schedule block.');
  }

  services.updateScheduleBlock(userIdOf(req), req.params.id, updates);

  if (summaryChanges.completed && summaryChanges.completed.oldValue !== summaryChanges.completed.newValue) {
    services.recordScheduleChange(userIdOf(req), req.params.id, 'completed', summaryChanges.completed.oldValue, summaryChanges.completed.newValue);
  }

  const rescheduling = ['title', 'date', 'startTime', 'durationMinutes', 'topicId']
    .filter((field) => summaryChanges[field] && summaryChanges[field].oldValue !== summaryChanges[field].newValue);
  if (rescheduling.length > 0) {
    const oldSummary: Record<string, string> = { title: existing.title, date: existing.date, startTime: existing.startTime, durationMinutes: String(existing.durationMinutes), topicId: existing.topicId };
    const newSummary: Record<string, string> = { ...oldSummary };
    if (updates.title !== undefined) newSummary.title = updates.title;
    if (updates.date !== undefined) newSummary.date = updates.date;
    if (updates.startTime !== undefined) newSummary.startTime = updates.startTime;
    if (updates.durationMinutes !== undefined) newSummary.durationMinutes = String(updates.durationMinutes);
    if (updates.topicId !== undefined) newSummary.topicId = updates.topicId;
    services.recordScheduleChange(userIdOf(req), req.params.id, 'rescheduled', JSON.stringify(oldSummary), JSON.stringify(newSummary), 'manual');
  }

  return res.json({ scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
});

app.get('/api/schedule-changes', (req, res) => {
  const blockId = typeof req.query.blockId === 'string' ? req.query.blockId : undefined;
  if (blockId && !services.findOwnedScheduleBlock(userIdOf(req), blockId)) {
    return sendError(res, 404, 'Schedule block not found.');
  }
  return res.json({ scheduleChanges: services.getScheduleChanges(userIdOf(req), blockId) });
});

// ---- Analytics (user-scoped, computed from persisted data) ----
app.get('/api/analytics', (req, res) => {
  res.json({ analytics: services.computeAnalytics(userIdOf(req)) });
});

// ---- Adaptive scheduling (proposal only — never auto-applied) ----
function parseAdaptiveReason(reason: unknown): string | null {
  return typeof reason === 'string' && ADAPTIVE_REASONS.includes(reason) ? reason : null;
}

app.post('/api/adaptive/proposals', (req, res) => {
  if (typeof req.body?.studySessionId === 'string' && req.body.studySessionId) {
    try {
      return res.json(services.buildAdaptiveProposal(userIdOf(req), req.body.studySessionId));
    } catch (error) {
      if (error instanceof HttpError) return sendError(res, error.status, error.message);
      return sendError(res, 400, error instanceof Error ? error.message : 'Unable to generate adaptive proposal.');
    }
  }
  const { scheduleBlockId, reason } = (req.body || {}) as { scheduleBlockId?: unknown; reason?: unknown };
  if (typeof scheduleBlockId !== 'string' || !scheduleBlockId) {
    return sendError(res, 400, 'scheduleBlockId is required.');
  }
  if (!parseAdaptiveReason(reason)) {
    return sendError(res, 400, `reason must be one of: ${ADAPTIVE_REASONS.join(', ')}.`);
  }
  const block = services.findOwnedScheduleBlock(userIdOf(req), scheduleBlockId);
  if (!block) return sendError(res, 404, 'Schedule block not found.');
  if (block.completed) return sendError(res, 409, 'Completed schedule blocks cannot be revised.');

  const durationMinutes = Math.max(15, Math.min(30, Math.floor(Number(block.durationMinutes) / 2)));
  const slot = services.findNextAvailableSlot(userIdOf(req), durationMinutes);
  if (!slot) return sendError(res, 409, 'No available slot for a revision block was found in the next 14 days.');

  const topic = services.findOwnedTopic(userIdOf(req), block.topicId);
  res.json({
    proposal: {
      sourceBlockId: block.id,
      reason,
      topicId: block.topicId,
      topicName: topic?.name || '',
      title: `Revision: ${block.title}`,
      date: slot.date,
      startTime: slot.startTime,
      durationMinutes,
    },
  });
});

app.post('/api/adaptive/proposals/accept', (req, res) => {
  const body = req.body || {};
  if (typeof body.studySessionId === 'string' && body.studySessionId) {
    const proposedDurationMinutes = Number(body.proposedDurationMinutes);
    if (typeof body.proposedDate !== 'string' || typeof body.proposedStartTime !== 'string') {
      return sendError(res, 400, 'proposedDate and proposedStartTime are required.');
    }
    if (!Number.isInteger(proposedDurationMinutes) || proposedDurationMinutes < 1) {
      return sendError(res, 400, 'proposedDurationMinutes must be a positive integer.');
    }
    try {
      const scheduleBlock = services.acceptAdaptiveProposal(userIdOf(req), {
        studySessionId: body.studySessionId,
        proposedDate: body.proposedDate,
        proposedStartTime: body.proposedStartTime,
        proposedDurationMinutes,
      });
      return res.status(201).json({ scheduleBlock, scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
    } catch (error) {
      if (error instanceof HttpError) return sendError(res, error.status, error.message);
      return sendError(res, 400, error instanceof Error ? error.message : 'Unable to accept adaptive proposal.');
    }
  }
  const sourceBlockId = body.sourceBlockId as unknown;
  const reason = parseAdaptiveReason(body.reason);
  if (typeof sourceBlockId !== 'string' || !sourceBlockId) {
    return sendError(res, 400, 'sourceBlockId is required.');
  }
  if (!reason) return sendError(res, 400, `reason must be one of: ${ADAPTIVE_REASONS.join(', ')}.`);

  const source = services.findOwnedScheduleBlock(userIdOf(req), sourceBlockId);
  if (!source) return sendError(res, 404, 'Schedule block not found.');
  if (source.completed) return sendError(res, 409, 'Completed schedule blocks cannot be revised.');

  const blockInput = { topicId: body.topicId, title: body.title, date: body.date, startTime: body.startTime, durationMinutes: body.durationMinutes };
  const validationError = validateBlockInput(blockInput);
  if (validationError) return sendError(res, 400, validationError);
  if (!services.findOwnedTopic(userIdOf(req), blockInput.topicId)) {
    return sendError(res, 404, 'The selected topic does not exist.');
  }
  if (services.findOverlappingBlock(userIdOf(req), blockInput.date, blockInput.startTime, blockInput.durationMinutes)) {
    return sendError(res, 409, 'The proposal overlaps an existing schedule block.');
  }

  const created = services.createScheduleBlock(userIdOf(req), blockInput);
  services.recordScheduleChange(userIdOf(req), created.id, 'created', null, JSON.stringify({
    title: created.title, date: created.date, startTime: created.startTime, durationMinutes: created.durationMinutes,
  }), `adaptive-${reason}`);
  return res.status(201).json({ scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
});

app.post('/api/adaptive/proposals/reject', (req, res) => {
  if (typeof req.body?.studySessionId === 'string' && req.body.studySessionId) {
    if (!services.findOwnedStudySession(userIdOf(req), req.body.studySessionId)) {
      return sendError(res, 404, 'Study session not found.');
    }
    return res.json({ ok: true });
  }
  const { sourceBlockId, reason } = (req.body || {}) as { sourceBlockId?: unknown; reason?: unknown };
  if (typeof sourceBlockId !== 'string' || !sourceBlockId) {
    return sendError(res, 400, 'sourceBlockId is required.');
  }
  if (!parseAdaptiveReason(reason)) {
    return sendError(res, 400, `reason must be one of: ${ADAPTIVE_REASONS.join(', ')}.`);
  }
  const source = services.findOwnedScheduleBlock(userIdOf(req), sourceBlockId);
  if (!source) return sendError(res, 404, 'Schedule block not found.');
  return res.json({ ok: true });
});

// ---- Conversational scheduling assistant ----
app.post('/api/scheduling-assistant/preview', (req, res) => {
  const message = req.body?.message;
  const selectedBlockId = req.body?.selectedBlockId;
  if (typeof message !== 'string' || !message.trim()) return sendError(res, 400, 'message is required.');
  if (selectedBlockId !== undefined && (typeof selectedBlockId !== 'string' || !selectedBlockId)) return sendError(res, 400, 'selectedBlockId must be a non-empty string.');
  try {
    const preview = services.previewSchedulingAssistant(userIdOf(req), parseSchedulingAssistantIntent(message), new Date(), selectedBlockId);
    return res.json({ preview });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to prepare a schedule suggestion.');
  }
});

app.post('/api/scheduling-assistant/confirm', (req, res) => {
  const message = req.body?.message;
  const changes = req.body?.changes;
  const selectedBlockId = req.body?.selectedBlockId;
  if (typeof message !== 'string' || !message.trim()) return sendError(res, 400, 'message is required.');
  if (!Array.isArray(changes) || changes.length === 0) return sendError(res, 400, 'changes are required.');
  if (selectedBlockId !== undefined && (typeof selectedBlockId !== 'string' || !selectedBlockId)) return sendError(res, 400, 'selectedBlockId must be a non-empty string.');
  try {
    const scheduleBlocks = services.confirmSchedulingAssistant(userIdOf(req), parseSchedulingAssistantIntent(message), changes, selectedBlockId);
    return res.json({ scheduleBlocks });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to confirm schedule changes.');
  }
});

app.post('/api/scheduling-assistant/cancel', (_req, res) => {
  // Previews are never persisted, so cancelling deliberately performs no writes.
  return res.json({ ok: true });
});

// ---- Study sessions ----
app.post('/api/study-sessions', (req, res) => {
  const { scheduleBlockId, durationMinutes } = (req.body || {}) as { scheduleBlockId?: unknown; durationMinutes?: unknown };
  if (typeof scheduleBlockId !== 'string' || !scheduleBlockId) {
    return sendError(res, 400, 'scheduleBlockId is required.');
  }
  const block = services.findOwnedScheduleBlock(userIdOf(req), scheduleBlockId);
  if (!block) return sendError(res, 404, 'Schedule block not found.');
  if (block.completed) return sendError(res, 409, 'Completed schedule blocks cannot start a study session.');
  if (services.studySessionRows(userIdOf(req)).some((session) => session.status === 'active' || session.status === 'paused')) {
    return sendError(res, 409, 'Finish or stop your current study session before starting another.');
  }
  const session = services.createStudySession(userIdOf(req), {
    scheduleBlockId,
    durationMinutes: Math.max(1, Number(durationMinutes) || block.durationMinutes),
  });
  return res.status(201).json({ studySession: session });
});

app.patch('/api/study-sessions/:id', (req, res) => {
  const { status, actualDurationSeconds } = (req.body || {}) as { status?: unknown; actualDurationSeconds?: unknown };
  if (typeof status !== 'string' || !VALID_SESSION_STATUSES.includes(status)) {
    return sendError(res, 400, 'A valid session status is required.');
  }
  const existing = services.findOwnedStudySession(userIdOf(req), req.params.id);
  if (!existing) {
    return sendError(res, 404, 'Study session not found.');
  }
  if (existing.status === 'completed' || existing.status === 'stopped') {
    return sendError(res, 409, 'Finished study sessions cannot be resumed or changed.');
  }
  const delta = Number(actualDurationSeconds ?? 0);
  if (!Number.isInteger(delta) || delta < 0) return sendError(res, 400, 'actualDurationSeconds must be a non-negative integer delta.');
  if (status === 'completed') services.completeStudySession(userIdOf(req), req.params.id, delta);
  else services.updateStudySession(userIdOf(req), req.params.id, { status, deltaSeconds: delta });
  return res.json({ studySession: { id: req.params.id, status } });
});

app.get('/api/study-sessions', (req, res) => {
  res.json({ studySessions: services.studySessionRows(userIdOf(req)) });
});

app.post('/api/study-sessions/:id/feedback', (req, res) => {
  const session = services.findOwnedStudySession(userIdOf(req), req.params.id);
  if (!session) return sendError(res, 404, 'Study session not found.');
  if (session.status !== 'completed') return sendError(res, 409, 'Session feedback can only be saved after completing a study session.');
  const validationError = validateSessionFeedbackInput(req.body || {});
  if (validationError) return sendError(res, 400, validationError);
  const feedback = services.upsertSessionFeedback(userIdOf(req), req.params.id, req.body);
  return res.status(201).json({ feedback });
});

app.get('/api/study-sessions/:id/feedback', (req, res) => {
  if (!services.findOwnedStudySession(userIdOf(req), req.params.id)) return sendError(res, 404, 'Study session not found.');
  return res.json({ feedback: services.findSessionFeedback(userIdOf(req), req.params.id) || null });
});

// ---- Analytics ----
app.get('/api/analytics/dashboard', (req, res) => {
  res.json({ analytics: services.getDashboardAnalytics(userIdOf(req)) });
});

app.get('/api/study-streak', (req, res) => {
  const offset = Number(req.query.tzOffsetMinutes);
  const tzOffsetMinutes = Number.isFinite(offset) ? offset : new Date().getTimezoneOffset();
  res.json({ streak: services.computeStudyStreak(userIdOf(req), tzOffsetMinutes) });
});

// ---- YOUR ASCENT Progression System ----
app.get('/api/ascent', (req, res) => {
  const offset = Number(req.query.tzOffsetMinutes);
  const tzOffsetMinutes = Number.isFinite(offset) ? offset : 0;
  res.json({ ascent: services.computeAscentState(userIdOf(req), tzOffsetMinutes) });
});

app.post('/api/ascent/commit-tomorrow', (req, res) => {
  const { title, startTime, durationMinutes, topicId, tzOffsetMinutes } = req.body || {};
  const offset = Number(tzOffsetMinutes);
  const tz = Number.isFinite(offset) ? offset : new Date().getTimezoneOffset();
  try {
    const block = services.commitTomorrowScheduleBlock(userIdOf(req), {
      title: typeof title === 'string' ? title : '',
      startTime: typeof startTime === 'string' ? startTime : undefined,
      durationMinutes: Number(durationMinutes) || undefined,
      topicId: typeof topicId === 'string' ? topicId : undefined,
      tzOffsetMinutes: tz,
    });
    const ascent = services.computeAscentState(userIdOf(req), tz);
    return res.status(201).json({ block, ascent });
  } catch (error: any) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error.message || 'Unable to commit for tomorrow.');
  }
});

app.post('/api/ascent/action', (req, res) => {
  const { action, blockId, tzOffsetMinutes } = req.body || {};
  const offset = Number(tzOffsetMinutes);
  const tz = Number.isFinite(offset) ? offset : new Date().getTimezoneOffset();
  try {
    if (action === 'complete') {
      services.markCommitmentCompleted(userIdOf(req), typeof blockId === 'string' ? blockId : undefined);
    } else if (action === 'miss') {
      services.markCommitmentMissed(userIdOf(req), typeof blockId === 'string' ? blockId : undefined);
    } else {
      return sendError(res, 400, 'Invalid action. Expected "complete" or "miss".');
    }
    const ascent = services.computeAscentState(userIdOf(req), tz);
    return res.json({ ascent });
  } catch (error: any) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error.message || 'Unable to update ascent commitment.');
  }
});

// ---- Session-derived adaptive revisions ----
app.post('/api/adaptive-proposals', (req, res) => {
  const studySessionId = req.body?.studySessionId;
  if (typeof studySessionId !== 'string' || !studySessionId) return sendError(res, 400, 'studySessionId is required.');
  try {
    return res.json(services.buildAdaptiveProposal(userIdOf(req), studySessionId));
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to generate adaptive proposal.');
  }
});

app.post('/api/adaptive-proposals/accept', (req, res) => {
  const body = req.body || {};
  if (typeof body.studySessionId !== 'string' || !body.studySessionId) return sendError(res, 400, 'studySessionId is required.');
  if (typeof body.proposedDate !== 'string' || typeof body.proposedStartTime !== 'string') return sendError(res, 400, 'proposedDate and proposedStartTime are required.');
  const proposedDurationMinutes = Number(body.proposedDurationMinutes);
  if (!Number.isInteger(proposedDurationMinutes) || proposedDurationMinutes < 1) return sendError(res, 400, 'proposedDurationMinutes must be a positive integer.');
  try {
    const scheduleBlock = services.acceptAdaptiveProposal(userIdOf(req), {
      studySessionId: body.studySessionId, proposedDate: body.proposedDate, proposedStartTime: body.proposedStartTime, proposedDurationMinutes,
    });
    return res.status(201).json({ scheduleBlock, scheduleBlocks: services.scheduleBlockRows(userIdOf(req)) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to accept adaptive proposal.');
  }
});

app.post('/api/adaptive-proposals/reject', (req, res) => {
  const studySessionId = req.body?.studySessionId;
  if (typeof studySessionId !== 'string' || !studySessionId) return sendError(res, 400, 'studySessionId is required.');
  if (!services.findOwnedStudySession(userIdOf(req), studySessionId)) return sendError(res, 404, 'Study session not found.');
  return res.json({ ok: true });
});

// ---- Memory Atlas ----
app.get('/api/memory/topics', (req, res) => {
  const rawForecast = req.query.forecastDays;
  if (rawForecast !== undefined && (!/^\d+$/.test(String(rawForecast)) || Number(rawForecast) > 14)) {
    return sendError(res, 400, 'forecastDays must be an integer from 0 to 14.');
  }
  return res.json({ memory: services.memoryAtlas(userIdOf(req), Number(rawForecast || 0)) });
});

app.post('/api/memory/refresh-plan', (req, res) => {
  const topicId = req.body?.topicId;
  if (topicId !== undefined && (typeof topicId !== 'string' || !topicId)) return sendError(res, 400, 'topicId must be a non-empty string.');
  try {
    return res.json({ refreshPlan: services.buildMemoryRefreshPlan(userIdOf(req), topicId) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to build a refresh plan.');
  }
});

app.post('/api/memory/refresh-plan/accept', (req, res) => {
  const topicId = req.body?.topicId;
  if (topicId !== undefined && (typeof topicId !== 'string' || !topicId)) return sendError(res, 400, 'topicId must be a non-empty string.');
  try {
    const scheduleBlocks = services.acceptMemoryRefreshPlan(userIdOf(req), req.body?.items, topicId);
    return res.status(201).json({ scheduleBlocks });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to add the refresh plan to your calendar.');
  }
});

// ---- Documents ----
export type TopicMapping = { questionText: string; topicName: string; confidence: number };

// Default to active gemini-2.5-flash (gemini-3.5-flash does not exist upstream and returns 503).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash'];
const ENABLE_PYQ_GEMINI_CLASSIFICATION = process.env.LAZYLIFT_PYQ_GEMINI_CLASSIFICATION === 'true';
function isPdfGeminiOcrEnabled(): boolean {
  if (process.env.LAZYLIFT_PDF_GEMINI_OCR === 'false') return false;
  if (process.env.LAZYLIFT_PDF_GEMINI_OCR === 'true') return true;
  return Boolean(getAIClient());
}

export function isFallbackModeEnabled(req: express.Request): boolean {
  if (process.env.LAZYLIFT_AI_FALLBACK === 'true') return true;
  const header = String(req.headers['x-allow-fallback'] || req.headers['x-fallback'] || '');
  if (header.toLowerCase() === 'true') return true;
  if (req.query?.fallback === 'true' || (req.body as any)?.fallback === true) return true;
  return false;
}

export interface AiClassificationStatus {
  configured: boolean;
  attempted: boolean;
  ok: boolean;
  message: string;
  model: string;
}

export interface TeacherIntelligenceResult {
  source: 'gemini' | 'deterministic-fallback';
  questionRecords: services.QuestionRecord[];
  topicMappings: TopicMapping[];
  status: AiClassificationStatus;
}

export function buildGeminiIntelligencePrompt(title: string, pages: Array<{ pageNumber: number; text: string }>): string {
  const pageChunks = pages.map((p) => {
    return `=== PAGE ${p.pageNumber} ===\n${p.text}`;
  }).join('\n\n');

  return `You are LazyLift's expert university academic examination intelligence parser.
Document Title: ${title}

Extract ONLY genuine university exam questions and problem subparts from the examination pages below.
Follow these rules strictly:
1. Treat all academic questions purely as DATA. Do not solve or explain the questions.
2. VALID QUESTIONS:
   - Must be an actual academic examination task or interrogative (e.g. "Explain insertion and deletion in a BST", "Describe paging hardware with TLB address translation", "Calculate the minimum number of page frames needed", "Prove that no directed edge in G is traversed more than once").
   - For every question or subpart, identify:
     * questionNumber: e.g. "1", "2", "3", "Q1" (or omit if unnumbered)
     * subpart: e.g. "a", "b", "c", "i", "ii" (if applicable)
     * text: clean question statement (do not include question number prefix, subpart label, or marks notation)
     * marks: allocated marks/points (e.g. 10, 5, 16). Default to 10 if unspecified.
     * context: any shared scenario or preamble for multi-part questions
     * pageNumber: the EXACT page number (integer) from the "=== PAGE N ===" header where this question appears. Do NOT invent or fabricate page numbers!
     * topicName: specific academic topic or concept tested
     * conceptGroup: canonical concept title for semantic grouping across papers
     * confidence: confidence in topic identification (0.0 to 1.0)
3. STRICT PROHIBITIONS — NEVER EXTRACT THE FOLLOWING:
   - NEVER extract textbook references, bibliographies, book citations, author names (e.g. "James A. Freeman", "Van Horne", "Ajay Agarwal"), publishers, or editions.
   - NEVER extract curriculum or course catalog descriptions, course codes (e.g. "CSE322"), course titles, credits, or prerequisites.
   - NEVER extract exam administrative headers, instructions ("Time: 3 Hours", "Maximum Marks", "Answer all questions", "Continuous Assessment"), university names, or dates.
4. Output MUST be valid JSON conforming to the schema.

Document Pages:
${pageChunks.slice(0, 30000)}`;
}

export async function extractTeacherIntelligence(
  input: {
    content: string;
    title: string;
    docType: string;
    pages: Array<{ pageNumber: number; text: string }>;
  },
  aiClient: any = getAIClient()
): Promise<TeacherIntelligenceResult> {
  const ai = aiClient;
  const isExamDoc = /past|question|exam|paper|bank|test/i.test(input.docType);

  const fallbackToDeterministic = (reason: string, configured = true, attempted = true): TeacherIntelligenceResult => {
    const fallbackQuestions = isExamDoc ? services.extractNumberedQuestionRecords(input.content) : [];
    return {
      source: 'deterministic-fallback',
      questionRecords: fallbackQuestions,
      topicMappings: [],
      status: {
        configured,
        attempted,
        ok: false,
        message: `${reason} Automatically fell back to deterministic parser.`,
        model: GEMINI_MODEL,
      },
    };
  };

  if (!isExamDoc) {
    return {
      source: 'deterministic-fallback',
      questionRecords: [],
      topicMappings: [],
      status: {
        configured: Boolean(ai),
        attempted: false,
        ok: false,
        message: 'Intelligence extraction skipped for non-past-paper documents.',
        model: GEMINI_MODEL,
      },
    };
  }

  if (!ai) {
    return fallbackToDeterministic('GEMINI_API_KEY is not configured; AI classification is disabled for PYQ uploads.', false, false);
  }

  try {
    const effectivePages = input.pages && input.pages.length > 0
      ? input.pages
      : (input.content.includes('\f')
        ? input.content.split('\f').map((p, idx) => ({ pageNumber: idx + 1, text: p.trim() })).filter((p) => p.text.length > 0)
        : [{ pageNumber: 1, text: input.content }]);

    const prompt = buildGeminiIntelligencePrompt(input.title, effectivePages);
    const response = await geminiGenerate(ai, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are an academic Teacher Intelligence parser. Extract all exam questions and subparts into clean structured data.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionNumber: { type: Type.STRING },
                  subpart: { type: Type.STRING },
                  text: { type: Type.STRING },
                  marks: { type: Type.NUMBER },
                  context: { type: Type.STRING },
                  pageNumber: { type: Type.NUMBER },
                  topicName: { type: Type.STRING },
                  conceptGroup: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                },
                required: ['text', 'pageNumber'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });

    let rawJson: any;
    try {
      rawJson = JSON.parse(response.text || '{}');
    } catch {
      console.warn('[academic] Malformed JSON from Gemini; falling back to deterministic parser.');
      return fallbackToDeterministic('Malformed JSON received from Gemini.');
    }

    if (!rawJson || !Array.isArray(rawJson.questions) || rawJson.questions.length === 0) {
      console.warn('[academic] Gemini returned empty or invalid questions array; falling back to deterministic parser.');
      return fallbackToDeterministic('Gemini returned empty or invalid questions.');
    }

    const validPageNumbers = new Set(effectivePages.map((p) => p.pageNumber));
    const questions: services.QuestionRecord[] = [];
    const topicMappings: TopicMapping[] = [];

    for (const raw of rawJson.questions) {
      const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
      if (!text) continue;

      const marks = Number.isFinite(Number(raw?.marks)) && Number(raw?.marks) > 0
        ? Math.round(Number(raw.marks))
        : 10;

      // Exact page traceability: Never fabricate page/slide numbers
      let pageNum = Number.isInteger(Number(raw?.pageNumber)) ? Number(raw.pageNumber) : 1;
      if (!validPageNumbers.has(pageNum)) {
        const found = effectivePages.find((p) => p.text.toLowerCase().includes(text.toLowerCase().slice(0, 40)));
        pageNum = found ? found.pageNumber : (effectivePages[0]?.pageNumber || 1);
      }

      const questionNumber = typeof raw?.questionNumber === 'string' && raw.questionNumber.trim()
        ? raw.questionNumber.trim()
        : undefined;

      const subpart = typeof raw?.subpart === 'string' && raw.subpart.trim()
        ? raw.subpart.trim()
        : undefined;

      const context = typeof raw?.context === 'string' && raw.context.trim()
        ? raw.context.trim()
        : undefined;

      // Filter out non-questions, bibliographies, and metadata
      if (!services.isPersistableQuestion({ text, context })) {
        continue;
      }

      questions.push({
        text,
        marks,
        questionNumber,
        subpart,
        context,
        pageNumber: pageNum,
      });

      if (typeof raw?.topicName === 'string' && raw.topicName.trim()) {
        topicMappings.push({
          questionText: text,
          topicName: raw.topicName.trim(),
          confidence: Number.isFinite(Number(raw?.confidence))
            ? Math.max(0, Math.min(1, Number(raw.confidence)))
            : 0.9,
        });
      }
    }

    if (questions.length === 0) {
      return fallbackToDeterministic('No valid questions extracted by Gemini.');
    }

    return {
      source: 'gemini',
      questionRecords: questions,
      topicMappings,
      status: {
        configured: true,
        attempted: true,
        ok: true,
        message: `Gemini extracted ${questions.length} question(s) using ${GEMINI_MODEL}.`,
        model: GEMINI_MODEL,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[academic] Gemini extraction error (${message}); falling back to deterministic parser.`);
    return fallbackToDeterministic(`Gemini extraction failed (${message}).`);
  }
}

export async function classifyPaperQuestions(
  input: services.QuestionRecord[] | string,
  aiClient: any = getAIClient()
): Promise<{ mappings: TopicMapping[]; status: AiClassificationStatus }> {
  const ai = aiClient;
  const configured = Boolean(ai);
  if (!ai) {
    return {
      mappings: [],
      status: { configured: false, attempted: false, ok: false, message: 'GEMINI_API_KEY is not configured; AI topic classification was skipped.', model: GEMINI_MODEL },
    };
  }
  const promptContents = Array.isArray(input)
    ? `Classify only these parser-extracted exam questions into existing syllabus topics. Return no invented questions or topics. If a question cannot be classified confidently, omit it.\n\n${input.map((question) => {
        const label = `Question ${question.questionNumber || '?'}${question.subpart ? `(${question.subpart})` : ''}`;
        const context = question.context ? `\nContext: ${question.context}` : '';
        return `${label}: ${question.text}${context}`;
      }).join('\n\n').slice(0, 18000)}`
    : `Classify each numbered exam question below into its most specific academic topic. Return no invented questions. If a question cannot be classified confidently, omit it.\n\n${String(input).slice(0, 18000)}`;

  try {
    const response = await geminiGenerate(ai, {
      model: GEMINI_MODEL,
      contents: promptContents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { mappings: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { questionText: { type: Type.STRING }, topicName: { type: Type.STRING }, confidence: { type: Type.NUMBER } }, required: ['questionText', 'topicName', 'confidence'] } } }, required: ['mappings'] },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    if (!Array.isArray(parsed.mappings)) {
      return { mappings: [], status: { configured: true, attempted: true, ok: false, message: 'Gemini returned no mappings array.', model: GEMINI_MODEL } };
    }
    const mappings = parsed.mappings
      .filter((item: any) => typeof item?.questionText === 'string' && typeof item?.topicName === 'string' && Number.isFinite(Number(item?.confidence)))
      .map((item: any) => ({ questionText: item.questionText.trim(), topicName: item.topicName.trim(), confidence: Math.max(0, Math.min(1, Number(item.confidence))) }))
      .filter((item: TopicMapping) => item.questionText && item.topicName);
    return {
      mappings,
      status: {
        configured: true,
        attempted: true,
        ok: true,
        message: `Gemini classified ${mappings.length} question(s) using ${GEMINI_MODEL}.`,
        model: GEMINI_MODEL,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[academic] Gemini question-topic classification failed:', message);
    return {
      mappings: [],
      status: { configured: true, attempted: true, ok: false, message: `Gemini question-topic classification failed: ${message}`, model: GEMINI_MODEL },
    };
  }
}

export async function extractSyllabusTopicsWithAI(
  content: string,
  title: string,
  aiClient: any = getAIClient()
): Promise<Array<{ name: string; weightage?: number }>> {
  if (!aiClient) {
    return services.extractSyllabusTopics(content);
  }
  try {
    const prompt = `Extract all course units, modules, and canonical curriculum topics from this course syllabus document ("${title}").
If a unit or topic has an explicit or estimated weightage percentage, include it as a number (e.g. 20 for 20%).
Do not hallucinate topics not present in the syllabus text.

SYLLABUS CONTENT:
${content.slice(0, 25000)}`;

    const response = await geminiGenerate(aiClient, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are an academic course curriculum extractor. Extract canonical syllabus units and topics cleanly.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  weightage: { type: Type.NUMBER },
                },
                required: ['name'],
              },
            },
          },
          required: ['topics'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      const valid = parsed.topics
        .filter((t: any) => typeof t?.name === 'string' && t.name.trim().length >= 3)
        .map((t: any) => ({
          name: t.name.trim(),
          weightage: Number.isFinite(Number(t?.weightage)) && Number(t?.weightage) > 0 ? Number(t.weightage) : undefined,
        }));
      if (valid.length > 0) {
        return valid;
      }
    }
    return services.extractSyllabusTopics(content);
  } catch (err) {
    console.warn('[academic] Gemini syllabus extraction failed; falling back to deterministic parser:', err);
    return services.extractSyllabusTopics(content);
  }
}

export async function synthesizeTeacherIntelligence(
  userId: string,
  aiClient: any = getAIClient()
): Promise<services.WhatToStudyItem[]> {
  const fallback = () => services.getDeterministicWhatToStudyRanking(userId);

  if (!aiClient) {
    return fallback();
  }

  const questions = services.questionRows(userId);
  if (questions.length === 0) {
    return [];
  }

  const allTopics = services.topicRows(userId);
  const documents = services.documentRows(userId);

  const lectureDocs = documents.filter((d) => {
    const t = d.docType.toLowerCase();
    return t.includes('lecture') || t.includes('slide') || t.includes('note') || t.includes('presentation') || /\.(pptx|ppt)$/i.test(d.title);
  });

  const parsedLectures = lectureDocs.map((doc) => {
    const pages = services.getDocumentPages(userId, doc.id);
    const slides = pages.length > 0
      ? pages.map((p) => ({ slideNumber: p.pageNumber, title: p.heading, text: p.text }))
      : services.extractLectureSlides(doc.content || '');
    return { doc, slides };
  });

  try {
    const questionSummaries = questions.map((q) => ({
      id: q.id,
      text: q.questionText,
      marks: q.marks,
      questionNumber: q.questionNumber,
      subpart: q.subpart,
      pageNumber: q.pageNumber,
      paperTitle: q.paperTitle || 'Exam',
      topicName: q.topicName,
    }));

    const questionText = questionSummaries.slice(0, 150).map((q) => {
      return `- [ID: ${q.id}] (${q.paperTitle}, Q${q.questionNumber || '?'}${q.subpart ? `(${q.subpart})` : ''}, p.${q.pageNumber || 1}, ${q.marks}m): "${q.text}" [Topic: ${q.topicName || 'General'}]`;
    }).join('\n');

    const syllabusTopicNames = allTopics.map((t) => t.name);
    const syllabusText = syllabusTopicNames.slice(0, 60).map((t, idx) => `${idx + 1}. ${t}`).join('\n');

    const lectureText = parsedLectures.map(({ doc, slides }) => {
      const slideBullets = slides.slice(0, 90).map((s) => `  * Slide ${s.slideNumber}: ${s.title ? `${s.title} — ` : ''}${s.text.replace(/\s+/g, ' ').slice(0, 250)}`).join('\n');
      return `Document [ID: ${doc.id}] "${doc.title}":\n${slideBullets}`;
    }).join('\n\n');

    const prompt = `You are LazyLift's Teacher Intelligence engine.
Analyze these university exam questions, course syllabus topics, and professor lecture slides.

EXAM QUESTIONS:
${questionText}

SYLLABUS TOPICS:
${syllabusText || 'None provided'}

LECTURE SLIDES:
${lectureText || 'No lecture slides available'}

Perform Teacher Intelligence synthesis following these strict guidelines:

1. TOPIC HIERARCHY:
   - Organize all exam questions into a two-level academic hierarchy:
     * "unitTopic": MUST be ONLY the exact short title of the canonical parent course topic or syllabus module from the syllabus list above (e.g. "Software testing", "Software life cycle model", "Requirement analysis and specification", "Architecture and Design", "Software Project Management", "Introduction to software engineering").
       CRITICAL: NEVER output reasoning, explanations, questions, or multiple sentences in "unitTopic". It must be ONLY the category name (under 40 characters).
     * "canonicalTitle": Specific examinable sub-concept under that parent topic (e.g. "Cyclomatic Complexity & Control Flow Graphs", "Waterfall Model & Shortcomings", "Boehm's Spiral Model & Risk Selection", "Requirements Engineering & Specification", "Modularity & Architectural Design", "COCOMO Estimation Model", "Software Configuration Management").
     * Group related questions together.
     * Every question from the EXAM QUESTIONS list MUST be included in the questionIds of one of the clusters.

2. GROUNDED LECTURE SLIDE MAPPING:
   - Check if any provided lecture slides cover this concept.
   - If covered: identify the EXACT lecture document ID ("lectureDocId"), the exact start slide number ("startSlide"), and end slide number ("endSlide").
   - Set "sectionTitle" to the heading or section of that slide.
   - CRITICAL: NEVER invent or hallucinate slide numbers. Only select slide numbers that ACTUALLY exist in the provided slides for that lectureDocId. If no slide covers it, set lectureDocId, startSlide, endSlide, and sectionTitle to null.

3. PRIORITY & EXPLANATION:
   - priorityTag: "HIGH PRIORITY" | "REPEATED FREQUENTLY" | "APPEARED ACROSS MULTIPLE YEARS" | "STRONG PAST-PAPER EVIDENCE".
   - importanceExplanation: 1-sentence explanation of exam importance and syllabus coverage.

CRITICAL GROUNDING CONSTRAINTS:
- NEVER invent or guess slide numbers. Only select slideNumber values that ACTUALLY exist in the provided lecture slides for that lectureDocId.
- If no slide directly covers the concept, set lectureDocId, startSlide, and endSlide to null.
- Only include question IDs from the provided question list.`;

    const response = await geminiGenerate(aiClient, {
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clusters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  canonicalTitle: { type: Type.STRING },
                  unitTopic: { type: Type.STRING },
                  questionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                  priorityTag: { type: Type.STRING },
                  importanceExplanation: { type: Type.STRING },
                  lectureDocId: { type: Type.STRING },
                  startSlide: { type: Type.NUMBER },
                  endSlide: { type: Type.NUMBER },
                  sectionTitle: { type: Type.STRING },
                },
                required: ['canonicalTitle', 'questionIds'],
              },
            },
          },
          required: ['clusters'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (!Array.isArray(parsed.clusters) || parsed.clusters.length === 0) {
      console.warn('[academic] Gemini returned empty clusters; falling back to deterministic.');
      return fallback();
    }

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const items: services.WhatToStudyItem[] = [];

    for (let cIdx = 0; cIdx < parsed.clusters.length; cIdx++) {
      const c = parsed.clusters[cIdx];
      const validQIds = Array.isArray(c.questionIds)
        ? c.questionIds.filter((id: any) => typeof id === 'string' && questionMap.has(id))
        : [];
      if (validQIds.length === 0) continue;

      const clusterQuestions = validQIds.map((id: string) => questionMap.get(id)!);
      const occurrences: services.WhatToStudyOccurrence[] = clusterQuestions.map((q) => {
        const yearMatch = /\b(20\d{2}(?:\s*(?:Supplementary|Mid-Term|Midterm|End-Semester|End-Sem|Spring|Fall|Summer))?)\b/i.exec(q.paperTitle || '');
        const examYear = yearMatch ? yearMatch[1] : (q.paperTitle?.replace(/\.(pdf|txt|docx|pptx)$/i, '') || 'Exam');
        return {
          questionId: q.id,
          paperTitle: q.paperTitle || 'Previous Exam Paper',
          examYear,
          questionNumber: q.questionNumber || '?',
          subpart: q.subpart || undefined,
          label: `${examYear} · Q${q.questionNumber || '?'}${q.subpart ? `(${q.subpart})` : ''}`,
          marks: q.marks,
          questionText: q.questionText,
          pageNumber: q.pageNumber || undefined,
        };
      });

      const appearanceCount = occurrences.length;
      const distinctYearsCount = new Set(occurrences.map((o) => o.examYear)).size;
      const avgMarks = Math.round(occurrences.reduce((s, o) => s + o.marks, 0) / (appearanceCount || 1));

      // STRICT GROUNDING VALIDATION FOR LECTURE SLIDE MAPPINGS:
      let lectureSource: services.WhatToStudySourceMapping = {
        mapped: false,
        unmappedReason: 'Source location not confidently mapped.',
      };

      if (typeof c.lectureDocId === 'string' && c.lectureDocId) {
        const matchedDocInfo = parsedLectures.find((p) => p.doc.id === c.lectureDocId);
        if (matchedDocInfo) {
          const validSlideNums = new Set(matchedDocInfo.slides.map((s) => s.slideNumber));
          const start = Number(c.startSlide);
          const end = Number(c.endSlide);
          if (validSlideNums.has(start) && validSlideNums.has(end)) {
            const minSlide = Math.min(start, end);
            const maxSlide = Math.max(start, end);
            const slideRange = minSlide === maxSlide ? `Slide ${minSlide}` : `Slides ${minSlide}–${maxSlide}`;
            const targetSlide = matchedDocInfo.slides.find((s) => s.slideNumber === minSlide);
            lectureSource = {
              mapped: true,
              documentId: matchedDocInfo.doc.id,
              documentTitle: matchedDocInfo.doc.title.replace(/\.(pdf|pptx|ppt|txt)$/i, ''),
              documentFileName: matchedDocInfo.doc.title,
              slideRange,
              startSlide: minSlide,
              endSlide: maxSlide,
              sectionTitle: typeof c.sectionTitle === 'string' && c.sectionTitle.trim() ? c.sectionTitle.trim() : (targetSlide?.title || c.canonicalTitle),
              slideSnippet: targetSlide?.text.slice(0, 240),
            };
          }
        }
      }

      // If Gemini didn't map or hallucinated slide numbers, attempt grounding via deterministic slide search
      if (!lectureSource.mapped) {
        const detRankings = fallback();
        const matchedDet = detRankings.find((d) => d.occurrences.some((o) => validQIds.includes(o.questionId || '')));
        if (matchedDet && matchedDet.lectureSource.mapped) {
          lectureSource = matchedDet.lectureSource;
        }
      }

      const priorityTag: services.WhatToStudyItem['priorityTag'] =
        c.priorityTag === 'HIGH PRIORITY' || c.priorityTag === 'REPEATED FREQUENTLY' || c.priorityTag === 'APPEARED ACROSS MULTIPLE YEARS' || c.priorityTag === 'STRONG PAST-PAPER EVIDENCE'
          ? c.priorityTag
          : (appearanceCount >= 3 ? 'HIGH PRIORITY' : appearanceCount >= 2 ? 'REPEATED FREQUENTLY' : 'STRONG PAST-PAPER EVIDENCE');

      const baseScore = Math.min(40, distinctYearsCount * 20);
      const repScore = Math.min(30, appearanceCount * 10);
      const marksScore = Math.min(15, avgMarks >= 10 ? 15 : avgMarks >= 6 ? 10 : 5);
      const lectureScore = lectureSource.mapped ? 10 : 0;
      const importanceScore = Math.min(100, baseScore + repScore + marksScore + lectureScore);

      const uniqueYears = Array.from(new Set(occurrences.map((o) => o.examYear)));
      const importanceExplanation = typeof c.importanceExplanation === 'string' && c.importanceExplanation.trim()
        ? c.importanceExplanation.trim()
        : `Appeared in ${appearanceCount} exams across ${distinctYearsCount} years (${uniqueYears.join(', ')}) • ${lectureSource.mapped ? `Verified in ${lectureSource.slideRange}` : 'Theory concept'} • Avg ${avgMarks} marks`;

      // Clean unitTopic to eliminate LLM thought-bubbles/reasoning
      let cleanUnitTopic = typeof c.unitTopic === 'string' && c.unitTopic.trim() ? c.unitTopic.trim() : 'Curriculum Topic';
      if (cleanUnitTopic.length > 40 || cleanUnitTopic.includes('\n') || /let's|wait|topic|similar|exact/i.test(cleanUnitTopic)) {
        const quoteMatch = /['"]([^'"]{3,40})['"]/i.exec(cleanUnitTopic);
        if (quoteMatch) {
          cleanUnitTopic = quoteMatch[1].trim();
        } else {
          const matchedSyl = allTopics.find((t) => cleanUnitTopic.toLowerCase().includes(t.name.toLowerCase()));
          if (matchedSyl) {
            cleanUnitTopic = matchedSyl.name;
          } else {
            cleanUnitTopic = cleanUnitTopic.split(/[\n\.\?!]/)[0].trim().slice(0, 40);
          }
        }
      }

      items.push({
        id: `wts-ai-${cIdx}-${Date.now().toString(36)}`,
        conceptTitle: typeof c.canonicalTitle === 'string' && c.canonicalTitle.trim() ? c.canonicalTitle.trim() : 'Core Concept',
        priorityTag,
        appearanceCount,
        distinctYearsCount,
        occurrences,
        unitTopic: cleanUnitTopic,
        lectureSource,
        averageMarks: avgMarks,
        importanceScore,
        importanceExplanation,
      });
    }

    if (items.length === 0) {
      return fallback();
    }

    // Sync questions in SQLite DB with the synthesized parent topics so Topic Weightage and Question Bank reflect this intelligence
    try {
      const db = services.getDb();
      for (const item of items) {
        const parentName = item.unitTopic.trim();
        let parentTopic = allTopics.find((t) => t.name.toLowerCase() === parentName.toLowerCase());
        if (!parentTopic) {
          const existing = db.prepare('SELECT id, name FROM topics WHERE user_id = ? AND lower(name) = lower(?)').get(userId, parentName) as any;
          if (existing) {
            parentTopic = existing;
          } else {
            const newTopicId = `topic-syn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            db.prepare(`INSERT INTO topics (id, user_id, course_id, name, priority, weightage, source, created_at, has_weightage)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newTopicId, userId, 'course-demo', parentName, 5, 15, 'syllabus', new Date().toISOString(), 1);
            parentTopic = { id: newTopicId, name: parentName } as any;
          }
        }
        if (parentTopic) {
          const updateStmt = db.prepare('UPDATE questions SET topic_id = ?, mapping_status = ? WHERE id = ? AND user_id = ?');
          for (const occ of item.occurrences) {
            if (occ.questionId) {
              updateStmt.run(parentTopic.id, 'mapped', occ.questionId, userId);
            }
          }
        }
      }
    } catch (syncErr) {
      console.warn('[academic] Failed to sync question topic mappings in DB:', syncErr);
    }

    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[academic] synthesizeTeacherIntelligence failed (${message}); falling back to deterministic ranking.`);
    return fallback();
  }
}

// ---- Documents ----
app.post('/api/academic-documents/analyze', async (req, res) => {
  const body = req.body || {};
  if (typeof body.title !== 'string' || !body.title.trim()) return sendError(res, 400, 'title is required.');
  if (typeof body.content !== 'string' || !body.content.trim()) return sendError(res, 400, 'content is required.');
  if (typeof body.docType !== 'string' || !body.docType.trim()) return sendError(res, 400, 'docType is required.');
  try {
    let questionRecords: services.QuestionRecord[] | undefined;
    let topicMappings: TopicMapping[] = [];
    let aiStatus: AiClassificationStatus | undefined;

    const effectiveDocType = services.classifyAcademicDocument({
      title: body.title,
      content: body.content,
      hintDocType: body.docType,
    });

    if (/past|question|exam|paper|bank|test/i.test(effectiveDocType)) {
      let pages: Array<{ pageNumber: number; text: string }> = [];
      if (body.content.includes('\f')) {
        pages = body.content.split('\f').map((p: string, idx: number) => ({ pageNumber: idx + 1, text: p.trim() })).filter((p: any) => p.text.length > 0);
      } else {
        pages = [{ pageNumber: 1, text: body.content }];
      }

      const extraction = await extractTeacherIntelligence({
        content: body.content,
        title: body.title,
        docType: effectiveDocType,
        pages,
      });
      questionRecords = extraction.questionRecords;
      topicMappings = extraction.topicMappings;
      aiStatus = extraction.status;
    }

    let syllabusTopics: Array<{ name: string; weightage?: number }> | undefined;
    if (/syllabus/i.test(effectiveDocType)) {
      syllabusTopics = await extractSyllabusTopicsWithAI(body.content, body.title, getAIClient());
    }

    const analysis = services.ingestAcademicDocument(userIdOf(req), {
      title: body.title,
      docType: effectiveDocType,
      content: body.content,
      fileSize: typeof body.fileSize === 'string' ? body.fileSize : '',
      topicMappings,
      questionRecords,
      syllabusTopics,
    });

    return res.status(201).json({
      analysis: {
        ...analysis,
        aiStatus,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to analyze academic document.');
  }
});

async function ocrPdfWithAI(payload: Buffer, title: string): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new HttpError(422, 'This PDF has no extractable text. Configure GEMINI_API_KEY to analyze scanned PDFs, or upload a text-based PDF.');
  try {
    const response = await geminiGenerate(ai, {
      model: GEMINI_MODEL,
      contents: [{ inlineData: { mimeType: 'application/pdf', data: payload.toString('base64') } }, { text: `Extract the complete readable academic text and structure from ${title}. Preserve headings, modules, units, questions, numbering, marks, and topics where present. Do not add or infer content.` }],
    });
    const text = String(response.text || '').trim();
    if (text.length < 20) throw new HttpError(422, 'The PDF could not be read. Please upload a clearer text-based PDF.');
    return text;
  } catch (err: any) {
    if (err instanceof HttpError) throw err;
    if (isTransientGeminiError(err)) {
      throw new HttpError(503, 'AI OCR is currently experiencing high demand. Please try again in a few moments or upload a text-based PDF.');
    }
    throw err;
  }
}

// Receives the original file, persists it with its extraction metadata, and never substitutes sample content.
async function processAcademicDocumentUpload(userId: string, input: any) {
  const { title, docType, base64, mimeType, fileName } = input || {};
  if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'title is required.');
  if (typeof docType !== 'string' || !docType.trim()) throw new HttpError(400, 'docType is required.');
  if (typeof base64 !== 'string' || !base64) throw new HttpError(400, 'A file payload is required.');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) throw new HttpError(400, 'The file payload is not valid base64.');
  const payload = Buffer.from(base64, 'base64');
  if (payload.length === 0 || payload.length > 15 * 1024 * 1024) throw new HttpError(413, 'Files must be between 1 byte and 15 MB.');
  const checkName = (typeof fileName === 'string' && fileName.trim()) ? fileName.toLowerCase() : title.toLowerCase();
  const isPdfMagic = payload.length >= 5 && payload.subarray(0, 5).toString('utf8') === '%PDF-';
  const isZipMagic = payload.length >= 4 && payload.subarray(0, 4).toString('binary') === 'PK\x03\x04';
  const isPdf = mimeType === 'application/pdf' ||
    (mimeType !== 'text/plain' && checkName.endsWith('.pdf')) ||
    isPdfMagic;
  const isPptx = mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    (mimeType !== 'text/plain' && checkName.endsWith('.pptx')) ||
    (isZipMagic && !isPdfMagic && !isPdf);
  let content: string;
  let extractionMethod: string;
  let structuredPages: Array<{ pageNumber: number; text: string }> = [];
  if (isPptx) {
    const parsed = extractStructuredDocument(payload, title, mimeType);
    content = parsed.fullText;
    extractionMethod = parsed.extractionMethod;
    structuredPages = parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    if (!content) throw new HttpError(422, 'No slides or readable text found in this PPTX presentation.');
  } else if (isPdf) {
    let localContent = '';
    let localStructuredPages: Array<{ pageNumber: number; text: string }> = [];
    let localExtractionSucceeded = false;

    try {
      localContent = extractPdfText(payload);
      const rawPages = extractPdfPages(payload);
      localStructuredPages = rawPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
      if (!extractionIsLowQuality(localContent)) {
        localExtractionSucceeded = true;
        content = localContent;
        extractionMethod = 'embedded-pdf-text';
        structuredPages = localStructuredPages;
      }
    } catch {
      // Local text extraction failed to find embedded text
    }

    if (!localExtractionSucceeded) {
      if (!isPdfGeminiOcrEnabled()) {
        throw new HttpError(
          422,
          'This PDF has no extractable text. Configure GEMINI_API_KEY to analyze scanned PDFs, or upload a text-based PDF.'
        );
      }
      try {
        content = await ocrPdfWithAI(payload, title);
        extractionMethod = 'gemini-pdf-ocr';
        if (extractionIsLowQuality(content)) {
          throw new HttpError(422, 'The PDF text could not be read reliably after OCR. Please upload a clearer text-based PDF.');
        }
        structuredPages = [{ pageNumber: 1, text: content }];
      } catch (ocrErr: any) {
        // If AI OCR returns temporary high-demand / 503 / rate-limit errors BUT we have usable local text:
        if (localContent && localContent.trim().length >= 20 && isTransientGeminiError(ocrErr)) {
          console.warn(`[academic] AI OCR unavailable (${ocrErr?.status || ocrErr?.code || '503'}); recovering with locally extracted text for "${title}".`);
          content = localContent;
          extractionMethod = 'embedded-pdf-text-fallback';
          structuredPages = localStructuredPages.length > 0 ? localStructuredPages : [{ pageNumber: 1, text: localContent }];
        } else {
          throw ocrErr;
        }
      }
    }
  } else {
    content = payload.toString('utf8').trim();
    extractionMethod = 'utf8-text';
    if (!content) throw new HttpError(422, 'The uploaded text file is empty or unreadable.');
    if (content.includes('\f')) {
      structuredPages = content.split('\f').map((p, idx) => ({ pageNumber: idx + 1, text: p.trim() })).filter((p) => p.text.length > 0);
    } else {
      structuredPages = [{ pageNumber: 1, text: content }];
    }
  }
  if (structuredPages.length === 0) {
    structuredPages = [{ pageNumber: 1, text: content }];
  }

  let questionRecords: services.QuestionRecord[] = [];
  let topicMappings: TopicMapping[] = [];
  let aiStatus: AiClassificationStatus;

  const effectiveDocType = services.classifyAcademicDocument({
    title,
    content,
    hintDocType: docType,
    mimeType: isPdf ? 'application/pdf' : mimeType,
  });

  const isExamDoc = /past|question|exam|paper|bank|test/i.test(effectiveDocType);
  if (isExamDoc) {
    let preStructured = false;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.text || parsed[0]?.questionText)) {
        questionRecords = parsed.map((item: any) => ({
          text: String(item.text || item.questionText || '').trim(),
          marks: Number(item.marks || item.totalMarks || 10),
          questionNumber: String(item.questionNumber || ''),
          subpart: item.subpart ? String(item.subpart) : (item.label ? String(item.label) : undefined),
          pageNumber: Number.isInteger(Number(item.pageNumber)) ? Number(item.pageNumber) : 1,
        })).filter(services.isPersistableQuestion);
        preStructured = true;
      }
    } catch {
      // Not JSON
    }

    if (!preStructured) {
      const extraction = await extractTeacherIntelligence({
        content,
        title,
        docType: effectiveDocType,
        pages: structuredPages,
      });
      questionRecords = extraction.questionRecords;
      topicMappings = extraction.topicMappings;
      aiStatus = extraction.status;
    } else {
      aiStatus = {
        configured: Boolean(getAIClient()),
        attempted: false,
        ok: true,
        message: 'Pre-structured question records loaded.',
        model: GEMINI_MODEL,
      };
    }
  }

  let syllabusTopics: Array<{ name: string; weightage?: number }> | undefined;
  if (/syllabus/i.test(effectiveDocType)) {
    syllabusTopics = await extractSyllabusTopicsWithAI(content, title, getAIClient());
    aiStatus = {
      configured: Boolean(getAIClient()),
      attempted: Boolean(getAIClient()),
      ok: true,
      message: `Extracted ${syllabusTopics.length} syllabus topics.`,
      model: GEMINI_MODEL,
    };
  } else if (!isExamDoc) {
    aiStatus = {
      configured: Boolean(getAIClient()),
      attempted: false,
      ok: false,
      message: 'AI question extraction skipped for non-past-paper documents.',
      model: GEMINI_MODEL,
    };
  }

  const analysis = services.ingestAcademicDocument(userId, {
    title,
    docType: effectiveDocType,
    content,
    fileSize: `${payload.length} bytes`,
    fileData: payload,
    mimeType: isPdf ? 'application/pdf' : String(mimeType || 'text/plain'),
    extractionMethod,
    topicMappings,
    questionRecords,
    structuredPages,
    syllabusTopics,
  });

  console.log(`[academic-upload] "${title}" (${payload.length} bytes, ${mimeType || (isPdf ? 'application/pdf' : 'unknown')}) -> extractionMethod: "${extractionMethod}", text: ${content.length} chars, pages: ${structuredPages.length}, questions: ${questionRecords.length}`);

  return { analysis: { ...analysis, extractionMethod, aiStatus } };
}

app.post('/api/academic-documents/upload', async (req, res) => {
  try {
    const result = await processAcademicDocumentUpload(userIdOf(req), req.body);
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 422, error instanceof Error ? error.message : 'Unable to extract the uploaded file.');
  }
});

app.post('/api/academic-documents/upload-batch', async (req, res) => {
  try {
    const { documents } = req.body || {};
    if (!Array.isArray(documents) || documents.length === 0) {
      return sendError(res, 400, 'documents array is required and must contain at least 1 document.');
    }
    const results = [];
    let totalQuestionCount = 0;
    for (const doc of documents) {
      const result = await processAcademicDocumentUpload(userIdOf(req), doc);
      results.push(result.analysis);
      totalQuestionCount += result.analysis?.createdQuestionCount || 0;
    }
    return res.status(201).json({ results, totalQuestionCount });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 422, error instanceof Error ? error.message : 'Unable to process batch document upload.');
  }
});

app.get('/api/academic-evidence', (req, res) => {
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : undefined;
  if (documentId && !services.findOwnedDocument(userIdOf(req), documentId)) return sendError(res, 404, 'Document not found.');
  return res.json({ academic: services.academicEvidence(userIdOf(req), documentId) });
});

// ---- STRUCTURED DOCUMENT PAGES (SOURCE TRACEABILITY) ----
app.get('/api/documents/:id/pages', (req, res) => {
  try {
    const doc = services.findOwnedDocument(userIdOf(req), req.params.id);
    if (!doc) return sendError(res, 404, 'Document not found.');
    const pages = services.getDocumentPages(userIdOf(req), req.params.id);
    return res.json({ pages });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, 'Unable to retrieve document pages.');
  }
});

app.get('/api/documents/:id/pages/:pageNumber', (req, res) => {
  try {
    const doc = services.findOwnedDocument(userIdOf(req), req.params.id);
    if (!doc) return sendError(res, 404, 'Document not found.');
    const pageNum = parseInt(req.params.pageNumber, 10);
    const page = services.getDocumentPage(userIdOf(req), req.params.id, pageNum);
    if (!page) return sendError(res, 404, 'Page not found.');
    return res.json({ page });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, 'Unable to retrieve document page.');
  }
});

// ---- REAL FOCUS MODE & WEBSITE BLOCKING ----
app.post('/api/focus-mode/start', (req, res) => {
  try {
    const { durationMinutes, taskTitle, domains } = req.body || {};
    const duration = Number(durationMinutes);
    if (!Number.isFinite(duration) || duration < 1 || duration > 480) {
      return sendError(res, 400, 'durationMinutes must be between 1 and 480.');
    }
    const session = services.startWebsiteFocusSession(userIdOf(req), {
      durationMinutes: duration,
      taskTitle: typeof taskTitle === 'string' ? taskTitle : '',
      domains: Array.isArray(domains) ? domains : undefined,
    });
    return res.status(201).json({ success: true, session });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, 'Unable to start focus session.');
  }
});

app.post('/api/focus-mode/stop', (req, res) => {
  try {
    const stopped = services.stopWebsiteFocusSession(userIdOf(req));
    return res.json({ success: true, stopped });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, 'Unable to stop focus session.');
  }
});

app.get('/api/focus-mode/blocklist', (req, res) => {
  try {
    const domains = services.getFocusBlocklist(userIdOf(req));
    return res.json({ domains });
  } catch (error) {
    return sendError(res, 500, 'Unable to get blocklist.');
  }
});

app.post('/api/focus-mode/blocklist', (req, res) => {
  try {
    const { domains } = req.body || {};
    if (!Array.isArray(domains)) return sendError(res, 400, 'domains must be an array.');
    const saved = services.setFocusBlocklist(userIdOf(req), domains);
    return res.json({ success: true, domains: saved });
  } catch (error) {
    return sendError(res, 500, 'Unable to save blocklist.');
  }
});

// ---- TEACHER'S EXAM INTELLIGENCE ("WHAT TO STUDY") ----
app.get('/api/academic/what-to-study', async (req, res) => {
  try {
    const items = await synthesizeTeacherIntelligence(userIdOf(req), getAIClient());
    return res.json({ whatToStudy: items });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, error instanceof Error ? error.message : 'Unable to generate What to Study ranking.');
  }
});

app.post('/api/academic/clear', (req, res) => {
  try {
    services.clearAcademicData(userIdOf(req));
    return res.json({ success: true, message: 'All academic documents, questions, and topics cleared successfully.' });
  } catch (error) {
    return sendError(res, 500, error instanceof Error ? error.message : 'Unable to clear academic data.');
  }
});

app.post('/api/academic/load-sample-pack', (req, res) => {
  try {
    const items = services.loadSampleAcademicPack(userIdOf(req));
    return res.status(201).json({
      message: 'Operating Systems course pack loaded successfully (Syllabus, Lecture Slides with Slides 18–24 on Deadlocks, and 4 Past Papers).',
      whatToStudy: items,
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 500, error instanceof Error ? error.message : 'Unable to load sample academic pack.');
  }
});

app.get('/api/documents', (req, res) => {
  res.json({ documents: services.documentRows(userIdOf(req)) });
});

app.post('/api/documents', (req, res) => {
  const validationError = validateDocumentInput(req.body || {});
  if (validationError) return sendError(res, 400, validationError);
  const document = services.createDocument(userIdOf(req), req.body);
  return res.status(201).json({ document });
});

app.get('/api/documents/:id', (req, res) => {
  const document = services.findOwnedDocument(userIdOf(req), req.params.id);
  if (!document) return sendError(res, 404, 'Document not found.');
  return res.json({ document });
});

app.get('/api/documents/:id/file', (req, res) => {
  const fileInfo = services.findOwnedDocumentFileData(userIdOf(req), req.params.id);
  if (!fileInfo) return sendError(res, 404, 'Document not found.');
  
  if (fileInfo.fileData) {
    res.setHeader('Content-Type', fileInfo.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.title)}"`);
    return res.send(fileInfo.fileData);
  }
  
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(fileInfo.content || '');
});

// ---- Questions ----
app.get('/api/questions', (req, res) => {
  res.json({ questions: services.questionRows(userIdOf(req)) });
});

app.get('/api/questions/:id', (req, res) => {
  const question = services.findOwnedQuestion(userIdOf(req), req.params.id);
  if (!question) return sendError(res, 404, 'Question not found.');
  return res.json({ question });
});

app.post('/api/questions/bulk', (req, res) => {
  const items = req.body?.questions;
  if (!Array.isArray(items) || items.length === 0) {
    return sendError(res, 400, 'A non-empty questions array is required.');
  }
  try {
    return res.status(201).json({ questions: services.createQuestionsBulk(userIdOf(req), items) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to save questions.');
  }
});

// ---- Feedback ----
app.post('/api/feedback', (req, res) => {
  const body = req.body || {};
  const validationError = validateFeedbackInput(body);
  if (validationError) return sendError(res, 400, validationError);
  if (body.questionId) {
    if (!services.findOwnedQuestion(userIdOf(req), body.questionId)) {
      return sendError(res, 404, 'Question not found.');
    }
  }
  if (body.sessionId) {
    if (!services.findOwnedStudySession(userIdOf(req), body.sessionId)) {
      return sendError(res, 404, 'Study session not found.');
    }
  }
  const feedback = services.createFeedback(userIdOf(req), body);
  return res.status(201).json({ feedback });
});

app.get('/api/feedback', (req, res) => {
  res.json({ feedback: services.feedbackRows(userIdOf(req)) });
});

// ---- AI Document Analysis: Syllabus / Past Paper Extraction ----
app.post('/api/gemini/analyze-document', async (req, res) => {
  const { documentName, documentType, content } = req.body as any;
  const suppliedText = String(content || '');

  if (!suppliedText.trim()) return sendError(res, 400, 'content is required.');
  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI document analysis is unavailable. Configure GEMINI_API_KEY or use the persisted academic document upload flow.');
  }

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: `Analyze the following academic document (${documentType}: ${documentName}) content and extract topic weightages, frequency counts, difficulty levels, and representative exam questions.
          Content:
${suppliedText.substring(0, 4000)}`,
        config: {
          systemInstruction: 'You are an expert university professor analyzing past papers and syllabi for exam preparation.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              topics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    priority: { type: Type.NUMBER },
                    weightage: { type: Type.NUMBER },
                    frequencyCount: { type: Type.NUMBER },
                    difficulty: { type: Type.STRING },
                    highYield: { type: Type.BOOLEAN },
                  },
                },
              },
              extractedQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    question: { type: Type.STRING },
                    marks: { type: Type.NUMBER },
                    type: { type: Type.STRING },
                    suggestedTimeMinutes: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, source: 'gemini', data: normalizeAnalysis(parsed, suppliedText, documentName) });
    } catch (err: any) {
      console.warn('[gemini] Document analysis error or high demand, using fallback:', err?.message || err);
    }
  }

  const fallbackData = fallbackAi.generateFallbackDocumentAnalysis(suppliedText, documentName, documentType);
  return res.json({ success: true, source: 'fallback', data: fallbackData });
});

// ---- AI Evaluation of Practice Answers ----
app.post('/api/gemini/evaluate-answer', async (req, res) => {
  const { question, studentAnswer, maxMarks } = req.body as any;
  const questionText = String(question || '').trim();
  const answerText = String(studentAnswer || '').trim();
  const marks = Math.max(1, Math.min(100, Math.round(Number(maxMarks) || 10)));

  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI answer evaluation is unavailable. Configure GEMINI_API_KEY to evaluate answers.');
  }

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: `Question (Max marks: ${marks}): "${questionText}"
Student's Submitted Answer: "${answerText}"

Provide detailed evaluation, numerical score out of ${marks}, strengths, areas for improvement, constructive feedback, and a concise model answer snippet.`,
        config: {
          systemInstruction: 'You are an empathetic, rigorous academic exam grader.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              maxMarks: { type: Type.NUMBER },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
              feedbackText: { type: Type.STRING },
              modelAnswerSnippet: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, source: 'gemini', data: parsed });
    } catch (err: any) {
      console.warn('[gemini] Answer evaluation error or high demand, using fallback:', err?.message || err);
    }
  }

  const fallbackData = fallbackAi.generateFallbackEvaluation(questionText, answerText, marks);
  return res.json({ success: true, source: 'fallback', data: fallbackData });
});

// ---- AI Practice Mode: Persistent Answer Evaluation ----
app.post('/api/practice/evaluate', async (req, res) => {
  const { question, studentAnswer, maxMarks } = req.body as any;
  const questionText = String(question || '').trim();
  const answerText = String(studentAnswer || '').trim();
  if (!questionText) return sendError(res, 400, 'question is required.');
  if (!answerText) return sendError(res, 400, 'studentAnswer is required and must be a non-empty string.');
  if (answerText.length > 20000) return sendError(res, 400, 'Answer is too long (20,000 character limit).');

  const marks = Math.max(1, Math.min(100, Math.round(Number(maxMarks) || 0)));
  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI practice evaluation is unavailable. Configure GEMINI_API_KEY to practice with AI feedback.');
  }

  let normalized: any = null;
  let source = 'gemini';

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: `Question (Max marks: ${marks}): "${questionText}"
Student's Submitted Answer: "${answerText}"

Provide a numerical score out of ${marks}, strengths, areas for improvement, constructive feedback, and a concise model answer snippet.`,
        config: {
          systemInstruction: 'You are an empathetic, rigorous academic exam grader.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              maxMarks: { type: Type.NUMBER },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
              feedbackText: { type: Type.STRING },
              modelAnswerSnippet: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      normalized = services.normalizePracticeEvaluation(parsed, marks);
    } catch (err: any) {
      console.warn('[gemini] AI practice evaluation error or high demand, using fallback:', err?.message || err);
    }
  }

  if (!normalized) {
    normalized = fallbackAi.generateFallbackEvaluation(questionText, answerText, marks);
    source = 'fallback';
  }

  const persisted = services.savePracticeEvaluation(userIdOf(req), {
    question: questionText,
    answer: answerText,
    ...normalized,
  });
  return res.json({ success: true, source, data: normalized, persisted: true, feedbackId: persisted.id });
});

// ---- AI Practice Mode: Gemini Concept Hint ----
app.post('/api/practice/hint', async (req, res) => {
  const { question, maxMarks } = req.body as any;
  const questionText = String(question || '').trim();
  if (!questionText) return sendError(res, 400, 'question is required.');
  const marks = Math.max(1, Math.min(100, Math.round(Number(maxMarks) || 0)));

  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI concept hints are unavailable. Configure GEMINI_API_KEY to generate hints.');
  }

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: `Question (Max marks: ${marks}): "${questionText}"

Give a concise concept hint that helps the student solve this question themselves.
Rules: do NOT write the full solution. Cover the key idea, the relevant concepts/theorems/formulas, and the boundary conditions or edge cases to check. Keep it under 5 short bullet points.`,
        config: {
          systemInstruction: 'You are a supportive tutor giving hints for exam questions. Guide, never solve outright.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hint: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const hint = String(parsed.hint || '').trim();
      if (hint) {
        return res.json({ success: true, source: 'gemini', data: { hint: hint.slice(0, 2000) } });
      }
    } catch (err: any) {
      console.warn('[gemini] AI practice hint error or high demand, using fallback:', err?.message || err);
    }
  }

  const fallbackHint = fallbackAi.generateFallbackHint(questionText, marks);
  return res.json({ success: true, source: 'fallback', data: fallbackHint });
});

// ---- Timed Mock Exams: Gemini Grading (persisted) ----
app.post('/api/mock-exams', async (req, res) => {
  const { examName, durationSeconds, startedAt, endedAt, questions } = req.body as any;
  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI mock exam grading is unavailable. Configure GEMINI_API_KEY to grade your mock exam.');
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return sendError(res, 400, 'questions is required with at least one question.');
  }
  if (questions.length > 25) return sendError(res, 400, 'A mock exam can contain at most 25 questions.');

  let normalizedQuestions: any[];
  try {
    normalizedQuestions = questions.map((q: any, index: number) => {
      const text = String(q?.questionText || '').trim();
      if (!text) throw new HttpError(400, `Question ${index + 1} requires questionText.`);
      const answer = String(q?.answer || '');
      if (answer.length > 20000) throw new HttpError(400, `Answer for question ${index + 1} is too long (20,000 character limit).`);
      return {
        questionText: text,
        topicName: String(q?.topicName || 'General').trim() || 'General',
        marks: Math.max(1, Math.min(100, Math.round(Number(q?.marks) || 1))),
        answer,
        suggestedTimeMinutes: Math.max(1, Math.round(Number(q?.suggestedTimeMinutes) || 0)),
      };
    });
  } catch (err: any) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message);
    throw err;
  }

  let report: any = null;
  let source = 'gemini';

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: buildMockExamPrompt(normalizedQuestions),
        config: {
          systemInstruction: 'You are a strict university examiner grading a timed mock exam answer sheet question by question. Grade each question independently on its own 0..max marks scale and base every score strictly on the submitted answer text.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              perQuestion: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.NUMBER },
                    score: { type: Type.NUMBER },
                    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                    feedback: { type: Type.STRING },
                  },
                },
              },
              overall: { type: Type.OBJECT, properties: { advice: { type: Type.STRING } } },
              topicBreakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    topic: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    maxMarks: { type: Type.NUMBER },
                    mastery: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      report = services.normalizeMockExamReport(parsed, normalizedQuestions);
    } catch (err: any) {
      console.warn('[gemini] Mock exam grading error or high demand, using fallback:', err?.message || err);
    }
  }

  if (!report) {
    const fallbackParsed = fallbackAi.generateFallbackMockExamReport(normalizedQuestions);
    report = services.normalizeMockExamReport(fallbackParsed, normalizedQuestions);
    source = 'fallback';
  }

  const record = services.createMockExam(userIdOf(req), {
    examName,
    durationSeconds,
    startedAt,
    endedAt,
    report,
  });
  return res.status(201).json({ mockExam: record, source });
});

app.get('/api/mock-exams', (req, res) => {
  return res.json({ mockExams: services.mockExamList(userIdOf(req)) });
});

app.get('/api/mock-exams/:id', (req, res) => {
  const record = services.getMockExam(userIdOf(req), req.params.id);
  if (!record) return sendError(res, 404, 'Mock exam not found.');
  return res.json({ mockExam: record });
});

function buildMockExamPrompt(questions: any[]): string {
  const numbered = questions
    .map((q, index) => {
      const answer = q.answer ? q.answer : '(No answer submitted)';
      return `${index + 1}. [Topic: ${q.topicName}] (${q.marks} marks)\nQ: ${q.questionText}\nA: ${answer}`;
    })
    .join('\n\n');
  return `You are grading a timed mock exam. Grade each question independently and strictly on the submitted answer text. Blank answers score 0.\n\nThe exam has ${questions.length} question(s) with a 1-based index for each.\n\n${numbered}\n\nReturn one perQuestion entry for every question index 1..${questions.length}.`;
}

// ---- AI Study Plan Generator ----
app.post('/api/gemini/generate-plan', async (req, res) => {
  const { examName, examDate, dailyStudyHours, topics } = req.body as any;
  const ai = getAIClient();
  if (!ai && !isFallbackModeEnabled(req)) {
    return sendError(res, 503, 'AI plan generation is unavailable. Use the persisted planner, which schedules analyzed topics from your academic evidence.');
  }

  if (ai) {
    try {
      const response = await geminiGenerate(ai, {
        model: GEMINI_MODEL,
        contents: `Create a day-by-day revision study schedule for target exam "${examName}" on ${examDate}.
Daily available hours: ${dailyStudyHours || 4}.
Topics to cover: ${JSON.stringify(topics || ['Graph Algorithms', 'Dynamic Programming', 'Complexity'])}.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              totalDays: { type: Type.NUMBER },
              dailySchedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.NUMBER },
                    date: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    hours: { type: Type.NUMBER },
                    focus: { type: Type.STRING },
                    status: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, source: 'gemini', data: parsed });
    } catch (err: any) {
      console.warn('[gemini] Plan generation error or high demand, using fallback:', err?.message || err);
    }
  }

  const fallbackPlan = fallbackAi.generateFallbackStudyPlan(examName, examDate, dailyStudyHours, topics);
  return res.json({ success: true, source: 'fallback', data: fallbackPlan });
});

let mockAIClient: any = null;
export function setAIClientForTesting(client: any) {
  mockAIClient = client;
}

export function getAIClient() {
  if (mockAIClient !== null) return mockAIClient;
  let apiKey = process.env.GEMINI_API_KEY;
  if (apiKey === 'MY_GEMINI_API_KEY' || process.env.NODE_ENV === 'test') {
    return null;
  }
  if (!apiKey) {
    const envFile = fs.existsSync('.env.local') ? '.env.local' : (fs.existsSync('.env') ? '.env' : null);
    if (envFile) {
      try {
        const parsed = dotenv.parse(fs.readFileSync(envFile));
        if (parsed.GEMINI_API_KEY && parsed.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
          process.env.GEMINI_API_KEY = parsed.GEMINI_API_KEY;
          apiKey = parsed.GEMINI_API_KEY;
        }
      } catch {
        // ignore read error
      }
    }
  }
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientGeminiError(err: any): boolean {
  const code = Number(err?.code ?? err?.statusCode ?? NaN);
  const status = String(err?.status ?? '');
  const detail = typeof err?.message === 'string' ? err.message : JSON.stringify(err?.message ?? '');
  const cause = typeof err?.cause === 'object' ? JSON.stringify(err.cause) : String(err?.cause ?? '');
  const blob = `${status} ${code} ${detail} ${cause}`;
  return (
    code === 429 ||
    code === 503 ||
    code === 500 ||
    code === 502 ||
    code === 504 ||
    /(^|\W)(UNAVAILABLE|RESOURCE_EXHAUSTED|RATE_LIMIT|OVERLOADED|429|503|500|502|504|fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR)(\W|$)/i.test(blob)
  );
}

async function geminiGenerate(ai: any, request: any, maxRetries = (process.env.NODE_ENV === 'test' ? 0 : 2)): Promise<any> {
  let lastError: any;
  const requestedModel = request.model || GEMINI_MODEL;
  const candidateModels = Array.from(new Set([requestedModel, ...GEMINI_FALLBACK_MODELS]));

  for (const modelCandidate of candidateModels) {
    const currentReq = { ...request, model: modelCandidate };
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.round(500 * Math.pow(2, attempt - 1));
        console.warn(`[gemini] transient error on ${modelCandidate}; retrying (${attempt}/${maxRetries}) in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        return await ai.models.generateContent(currentReq);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || '');
        const isTransient = isTransientGeminiError(err) || /(?:404|NOT_FOUND)/i.test(msg);
        if (!isTransient) throw err;
      }
    }
  }
  throw lastError;
}

function normalizeAnalysis(raw: any, content: string, documentName: string) {
  if (!Array.isArray(raw?.topics) || raw.topics.length === 0) throw new Error('AI returned no validated topics.');
  const topics = raw.topics.slice(0, 8).map((topic: any, index: number) => ({
    name: typeof topic.name === 'string' ? topic.name.trim() : '',
    priority: Number(topic.priority),
    weightage: Number(topic.weightage),
    source: 'extracted',
  })).filter((topic: TopicInput) => topic.name && Number.isFinite(topic.priority) && Number.isFinite(topic.weightage));
  if (topics.length === 0) throw new Error('AI returned no validated topics.');
  if (!Array.isArray(raw.extractedQuestions)) throw new Error('AI returned no validated questions.');
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : documentName || 'Academic Topic Extraction',
    summary: typeof raw.summary === 'string' ? raw.summary : `Extracted ${topics.length} topics from the supplied academic text.`,
    topics,
    extractedQuestions: raw.extractedQuestions,
  };
}

export async function createApp() {
  await initDatabase();
  const db = await getDatabase();
  services.setDb(db);
  services.sanitizePersistedAcademicQuestions();
  return { app, db };
}

async function startServer() {
  await createApp();

  app.use('/api', (_req, res) => sendError(res, 404, 'API route not found.'));

  // Keep API failures machine-readable instead of falling back to Express's HTML error page.
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    console.error('Unhandled API error:', error);
    return sendError(res, 500, 'An unexpected server error occurred.');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LazyLift server running on http://localhost:${PORT}`);
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
