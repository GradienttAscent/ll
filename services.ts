import { DatabaseWrapper, DEFAULT_COURSE_ID } from './db';
import { createId, now } from './utils';
import { HttpError } from './validation';

let dbInstance: DatabaseWrapper | null = null;

export function setDb(db: DatabaseWrapper) {
  dbInstance = db;
}

export function getDb(): DatabaseWrapper {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase and setDb before using services.');
  return dbInstance;
}

export interface TopicInput {
  name: string;
  priority?: number;
  weightage?: number;
  source?: string;
  courseId?: string;
}

export type TopicRow = {
  id: string;
  courseId: string;
  name: string;
  priority: number;
  weightage: number;
  source: string;
  createdAt: string;
};

export type ScheduleBlockRow = {
  id: string;
  topicId: string;
  topicName: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  completed: boolean;
  createdAt: string;
};

export type QuestionRow = {
  id: string;
  topicId: string | null;
  topicName: string | null;
  questionText: string;
  marks: number;
  questionType: string;
  source: string;
  suggestedTimeMinutes: number;
  createdAt: string;
};

export type FeedbackRow = {
  id: string;
  questionId: string | null;
  sessionId: string | null;
  questionText: string | null;
  score: number;
  maxMarks: number;
  source: string;
  strengths: string[];
  improvements: string[];
  feedbackText: string | null;
  modelAnswerSnippet: string | null;
  focus: number | null;
  difficulty: string | null;
  perceivedProgress: number | null;
  notes: string | null;
  createdAt: string;
};

function parseJsonList(raw: any): string[] {
  try {
    const value = JSON.parse(String(raw || '[]'));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function topicRows(userId: string): TopicRow[] {
  return getDb().prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, source, created_at AS createdAt
    FROM topics WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as TopicRow[];
}

export function findOwnedTopic(userId: string, topicId: string): TopicRow | undefined {
  return getDb().prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, source, created_at AS createdAt
    FROM topics WHERE id = ? AND user_id = ?
  `).get(topicId, userId) as TopicRow | undefined;
}

export function findOwnedTopicByName(userId: string, name: string): TopicRow | undefined {
  return getDb().prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, source, created_at AS createdAt
    FROM topics WHERE user_id = ? AND name = ?
  `).get(userId, name.trim()) as TopicRow | undefined;
}

export function saveTopics(userId: string, topics: TopicInput[]): TopicRow[] {
  const insert = getDb().prepare(`
    INSERT INTO topics (id, user_id, course_id, name, priority, weightage, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, course_id, name) DO UPDATE SET
      priority = excluded.priority,
      weightage = excluded.weightage,
      source = excluded.source
  `);
  const saveAll = getDb().transaction((items: TopicInput[]) => {
    for (const topic of items) {
      if (!topic.name?.trim()) continue;
      insert.run(
        createId('topic'),
        userId,
        topic.courseId || DEFAULT_COURSE_ID,
        topic.name.trim(),
        Math.max(1, Math.min(10, Number(topic.priority) || 5)),
        Math.max(1, Number(topic.weightage) || 10),
        topic.source || 'extracted',
        now(),
      );
    }
  });
  saveAll(topics);
  return topicRows(userId);
}

export function scheduleBlockRows(userId: string): ScheduleBlockRow[] {
  const rows = getDb().prepare(`
    SELECT b.id, b.topic_id AS topicId, t.name AS topicName, b.title, b.date,
      b.start_time AS startTime, b.duration_minutes AS durationMinutes,
      CAST(b.completed AS INTEGER) AS completed, b.created_at AS createdAt
    FROM schedule_blocks b
    JOIN topics t ON t.id = b.topic_id AND t.user_id = b.user_id
    WHERE b.user_id = ?
    ORDER BY b.date ASC, b.start_time ASC
  `).all(userId) as Array<Omit<ScheduleBlockRow, 'completed'> & { completed: number }>;
  return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }));
}

export function findOwnedScheduleBlock(userId: string, blockId: string) {
  return getDb().prepare(`
    SELECT b.id, b.topic_id AS topicId, b.title, b.date, b.start_time AS startTime,
      b.duration_minutes AS durationMinutes, CAST(b.completed AS INTEGER) AS completed,
      b.created_at AS createdAt
    FROM schedule_blocks b
    WHERE b.id = ? AND b.user_id = ?
  `).get(blockId, userId) as any | undefined;
}

