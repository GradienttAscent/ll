import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initDatabase, getDatabase } from './db';
import * as auth from './auth';
import * as services from './services';
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
app.use(express.json({ limit: '10mb' }));

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
    return res.status(201).json({ message: services.createStudyRoomMessage(userIdOf(req), req.params.id, {
      text,
      isQuestion: req.body?.isQuestion === true,
      topicTag: typeof req.body?.topicTag === 'string' ? req.body.topicTag : undefined,
    }) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    throw error;
  }
});

app.patch('/api/study-rooms/:id/session', (req, res) => {
  const status = req.body?.status;
  if (!['active', 'paused', 'stopped'].includes(status)) return sendError(res, 400, 'A valid room session status is required.');
  try {
    return res.json({ session: services.updateStudyRoomSession(userIdOf(req), req.params.id, {
      status,
      durationMinutes: req.body?.durationMinutes,
    }) });
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

// ---- Adaptive revisions ----
app.post('/api/adaptive-proposals', (req, res) => {
  const studySessionId = req.body?.studySessionId;
  if (typeof studySessionId !== 'string' || !studySessionId) {
    return sendError(res, 400, 'studySessionId is required.');
  }
  try {
    return res.json(services.buildAdaptiveProposal(userIdOf(req), studySessionId));
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to generate adaptive proposal.');
  }
});

app.post('/api/adaptive-proposals/accept', (req, res) => {
  const body = req.body || {};
  if (typeof body.studySessionId !== 'string' || !body.studySessionId) {
    return sendError(res, 400, 'studySessionId is required.');
  }
  if (typeof body.proposedDate !== 'string' || typeof body.proposedStartTime !== 'string') {
    return sendError(res, 400, 'proposedDate and proposedStartTime are required.');
  }
  const proposedDurationMinutes = Number(body.proposedDurationMinutes);
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
});

app.post('/api/adaptive-proposals/reject', (req, res) => {
  const studySessionId = req.body?.studySessionId;
  if (typeof studySessionId !== 'string' || !studySessionId) {
    return sendError(res, 400, 'studySessionId is required.');
  }
  if (!services.findOwnedStudySession(userIdOf(req), studySessionId)) {
    return sendError(res, 404, 'Study session not found.');
  }
  return res.json({ ok: true });
});

// ---- Documents ----
app.post('/api/academic-documents/analyze', (req, res) => {
  const body = req.body || {};
  if (typeof body.title !== 'string' || !body.title.trim()) return sendError(res, 400, 'title is required.');
  if (typeof body.content !== 'string' || !body.content.trim()) return sendError(res, 400, 'content is required.');
  if (typeof body.docType !== 'string' || !body.docType.trim()) return sendError(res, 400, 'docType is required.');
  try {
    return res.status(201).json({ analysis: services.ingestAcademicDocument(userIdOf(req), {
      title: body.title,
      docType: body.docType,
      content: body.content,
      fileSize: typeof body.fileSize === 'string' ? body.fileSize : '',
    }) });
  } catch (error) {
    if (error instanceof HttpError) return sendError(res, error.status, error.message);
    return sendError(res, 400, error instanceof Error ? error.message : 'Unable to analyze academic document.');
  }
});

app.get('/api/academic-evidence', (req, res) => {
  return res.json({ academic: services.academicEvidence(userIdOf(req)) });
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
  try {
    const { documentName, documentType, content } = req.body as any;
    const ai = getAIClient();
    const suppliedText = String(content || '');

    if (!ai) {
      return res.json({
        success: true,
        source: 'local-fallback',
        data: localAcademicAnalysis(suppliedText, documentName),
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Analyze the following academic document (${documentType}: ${documentName}) content and extract topic weightages, frequency counts, difficulty levels, and representative exam questions.
Content:
${content ? content.substring(0, 4000) : 'Sample university past question paper for Data Structures & Algorithms'}`,
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
    console.error('Gemini error analyzing document:', err);
    return res.json({
      success: true,
      source: 'local-fallback',
      data: localAcademicAnalysis(String((req as any).body?.content || ''), (req as any).body?.documentName),
    });
  }
});

// ---- AI Evaluation of Practice Answers ----
app.post('/api/gemini/evaluate-answer', async (req, res) => {
  try {
    const { question, studentAnswer, maxMarks } = req.body as any;
    const ai = getAIClient();

    if (!ai) {
      return res.json({
        success: true,
        source: 'simulated',
        data: {
          score: Math.min(maxMarks || 10, 8.5),
          maxMarks: maxMarks || 10,
          strengths: ['Accurately identified core base cases', 'Correct algorithm initialization parameters'],
          improvements: ['Could elaborate on edge cases with negative cycle detection', 'Time complexity analysis was slightly vague'],
          feedbackText: 'Great attempt! Your structure demonstrates solid understanding of graph relaxation. To score full marks on a final exam, explicitly state array initialization boundary constraints.',
          modelAnswerSnippet: 'Initialize dist[] with infinity, set dist[src] = 0. Extract minimum vertex u from Priority Queue, iterate over neighbors v, and if dist[u] + weight(u,v) < dist[v], update dist[v] and decrease key in O((V + E) log V).',
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Question (Max marks: ${maxMarks || 10}): "${question}"
Student's Submitted Answer: "${studentAnswer}"

Provide detailed evaluation, numerical score out of ${maxMarks || 10}, strengths, areas for improvement, constructive feedback, and a concise model answer snippet.`,
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
    console.error('Gemini evaluation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to evaluate answer' });
  }
});

// ---- AI Study Plan Generator ----
app.post('/api/gemini/generate-plan', async (req, res) => {
  try {
    const { examName, examDate, dailyStudyHours, topics } = req.body as any;
    const ai = getAIClient();

    if (!ai) {
      return res.json({
        success: true,
        source: 'simulated',
        data: {
          title: `Personalized Revision Blueprint for ${examName || 'Algorithms'}`,
          totalDays: 21,
          dailySchedule: [
            { day: 1, date: 'Today', topic: 'Graph Algorithms & Priority Queues', hours: dailyStudyHours || 4, focus: 'Dijkstra Implementation & Proofs', status: 'In Progress' },
            { day: 2, date: 'Tomorrow', topic: 'Bellman-Ford & All-Pairs Shortest Path', hours: dailyStudyHours || 4, focus: 'Floyd-Warshall DP Transition Matrix', status: 'Upcoming' },
            { day: 3, date: 'Day 3', topic: 'Dynamic Programming Core', hours: dailyStudyHours || 4, focus: 'Knapsack 0/1 & Memoization Trees', status: 'Upcoming' },
            { day: 4, date: 'Day 4', topic: 'Big O Notation & Master Theorem', hours: dailyStudyHours || 3, focus: 'Asymptotic Bounds & Recurrence Solving', status: 'Upcoming' },
            { day: 5, date: 'Day 5', topic: 'Timed Mock Exam #1 & AI Review', hours: 3.5, focus: 'Simulated 3-hour Paper + Feedback Analysis', status: 'Upcoming' },
          ],
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
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
    console.error('Gemini plan error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate study plan' });
  }
});

function getAIClient() {
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

function localAcademicAnalysis(content: string, documentName: string) {
  const topicPatterns: Array<[string, RegExp]> = [
    ['Graphs and Traversal', /\b(graph|bfs|dfs|traversal|dijkstra)\b/gi],
    ['Trees and AVL Rotations', /\b(tree|avl|binary search tree|rotation)\b/gi],
    ['Linked Lists', /\b(linked[ -]?list|insertion|deletion)\b/gi],
    ['Stacks and Queues', /\b(stack|queue)\b/gi],
    ['Arrays', /\b(array|arrays)\b/gi],
    ['Dynamic Programming', /\b(dynamic programming|knapsack|memoization)\b/gi],
    ['Algorithm Complexity', /\b(big o|complexity|master theorem)\b/gi],
  ];
  const matched: Array<{ name: string; count: number }> = topicPatterns.map(([name, pattern]) => ({
    name,
    count: (content.match(pattern as RegExp) || []).length,
  })).filter((topic) => topic.count > 0);
  const headings = content.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
    .filter((line) => line.length > 2 && line.length < 70 && /:$/.test(line))
    .map((line) => ({ name: line.replace(/:$/, ''), count: 1 }));
  const candidates = matched.length > 0 ? matched : headings.length > 0 ? headings : [{ name: 'Academic Material Review', count: 1 }];
  const total = candidates.reduce((sum, topic) => sum + topic.count, 0);
  const topics = candidates.slice(0, 6).map((topic) => ({
    name: topic.name,
    priority: Math.min(10, 4 + topic.count * 2),
    weightage: Math.max(5, Math.round((topic.count / total) * 100)),
    source: 'extracted',
  }));
  const questionLines = content.split(/\r?\n/)
    .filter((line) => /^\s*(?:q(?:uestion)?\s*)?\d+[.)]/i.test(line))
    .slice(0, 8);
  const questions = questionLines.map((line, index) => ({
    id: `local-q-${index + 1}`,
    topic: topics.find((topic) => new RegExp(topic.name.split(' ')[0], 'i').test(line))?.name || topics[0].name,
    question: line.replace(/^\s*(?:q(?:uestion)?\s*)?\d+[.)]\s*/i, ''),
    marks: Number((line.match(/\[(\d+)\s*marks?\]/i) || [])[1]) || 10,
    type: 'Subjective',
    suggestedTimeMinutes: 15,
  }));
  return {
    title: documentName || 'Academic Topic Extraction',
    summary: `Extracted ${topics.length} topic${topics.length === 1 ? '' : 's'} from the supplied academic text.`,
    topics,
    extractedQuestions: questions,
  };
}

function normalizeAnalysis(raw: any, content: string, documentName: string) {
  const fallback = localAcademicAnalysis(content, documentName);
  if (!Array.isArray(raw?.topics) || raw.topics.length === 0) return fallback;
  const topics = raw.topics.slice(0, 8).map((topic: any, index: number) => ({
    name: String(topic.name || `Topic ${index + 1}`).trim(),
    priority: Math.max(1, Math.min(10, Number(topic.priority) || (topic.highYield ? 9 : 6))),
    weightage: Math.max(1, Number(topic.weightage) || Math.round(100 / raw.topics.length)),
    source: 'extracted',
  })).filter((topic: TopicInput) => topic.name);
  return {
    title: raw.title || fallback.title,
    summary: raw.summary || fallback.summary,
    topics,
    extractedQuestions: Array.isArray(raw.extractedQuestions) ? raw.extractedQuestions : fallback.extractedQuestions,
  };
}

export async function createApp() {
  await initDatabase();
  const db = await getDatabase();
  services.setDb(db);
  return { app, db };
}

async function startServer() {
  await createApp();

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
