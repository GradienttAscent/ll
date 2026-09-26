import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { extractPdfText, extractionIsLowQuality } from './pdfText';
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
  validateSessionFeedbackInput,
  validatePassword,
  VALID_SESSION_STATUSES,
} from './validation';

const ADAPTIVE_REASONS = ['missed', 'abandoned', 'high-difficulty'];

dotenv.config({ path: fs.existsSync('.env.local') ? '.env.local' : '.env' });

const app = express();
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
  return res.json({ rooms: services.listStudyRooms(userIdOf(req)) });
});

app.post('/api/study-rooms', (req, res) => {
  const name = req.body?.name;
  const topic = req.body?.topic;
  if (typeof name !== 'string' || !name.trim()) return sendError(res, 400, 'Room name is required.');
  if (typeof topic !== 'string') return sendError(res, 400, 'Room topic is required.');
  return res.status(201).json({ room: services.createStudyRoom(userIdOf(req), name, topic) });
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

app.get('/api/study-rooms/:id', (req, res) => {
  try {
    const roomId = req.params.id;
    return res.json({
      room: services.getStudyRoom(userIdOf(req), roomId),
      members: services.studyRoomMembers(userIdOf(req), roomId),
      messages: services.studyRoomMessages(userIdOf(req), roomId),
      session: services.studyRoomSession(userIdOf(req), roomId),
    });
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
    summaryChanges.completed = { field: 'completed', oldValue: String(existing.completed), newValue: body.completed ? '1' : '0' };
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
app.post('/api/academic-documents/analyze', (req, res) => {
  const body = req.body || {};
  if (typeof body.title !== 'string' || !body.title.trim()) return sendError(res, 400, 'title is required.');
  if (typeof body.content !== 'string' || !body.content.trim()) return sendError(res, 400, 'content is required.');
  if (typeof body.docType !== 'string' || !body.docType.trim()) return sendError(res, 400, 'docType is required.');
  try {
    return res.status(201).json({
      analysis: services.ingestAcademicDocument(userIdOf(req), {
        title: body.title,
        docType: body.docType,
        content: body.content,
        fileSize: typeof body.fileSize === 'string' ? body.fileSize : '',
      })
    });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to analyze academic document.');
  }
});

type TopicMapping = { questionText: string; topicName: string; confidence: number };

// Default to active gemini-2.5-flash (gemini-3.5-flash does not exist upstream and returns 503).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash'];
const ENABLE_PYQ_GEMINI_CLASSIFICATION = process.env.LAZYLIFT_PYQ_GEMINI_CLASSIFICATION === 'true';
const ENABLE_PDF_GEMINI_OCR = process.env.LAZYLIFT_PDF_GEMINI_OCR === 'true';

export function isFallbackModeEnabled(req: express.Request): boolean {
  if (process.env.LAZYLIFT_AI_FALLBACK === 'true') return true;
  const header = String(req.headers['x-allow-fallback'] || req.headers['x-fallback'] || '');
  if (header.toLowerCase() === 'true') return true;
  if (req.query?.fallback === 'true' || (req.body as any)?.fallback === true) return true;
  return false;
}

interface AiClassificationStatus {
  configured: boolean;
  attempted: boolean;
  ok: boolean;
  message: string;
  model: string;
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

async function ocrPdfWithAI(payload: Buffer, title: string): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new HttpError(422, 'This PDF has no extractable text. Configure GEMINI_API_KEY to analyze scanned PDFs, or upload a text-based PDF.');
  try {
    const response = await geminiGenerate(ai, {
      model: GEMINI_MODEL,
      contents: [{ inlineData: { mimeType: 'application/pdf', data: payload.toString('base64') } }, { text: `Extract the complete readable question-paper text from ${title}. Preserve question numbering and marks. Do not add or infer content.` }],
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
app.post('/api/academic-documents/upload', async (req, res) => {
  try {
    const { title, docType, base64, mimeType } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) return sendError(res, 400, 'title is required.');
    if (typeof docType !== 'string' || !docType.trim()) return sendError(res, 400, 'docType is required.');
    if (typeof base64 !== 'string' || !base64) return sendError(res, 400, 'A file payload is required.');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) return sendError(res, 400, 'The file payload is not valid base64.');
    const payload = Buffer.from(base64, 'base64');
    if (payload.length === 0 || payload.length > 15 * 1024 * 1024) return sendError(res, 413, 'Files must be between 1 byte and 15 MB.');
    const isPdf = mimeType === 'application/pdf' || title.toLowerCase().endsWith('.pdf');
    let content: string;
    let extractionMethod: string;
    if (isPdf) {
      try {
        content = extractPdfText(payload);
        extractionMethod = 'embedded-pdf-text';
        if (extractionIsLowQuality(content)) {
          throw new HttpError(422, 'This PDFs embedded text is garbled or unstructured. Configure GEMINI_API_KEY to OCR it, or upload a cleaner text-based PDF.');
        }
      } catch (error) {
        if (!ENABLE_PDF_GEMINI_OCR) {
          const detail = error instanceof Error ? error.message : 'No usable embedded text was found in this PDF.';
          throw new HttpError(422, `${detail} Automatic Gemini OCR is disabled. Upload a text-based PDF or set LAZYLIFT_PDF_GEMINI_OCR=true to enable OCR.`);
        }
        content = await ocrPdfWithAI(payload, title);
        extractionMethod = 'gemini-pdf-ocr';
        if (extractionIsLowQuality(content)) {
          throw new HttpError(422, 'The PDF text could not be read reliably after OCR. Please upload a clearer text-based PDF.');
        }
      }
    } else {
      content = payload.toString('utf8').trim();
      extractionMethod = 'utf8-text';
      if (!content) return sendError(res, 422, 'The uploaded text file is empty or unreadable.');
    }
    const questionRecords = docType.toLowerCase().includes('past')
      ? services.extractNumberedQuestionRecords(content)
      : [];
    const classification = docType.toLowerCase().includes('past') && ENABLE_PYQ_GEMINI_CLASSIFICATION
      ? await classifyPaperQuestions(questionRecords.length > 0 ? questionRecords : content)
      : {
        mappings: [],
        status: {
          configured: Boolean(getAIClient()),
          attempted: false,
          ok: false,
          message: docType.toLowerCase().includes('past')
            ? 'AI question-topic classification is disabled for PYQ uploads. Set LAZYLIFT_PYQ_GEMINI_CLASSIFICATION=true to enable it.'
            : 'AI question-topic classification skipped for non-past-paper documents.',
          model: GEMINI_MODEL,
        },
      };
    const analysis = services.ingestAcademicDocument(userIdOf(req), {
      title, docType, content, fileSize: `${payload.length} bytes`, fileData: payload,
      mimeType: isPdf ? 'application/pdf' : String(mimeType || 'text/plain'), extractionMethod,
      topicMappings: classification.mappings, questionRecords,
    });
    return res.status(201).json({ analysis: { ...analysis, aiStatus: classification.status } });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 422, error instanceof Error ? error.message : 'Unable to extract the uploaded file.');
  }
});

app.get('/api/academic-evidence', (req, res) => {
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : undefined;
  if (documentId && !services.findOwnedDocument(userIdOf(req), documentId)) return sendError(res, 404, 'Document not found.');
  return res.json({ academic: services.academicEvidence(userIdOf(req), documentId) });
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

function getAIClient() {
  if (mockAIClient !== null) return mockAIClient;
  const apiKey = process.env.GEMINI_API_KEY;
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
  const blob = `${status} ${code} ${detail}`;
  return (
    code === 429 ||
    code === 503 ||
    /(^|\W)(UNAVAILABLE|RESOURCE_EXHAUSTED|RATE_LIMIT|OVERLOADED|429|503)(\W|$)/i.test(blob)
  );
}

async function geminiGenerate(ai: any, request: any, maxRetries = 2): Promise<any> {
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