function minutesOfDay(startTime: string): number {
  const [hours, minutes] = String(startTime || '').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function timeRangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function userSlots(userId: string): Array<{ date: string; startMinutes: number; endMinutes: number }> {
  const rows = getDb().prepare(`
    SELECT date, start_time AS startTime, duration_minutes AS durationMinutes
    FROM schedule_blocks WHERE user_id = ?
  `).all(userId) as Array<{ date: string; startTime: string; durationMinutes: number }>;
  return rows.map((row) => {
    const startMinutes = minutesOfDay(row.startTime);
    return { date: row.date, startMinutes, endMinutes: startMinutes + Math.max(1, Number(row.durationMinutes) || 0) };
  });
}

export function findOverlappingBlock(
  userId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeBlockId?: string,
): any | undefined {
  const startMinutes = minutesOfDay(startTime);
  const endMinutes = startMinutes + Math.max(1, Number(durationMinutes) || 0);
  const rows = getDb().prepare(`
    SELECT id, title, date, start_time AS startTime, duration_minutes AS durationMinutes
    FROM schedule_blocks WHERE user_id = ? AND date = ?
  `).all(userId, date) as Array<{ id: string; title: string; startTime: string; durationMinutes: number }>;
  return rows.find((row) => {
    if (excludeBlockId && row.id === excludeBlockId) return false;
    const otherStart = minutesOfDay(row.startTime);
    return timeRangesOverlap(startMinutes, endMinutes, otherStart, otherStart + Number(row.durationMinutes));
  });
}

export function createScheduleBlock(userId: string, input: any) {
  const id = createId('block');
  getDb().prepare(`INSERT INTO schedule_blocks
    (id, user_id, topic_id, title, date, start_time, duration_minutes, completed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, input.topicId, input.title, input.date, input.startTime,
      Math.max(1, Number(input.durationMinutes)), input.completed ? 1 : 0, now());
  return findOwnedScheduleBlock(userId, id);
}

export function saveScheduleBlocks(userId: string, blocks: any[]): any[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new HttpError(400, 'A non-empty scheduleBlocks array is required.');
  }
  for (const block of blocks) {
    if (!block?.topicId || !block?.title || !block?.date || !block?.startTime || !block?.durationMinutes) {
      throw new HttpError(400, 'Each schedule block requires topicId, title, date, startTime, and durationMinutes.');
    }
    if (!findOwnedTopic(userId, block.topicId)) {
      throw new HttpError(404, `Topic ${block.topicId} does not exist or is not owned by this user.`);
    }
  }

  const created: any[] = [];
  const occupied = userSlots(userId);
  const saveAll = getDb().transaction((items: any[]) => {
    for (const block of items) {
      const startMinutes = minutesOfDay(block.startTime);
      const endMinutes = startMinutes + Math.max(1, Number(block.durationMinutes) || 0);
      const conflicting = occupied.some((slot) =>
        slot.date === block.date && timeRangesOverlap(startMinutes, endMinutes, slot.startMinutes, slot.endMinutes));
      if (conflicting) {
        throw new HttpError(409, `Block "${block.title}" on ${block.date} at ${block.startTime} overlaps an existing schedule block.`);
      }
      const id = createId('block');
      getDb().prepare(`INSERT INTO schedule_blocks
        (id, user_id, topic_id, title, date, start_time, duration_minutes, completed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, block.topicId, block.title, block.date, block.startTime,
          Math.max(1, Number(block.durationMinutes) || 0), block.completed ? 1 : 0, now());
      occupied.push({ date: block.date, startMinutes, endMinutes });
      created.push(findOwnedScheduleBlock(userId, id));
    }
  });
  saveAll(blocks);
  return created;
}

export function updateScheduleBlock(userId: string, blockId: string, updates: {
  title?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  completed?: number;
  topicId?: string;
}) {
  const assignments: string[] = [];
  const params: any[] = [];
  if (updates.title !== undefined) { assignments.push('title = ?'); params.push(updates.title); }
  if (updates.date !== undefined) { assignments.push('date = ?'); params.push(updates.date); }
  if (updates.startTime !== undefined) { assignments.push('start_time = ?'); params.push(updates.startTime); }
  if (updates.durationMinutes !== undefined) { assignments.push('duration_minutes = ?'); params.push(updates.durationMinutes); }
  if (updates.completed !== undefined) { assignments.push('completed = ?'); params.push(updates.completed); }
  if (updates.topicId !== undefined) { assignments.push('topic_id = ?'); params.push(updates.topicId); }
  if (assignments.length === 0) return;
  params.push(userId, blockId);
  getDb().prepare(`UPDATE schedule_blocks SET ${assignments.join(', ')} WHERE user_id = ? AND id = ?`)
    .run(...params);
}

export function recordScheduleChange(userId: string, blockId: string, field: string, oldValue: string | null, newValue: string | null, reason?: string) {
  getDb().prepare(`INSERT INTO schedule_changes (id, user_id, block_id, field, old_value, new_value, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(createId('change'), userId, blockId, field, oldValue, newValue, reason || null, now());
}

export function getScheduleChanges(userId: string, blockId?: string): any[] {
  const base = `SELECT id, block_id AS blockId, field, old_value AS oldValue, new_value AS newValue,
    reason, created_at AS createdAt FROM schedule_changes WHERE user_id = ?`;
  const sql = blockId ? `${base} AND block_id = ?` : base;
  const rows = blockId
    ? getDb().prepare(sql).all(userId, blockId)
    : getDb().prepare(sql).all(userId);
  return rows.map((row: any) => ({
    ...row,
    oldValue: row.oldValue === null ? null : String(row.oldValue),
    newValue: row.newValue === null ? null : String(row.newValue),
  }));
}

export type StudySessionRow = {
  id: string;
  scheduleBlockId: string;
  startedAt: string;
  createdAt: string;
  durationMinutes: number;
  actualDurationSeconds: number;
  status: string;
  endedAt: string | null;
};

export function studySessionRows(userId: string): StudySessionRow[] {
  return getDb().prepare(`
    SELECT id, schedule_block_id AS scheduleBlockId, started_at AS startedAt, created_at AS createdAt,
      duration_minutes AS durationMinutes, actual_duration_seconds AS actualDurationSeconds,
      status, ended_at AS endedAt
    FROM study_sessions
    WHERE user_id = ?
    ORDER BY started_at DESC
  `).all(userId) as StudySessionRow[];
}

export function findOwnedStudySession(userId: string, sessionId: string) {
  return getDb().prepare(`
    SELECT id, schedule_block_id AS scheduleBlockId, duration_minutes AS durationMinutes,
      actual_duration_seconds AS actualDurationSeconds, status, ended_at AS endedAt
    FROM study_sessions
    WHERE id = ? AND user_id = ?
  `).get(sessionId, userId) as any | undefined;
}

export function createStudySession(userId: string, input: { scheduleBlockId: string; durationMinutes: number }) {
  const id = createId('study-session');
  const startedAt = now();
  getDb().prepare(`INSERT INTO study_sessions
    (id, user_id, schedule_block_id, started_at, duration_minutes, actual_duration_seconds, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, input.scheduleBlockId, startedAt, input.durationMinutes, 0, 'active', startedAt);
  return {
    id,
    scheduleBlockId: input.scheduleBlockId,
    startedAt,
    createdAt: startedAt,
    durationMinutes: input.durationMinutes,
    actualDurationSeconds: 0,
    status: 'active',
    endedAt: null,
  };
}

export function updateStudySession(userId: string, sessionId: string, input: { status: string; deltaSeconds: number }) {
  const endedAt = input.status === 'completed' || input.status === 'stopped' ? now() : null;
  getDb().prepare(`UPDATE study_sessions SET status = ?, ended_at = COALESCE(?, ended_at),
    actual_duration_seconds = actual_duration_seconds + ? WHERE user_id = ? AND id = ?`)
    .run(input.status, endedAt, input.deltaSeconds, userId, sessionId);
}

export type DocumentRow = {
  id: string;
  title: string;
  docType: string;
  content: string | null;
  fileSize: string;
  createdAt: string;
};

export function documentRows(userId: string): DocumentRow[] {
  return getDb().prepare(`
    SELECT id, title, doc_type AS docType, content, file_size AS fileSize, created_at AS createdAt
    FROM documents WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as DocumentRow[];
}

export function findOwnedDocument(userId: string, documentId: string): DocumentRow | undefined {
  return getDb().prepare(`
    SELECT id, title, doc_type AS docType, content, file_size AS fileSize, created_at AS createdAt
    FROM documents WHERE id = ? AND user_id = ?
  `).get(documentId, userId) as DocumentRow | undefined;
}

export function createDocument(userId: string, input: any): DocumentRow {
  const id = createId('document');
  getDb().prepare(`INSERT INTO documents (id, user_id, title, doc_type, content, file_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, String(input.title).trim(), String(input.docType || 'Past Paper'),
      typeof input.content === 'string' && input.content ? input.content : null,
      String(input.fileSize || ''), now());
  return findOwnedDocument(userId, id)!;
}

export function questionRows(userId: string): QuestionRow[] {
  return getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.question_text AS questionText, q.marks,
      q.question_type AS questionType, q.source, q.suggested_time_minutes AS suggestedTimeMinutes,
      q.created_at AS createdAt, t.name AS topicName
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
    WHERE q.user_id = ?
    ORDER BY q.created_at DESC
  `).all(userId) as QuestionRow[];
}

export function findOwnedQuestion(userId: string, questionId: string): QuestionRow | undefined {
  const row = getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.question_text AS questionText, q.marks,
      q.question_type AS questionType, q.source, q.suggested_time_minutes AS suggestedTimeMinutes,
      q.created_at AS createdAt, t.name AS topicName
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
    WHERE q.id = ? AND q.user_id = ?
  `).get(questionId, userId) as QuestionRow | undefined;
  return row;
}

function resolveQuestionTopic(userId: string, item: any): string | null {
  if (item.topicId && typeof item.topicId === 'string') {
    const owned = findOwnedTopic(userId, item.topicId);
    if (!owned) throw new HttpError(404, 'The selected topic does not exist.');
    return owned.id;
  }
  if (item.topicName && typeof item.topicName === 'string' && item.topicName.trim()) {
    const name = item.topicName.trim();
    let owned = findOwnedTopicByName(userId, name);
    if (!owned) {
      const id = createId('topic');
      getDb().prepare(`INSERT INTO topics (id, user_id, course_id, name, priority, weightage, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, course_id, name) DO NOTHING`)
        .run(id, userId, DEFAULT_COURSE_ID, name, 5, 10, 'extracted', now());
      owned = findOwnedTopicByName(userId, name);
    }
    return owned?.id ?? null;
  }
  return null;
}

export function createQuestionsBulk(userId: string, items: any[]): QuestionRow[] {
  for (const item of items) {
    if (!item || typeof item.questionText !== 'string' || !item.questionText.trim()) {
      throw new HttpError(400, 'Each question requires questionText.');
    }
  }
  for (const item of items) {
    const id = createId('question');
    const topicId = resolveQuestionTopic(userId, item);
    getDb().prepare(`INSERT INTO questions
      (id, user_id, topic_id, question_text, marks, question_type, source, suggested_time_minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, topicId, item.questionText.trim(),
        Math.max(1, Number(item.marks) || 10),
        String(item.questionType || 'Subjective'),
        String(item.source || 'extracted'),
        Math.max(1, Number(item.suggestedTimeMinutes) || 15),
        now());
  }
  return questionRows(userId);
}

export function createFeedback(userId: string, body: any): FeedbackRow {
  const id = createId('feedback');
  const strengths = JSON.stringify(Array.isArray(body.strengths) ? body.strengths.map(String) : []);
  const improvements = JSON.stringify(Array.isArray(body.improvements) ? body.improvements.map(String) : []);
  getDb().prepare(`INSERT INTO feedback
    (id, user_id, question_id, session_id, score, max_marks, source, strengths, improvements,
     feedback_text, model_answer_snippet, focus, difficulty, perceived_progress, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, body.questionId || null, body.sessionId || null, Number(body.score), Number(body.maxMarks),
      String(body.source || 'gemini'), strengths, improvements,
      body.feedbackText || null, body.modelAnswerSnippet || null,
      body.focus !== undefined && body.focus !== null ? Number(body.focus) : null,
      body.difficulty ? String(body.difficulty).toLowerCase() : null,
      body.perceivedProgress !== undefined && body.perceivedProgress !== null ? Number(body.perceivedProgress) : null,
      body.notes || null, now());
  const created = findOwnedFeedback(userId, id);
  return created!;
}

export function findOwnedFeedback(userId: string, feedbackId: string): FeedbackRow | undefined {
  const row = getDb().prepare(`
    SELECT f.id, f.question_id AS questionId, f.session_id AS sessionId, f.score, f.max_marks AS maxMarks, f.source,
      f.strengths, f.improvements, f.feedback_text AS feedbackText,
      f.model_answer_snippet AS modelAnswerSnippet, f.focus, f.difficulty,
      f.perceived_progress AS perceivedProgress, f.notes, f.created_at AS createdAt,
      (SELECT q.question_text FROM questions q WHERE q.id = f.question_id) AS questionText
    FROM feedback f
    WHERE f.id = ? AND f.user_id = ?
  `).get(feedbackId, userId) as any;
  if (!row) return undefined;
  return {
    ...row,
    strengths: parseJsonList(row.strengths),
    improvements: parseJsonList(row.improvements),
  };
}

export function feedbackRows(userId: string): FeedbackRow[] {
  const rows = getDb().prepare(`
    SELECT f.id, f.question_id AS questionId, f.session_id AS sessionId, f.score, f.max_marks AS maxMarks, f.source,
      f.strengths, f.improvements, f.feedback_text AS feedbackText,
      f.model_answer_snippet AS modelAnswerSnippet, f.focus, f.difficulty,
      f.perceived_progress AS perceivedProgress, f.notes, f.created_at AS createdAt,
      (SELECT q.question_text FROM questions q WHERE q.id = f.question_id) AS questionText
    FROM feedback f
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(userId) as any[];
  return rows.map((row) => ({
    ...row,
    strengths: parseJsonList(row.strengths),
    improvements: parseJsonList(row.improvements),
  }));
}

export const todayKey = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

function addDaysKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export interface TopicProgressEntry {
  topicId: string;
  topicName: string;
  totalBlocks: number;
  completedBlocks: number;
  completionRate: number;
}

export interface AnalyticsSnapshot {
  plannedMinutes: number;
  completedMinutes: number;
  completedCount: number;
  missedCount: number;
  completionRate: number;
  upcomingWorkloadMinutes: number;
  topicProgress: TopicProgressEntry[];
  today: string;
}

export function computeAnalytics(userId: string): AnalyticsSnapshot {
  const today = todayKey();
  const rows = getDb().prepare(`
    SELECT b.id, b.date, b.duration_minutes AS durationMinutes, CAST(b.completed AS INTEGER) AS completed,
      b.topic_id AS topicId, t.name AS topicName
    FROM schedule_blocks b
    LEFT JOIN topics t ON t.id = b.topic_id AND t.user_id = b.user_id
    WHERE b.user_id = ?
  `).all(userId) as Array<{ id: string; date: string; durationMinutes: number; completed: number; topicId: string; topicName: string | null }>;

  let plannedMinutes = 0;
  let completedMinutes = 0;
  let completedCount = 0;
  let missedCount = 0;
  let upcomingWorkloadMinutes = 0;
  const byTopic = new Map<string, { topicId: string; topicName: string | null; total: number; completed: number }>();

  for (const row of rows) {
    const minutes = Math.max(0, Number(row.durationMinutes) || 0);
    const done = row.completed === 1;
    plannedMinutes += minutes;
    if (done) {
      completedCount += 1;
      completedMinutes += minutes;
    } else if (String(row.date) < today) {
      missedCount += 1;
    }
    if (!done && String(row.date) >= today) {
      upcomingWorkloadMinutes += minutes;
    }
    const topic = byTopic.get(row.topicId) || { topicId: row.topicId, topicName: row.topicName, total: 0, completed: 0 };
    topic.total += 1;
    if (done) topic.completed += 1;
    byTopic.set(row.topicId, topic);
  }

  const due = completedCount + missedCount;
  const completionRate = due > 0 ? completedCount / due : 0;

  const topicProgress: TopicProgressEntry[] = Array.from(byTopic.values()).map((topic) => ({
    topicId: topic.topicId,
    topicName: topic.topicName || '',
    totalBlocks: topic.total,
    completedBlocks: topic.completed,
    completionRate: topic.total > 0 ? topic.completed / topic.total : 0,
  })).sort((a, b) => b.totalBlocks - a.totalBlocks);

  return {
    plannedMinutes,
    completedMinutes,
    completedCount,
    missedCount,
    completionRate,
    upcomingWorkloadMinutes,
    topicProgress,
    today,
  };
}

export interface AvailableSlot {
  date: string;
  startTime: string;
}

export function findNextAvailableSlot(userId: string, durationMinutes: number): AvailableSlot | null {
  const duration = Math.max(15, Math.min(240, Number(durationMinutes) || 15));
  const occupied = userSlots(userId);
  const today = todayKey();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const date = addDaysKey(today, dayOffset);
    const daySlots = occupied.filter((slot) => slot.date === date);
    for (let start = 8 * 60; start + duration <= 22 * 60; start += 15) {
      if (dayOffset === 0 && start < nowMinutes) continue;
      const end = start + duration;
      const conflicts = daySlots.some((slot) => timeRangesOverlap(start, end, slot.startMinutes, slot.endMinutes));
      if (!conflicts) {
        return { date, startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` };
      }
    }
  }
  return null;
}