import { DatabaseWrapper, DEFAULT_COURSE_ID } from './db';
import { createId, now } from './utils';
import { HttpError, scheduleStartMinutes, validateBlockInput } from './validation';
import type { AssistantPeriod, SchedulingAssistantIntent } from './schedulingAssistant';

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
  hasWeightage?: boolean;
  source?: string;
  courseId?: string;
}

export type TopicRow = {
  id: string;
  courseId: string;
  name: string;
  priority: number;
  weightage: number;
  hasWeightage: boolean;
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
  blockType: 'study' | 'revision';
  createdAt: string;
};

export const MIN_MEANINGFUL_STUDY_SECONDS = 60;
export const DEFAULT_MEMORY_STRENGTH_DAYS = 7;
export const MEMORY_STRENGTH_EXPOSURE_CAP = 6;
export const MEMORY_STRENGTH_EXPOSURE_BONUS = 0.35;
export const MEMORY_STABLE_THRESHOLD = 0.7;
export const MEMORY_DUE_THRESHOLD = 0.5;

export type QuestionRow = {
  id: string;
  topicId: string | null;
  topicName: string | null;
  documentId: string | null;
  questionText: string;
  questionNumber: string | null;
  subpart: string | null;
  context: string | null;
  marks: number;
  questionType: string;
  source: string;
  suggestedTimeMinutes: number;
  mappingScore: number | null;
  mappingEvidence: string[];
  mappingStatus: 'mapped' | 'unmatched';
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
    SELECT id, course_id AS courseId, name, priority, weightage, CAST(has_weightage AS INTEGER) AS hasWeightage, source, created_at AS createdAt
    FROM topics WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map((row: any) => ({ ...row, hasWeightage: Boolean(row.hasWeightage) })) as TopicRow[];
}

export function findOwnedTopic(userId: string, topicId: string): TopicRow | undefined {
  const row = getDb().prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, CAST(has_weightage AS INTEGER) AS hasWeightage, source, created_at AS createdAt
    FROM topics WHERE id = ? AND user_id = ?
  `).get(topicId, userId) as any;
  return row ? { ...row, hasWeightage: Boolean(row.hasWeightage) } : undefined;
}

export function findOwnedTopicByName(userId: string, name: string): TopicRow | undefined {
  const row = getDb().prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, CAST(has_weightage AS INTEGER) AS hasWeightage, source, created_at AS createdAt
    FROM topics WHERE user_id = ? AND name = ?
  `).get(userId, name.trim()) as any;
  return row ? { ...row, hasWeightage: Boolean(row.hasWeightage) } : undefined;
}

export function saveTopics(userId: string, topics: TopicInput[]): TopicRow[] {
  const insert = getDb().prepare(`
    INSERT INTO topics (id, user_id, course_id, name, priority, weightage, has_weightage, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, course_id, name) DO UPDATE SET
      priority = excluded.priority,
      weightage = excluded.weightage,
      has_weightage = excluded.has_weightage,
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
        topic.hasWeightage ? 1 : 0,
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
      CAST(b.completed AS INTEGER) AS completed, b.block_type AS blockType, b.created_at AS createdAt
    FROM schedule_blocks b
    JOIN topics t ON t.id = b.topic_id AND t.user_id = b.user_id
    WHERE b.user_id = ?
    ORDER BY b.date ASC, b.start_time ASC
  `).all(userId) as Array<Omit<ScheduleBlockRow, 'completed'> & { completed: number }>;
  return rows.map((row) => ({ ...row, completed: Boolean(row.completed), blockType: row.blockType === 'revision' ? 'revision' : 'study' }));
}

export function findOwnedScheduleBlock(userId: string, blockId: string) {
  return getDb().prepare(`
    SELECT b.id, b.topic_id AS topicId, b.title, b.date, b.start_time AS startTime,
      b.duration_minutes AS durationMinutes, CAST(b.completed AS INTEGER) AS completed,
      b.block_type AS blockType,
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
    (id, user_id, topic_id, title, date, start_time, duration_minutes, completed, block_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, input.topicId, input.title, input.date, input.startTime,
      Math.max(1, Number(input.durationMinutes)), input.completed ? 1 : 0,
      input.blockType === 'revision' ? 'revision' : 'study', now());
  return findOwnedScheduleBlock(userId, id);
}

export type ScheduleBlockInput = {
  topicId: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  completed?: boolean;
  blockType?: 'study' | 'revision';
};

function blocksOverlap(existing: ScheduleBlockInput, candidate: ScheduleBlockInput): boolean {
  if (existing.date !== candidate.date) return false;
  const existingStart = scheduleStartMinutes(existing.startTime)!;
  const candidateStart = scheduleStartMinutes(candidate.startTime)!;
  const existingEnd = existingStart + Number(existing.durationMinutes);
  const candidateEnd = candidateStart + Number(candidate.durationMinutes);
  return existingStart < candidateEnd && candidateStart < existingEnd;
}

export function assertScheduleBlocksAreValid(
  userId: string,
  candidates: ScheduleBlockInput[],
  excludeBlockIds?: string | string[],
) {
  for (const candidate of candidates) {
    const validationError = validateBlockInput(candidate);
    if (validationError) throw new HttpError(400, validationError);
    if (candidate.blockType !== undefined && candidate.blockType !== 'study' && candidate.blockType !== 'revision') {
      throw new HttpError(400, 'blockType must be study or revision.');
    }
    if (!findOwnedTopic(userId, candidate.topicId)) {
      throw new HttpError(404, `Topic ${candidate.topicId} does not exist or is not owned by this user.`);
    }
  }

  const excluded = new Set(excludeBlockIds === undefined ? [] : Array.isArray(excludeBlockIds) ? excludeBlockIds : [excludeBlockIds]);
  const stored = scheduleBlockRows(userId).filter((block) => !excluded.has(block.id));
  for (const candidate of candidates) {
    if (stored.some((block) => blocksOverlap(block, candidate))) {
      throw new HttpError(409, 'Schedule block overlaps an existing block.');
    }
  }

  for (let index = 0; index < candidates.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex += 1) {
      if (blocksOverlap(candidates[index], candidates[otherIndex])) {
        throw new HttpError(409, 'Schedule blocks in the same request overlap.');
      }
    }
  }
}

export function saveScheduleBlocks(
  userId: string,
  blocks: any[],
  additionalHistory?: { field: string; oldValue: string | null; newValue: string | null },
): any[] {
  assertScheduleBlocksAreValid(userId, blocks);
  const created: any[] = [];
  const saveAll = getDb().transaction((items: any[]) => {
    for (const block of items) {
      const saved = createScheduleBlock(userId, block);
      created.push(saved);
      recordScheduleChange(userId, saved.id, 'created', null, JSON.stringify({
        title: saved.title, date: saved.date, startTime: saved.startTime, durationMinutes: saved.durationMinutes,
      }));
      if (additionalHistory) recordScheduleChange(userId, saved.id, additionalHistory.field, additionalHistory.oldValue, additionalHistory.newValue);
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

export function deleteScheduleBlock(userId: string, blockId: string) {
  getDb().prepare('DELETE FROM schedule_blocks WHERE user_id = ? AND id = ?').run(userId, blockId);
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
  activeSince: string | null;
};

export function studySessionRows(userId: string): StudySessionRow[] {
  return getDb().prepare(`
    SELECT id, schedule_block_id AS scheduleBlockId, started_at AS startedAt, created_at AS createdAt,
      duration_minutes AS durationMinutes, actual_duration_seconds AS actualDurationSeconds,
      status, ended_at AS endedAt, active_since AS activeSince
    FROM study_sessions
    WHERE user_id = ?
    ORDER BY started_at DESC
  `).all(userId) as StudySessionRow[];
}

export function findOwnedStudySession(userId: string, sessionId: string) {
  return getDb().prepare(`
    SELECT id, schedule_block_id AS scheduleBlockId, started_at AS startedAt, created_at AS createdAt,
      duration_minutes AS durationMinutes, actual_duration_seconds AS actualDurationSeconds,
      status, ended_at AS endedAt, active_since AS activeSince
    FROM study_sessions
    WHERE id = ? AND user_id = ?
  `).get(sessionId, userId) as any | undefined;
}

export function createStudySession(userId: string, input: { scheduleBlockId: string; durationMinutes: number }) {
  const id = createId('study-session');
  const startedAt = now();
  getDb().prepare(`INSERT INTO study_sessions
    (id, user_id, schedule_block_id, started_at, duration_minutes, actual_duration_seconds, status, active_since, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, input.scheduleBlockId, startedAt, input.durationMinutes, 0, 'active', startedAt, startedAt);
  return {
    id,
    scheduleBlockId: input.scheduleBlockId,
    startedAt,
    createdAt: startedAt,
    durationMinutes: input.durationMinutes,
    actualDurationSeconds: 0,
    status: 'active',
    endedAt: null,
    activeSince: startedAt,
  };
}

export function updateStudySession(userId: string, sessionId: string, input: { status: string; deltaSeconds: number }) {
  const endedAt = input.status === 'completed' || input.status === 'stopped' ? now() : null;
  const activeSince = input.status === 'active' ? now() : null;
  getDb().prepare(`UPDATE study_sessions SET status = ?, ended_at = COALESCE(?, ended_at), active_since = ?,
    actual_duration_seconds = actual_duration_seconds + ? WHERE user_id = ? AND id = ?`)
    .run(input.status, endedAt, activeSince, input.deltaSeconds, userId, sessionId);
  return findOwnedStudySession(userId, sessionId)!;
}

export function completeStudySession(userId: string, sessionId: string, deltaSeconds: number) {
  const session = findOwnedStudySession(userId, sessionId);
  if (!session) throw new HttpError(404, 'Study session not found.');
  const block = findOwnedScheduleBlock(userId, session.scheduleBlockId);
  if (!block) throw new HttpError(404, 'Schedule block not found.');
  const completeAll = getDb().transaction(() => {
    updateStudySession(userId, sessionId, { status: 'completed', deltaSeconds });
    if (!block.completed) {
      updateScheduleBlock(userId, session.scheduleBlockId, { completed: 1 });
      recordScheduleChange(userId, session.scheduleBlockId, 'completed', '0', '1');
    }
  });
  completeAll([]);
  return findOwnedStudySession(userId, sessionId)!;
}

export type SessionFeedbackRow = {
  id: string;
  studySessionId: string;
  focusRating: number;
  difficultyRating: number;
  progressRating: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function findSessionFeedback(userId: string, studySessionId: string): SessionFeedbackRow | undefined {
  return getDb().prepare(`SELECT id, study_session_id AS studySessionId, focus_rating AS focusRating,
    difficulty_rating AS difficultyRating, progress_rating AS progressRating, notes,
    created_at AS createdAt, updated_at AS updatedAt
    FROM session_feedback WHERE user_id = ? AND study_session_id = ?`)
    .get(userId, studySessionId) as SessionFeedbackRow | undefined;
}

export function upsertSessionFeedback(userId: string, studySessionId: string, input: {
  focusRating: number; difficultyRating: number; progressRating: number; notes?: string;
}): SessionFeedbackRow {
  const timestamp = now();
  getDb().prepare(`INSERT INTO session_feedback
    (id, user_id, study_session_id, focus_rating, difficulty_rating, progress_rating, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(study_session_id) DO UPDATE SET focus_rating = excluded.focus_rating,
      difficulty_rating = excluded.difficulty_rating, progress_rating = excluded.progress_rating,
      notes = excluded.notes, updated_at = excluded.updated_at`)
    .run(createId('session-feedback'), userId, studySessionId, input.focusRating, input.difficultyRating,
      input.progressRating, input.notes?.trim() || null, timestamp, timestamp);
  return findSessionFeedback(userId, studySessionId)!;
}

export type DocumentRow = {
  id: string;
  title: string;
  docType: string;
  content: string | null;
  fileSize: string;
  mimeType?: string;
  extractionMethod?: string;
  createdAt: string;
};

export function documentRows(userId: string): DocumentRow[] {
  return getDb().prepare(`
    SELECT id, title, doc_type AS docType, content, file_size AS fileSize, mime_type AS mimeType, extraction_method AS extractionMethod, created_at AS createdAt
    FROM documents WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as DocumentRow[];
}

export function findOwnedDocument(userId: string, documentId: string): DocumentRow | undefined {
  return getDb().prepare(`
    SELECT id, title, doc_type AS docType, content, file_size AS fileSize, mime_type AS mimeType, extraction_method AS extractionMethod, created_at AS createdAt
    FROM documents WHERE id = ? AND user_id = ?
  `).get(documentId, userId) as DocumentRow | undefined;
}

export function createDocument(userId: string, input: any): DocumentRow {
  const id = createId('document');
  getDb().prepare(`INSERT INTO documents (id, user_id, title, doc_type, content, file_size, file_data, mime_type, extraction_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, String(input.title).trim(), String(input.docType || 'Past Paper'),
      typeof input.content === 'string' && input.content ? input.content : null,
      String(input.fileSize || ''), input.fileData || null, String(input.mimeType || 'text/plain'), String(input.extractionMethod || 'provided-text'), now());
  return findOwnedDocument(userId, id)!;
}

function academicTokens(value: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'using', 'explain', 'describe', 'discuss', 'compare', 'define', 'write', 'about', 'into', 'your', 'their', 'are', 'is', 'of', 'to', 'in', 'a', 'an']);
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/)
    .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

export function normalizeAcademicQuestion(value: string): string {
  return sanitizeAcademicText(value)
    .replace(/^\s*(?:(?:question|q)\s*)?\d+\s*(?:\([^)]*\))?\s*[.):\-]\s*/i, '')
    .replace(/\s+/g, ' ').trim();
}

// Single-word overlaps that are so generic they must never, by themselves, justify a
// question-to-topic mapping ("PM", "While", "management", "system", "process", ...).
const GENERIC_TOPIC_TOKENS = new Set([
  'management', 'while', 'pm', 'system', 'systems', 'process', 'processes', 'model', 'models',
  'data', 'information', 'technology', 'design', 'method', 'methods', 'technique', 'techniques',
  'concept', 'concepts', 'types', 'type', 'different', 'various', 'following', 'using', 'based',
  'used', 'use', 'basic', 'common', 'important', 'features', 'state', 'explain', 'describe',
  'discuss', 'justify', 'draw', 'define', 'list', 'write', 'identify', 'prepare', 'perform',
  'suggest', 'mark', 'marks',
]);

// Course-neutral words that are still too generic to be the sole evidence when matching a
// multi-word topic on a single token.
const COMMON_ACADEMIC_TOKENS = new Set([
  'software', 'requirements', 'specification', 'architecture', 'quality', 'attributes',
  'metrics', 'function', 'functional', 'form', 'model', 'system', 'process', 'management',
  'information', 'data', 'method', 'design',
]);

// Removes decorative runs, page markers ("1/2", "PTO"), and greeting noise that appear in
// extracted question-paper text but carry no question content. Markdown/rich-text markers are
// normalized first: literal "\*\*" escapes, bold wraps, bullets, separators, and every other
// asterisk are removed before marker detection so labels like "a)**" split cleanly.
function stripMarkdownNoise(value: string): string {
  return value
    .replace(/\\\*/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/(?:[_=~\-]\s*){3,}/g, ' ');
}

// PDF/OCR and copied HTML often leave entities, markup and footer text in what otherwise
// looks like a valid question. Normalize this before a question or its parent context reaches
// the database so it cannot pollute de-duplication, classification, or the practice view.
function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '-', mdash: '-',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    const key = String(code).toLowerCase();
    if (key.startsWith('#x')) {
      const point = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    if (key.startsWith('#')) {
      const point = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[key] ?? entity;
  });
}

function sanitizeAcademicText(value: string): string {
  let text = String(value || '').replace(/\r/g, '');
  // Decode twice to handle escaped HTML such as "&amp;lt;br&amp;gt;" from rich-text exports.
  text = decodeHtmlEntities(decodeHtmlEntities(text));
  return stripMarkdownNoise(text)
    .replace(/&nbsp;?/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    // Some extractors strip the tag brackets but leave attributes behind. They are layout
    // metadata, never part of an academic question.
    .replace(/\b(?:class|style|id|data-[\w-]+|href|align|width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
    .replace(/\bA(?:ll|II)\s+the\s+Best\b[!*.\s]*/gi, ' ')
    .replace(/[\u00a0\t]/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function cleanPaperContent(content: string): string {
  return sanitizeAcademicText(content)
    .replace(/\bPTO\b/gi, ' ')
    .replace(/\b\d+\s*\/\s*\d+\s*/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n');
}

// Progressive marker detection that works on single-line extractions (many PDFs produce one
// physical line): question numbers ("1.", "Q1", "QUESTION 1 (12 Marks):") and sub-parts
// ("a)", "(b)", "i)", "(ii)"). Decimals ("2.30"), page markers ("1/2") and marks parens
// ("(5 Marks)") are deliberately NOT matched.
const MARKS_TAIL = String.raw`(?:\s*[(\[]\s*\d+(?:\s*[+×x*]\s*\d+)*(?:\s*=\s*\d+)?\s*(?:marks?)?\s*[)\]])?`;
const LINE_MARKER = new RegExp(
  String.raw`(?:^|[\s(])(?:question|que(?:stion)?|q)\.?\s*(?:no\.?\s*)?(\d{1,3})\b` + MARKS_TAIL + String.raw`\s*(?::|[.):\-])?` +
  String.raw`|(?<![\w(])(\d{1,3})\.(?!\d)` +
  String.raw`|(?<![\w(])(\d{1,3})\)(?!\s*marks?\b)` +
  String.raw`|(?<![\w])\(?([a-z]|[ivx]{1,3})\)(?=\s+[A-Z0-9(])`,
  'gi',
);
const SECTION_HEADER = /^(?:section|part)\b/i;
const BOILERPLATE = /^(?:time(?: allowed)?|max(?:imum)?\s*marks?|total\s*marks?|marks?(?:\s*allotted)?[:.]|instructions?[:.]|attempt\s+(?:all|any)|answer\s+(?:all|any)|roll\s*(?:no\.?|number)?|register\s*(?:no\.?|number)?|enroll(?:ment)?\s*(?:no\.?|number)?|semester[:.]|course\s*(?:code|name)?[:.]|subject\s*(?:code)?[:.]|paper\s*(?:code)?[:.]|branch[:.]|year[:.]|page[:.]|duration[:.]|note[s]?[:.]|general\s*instructions?)/i;

function extractQuestionMarks(text: string): number | null {
  const keyword = /(?:^|\s|\(|\[)(\d+(?:\.\d+)?)\s*(?:marks?|m)\b/i.exec(text);
  if (keyword) return Math.max(1, Math.round(Number(keyword[1])));
  const bracketed = /[(\[]\s*(\d+(?:\s*[+×x*]\s*\d+)*)\s*(?:=\s*(\d+))?\s*[)\]]/i.exec(text);
  if (bracketed) {
    if (bracketed[2] && Number(bracketed[2]) > 0) return Math.max(1, Math.round(Number(bracketed[2])));
    const parts = bracketed[1].split(/\s*[+×x*]\s*/).map((part) => Number(part)).filter((part) => Number.isFinite(part));
    if (parts.length === 1) {
      return /\[/.test(bracketed[0]) ? Math.max(1, Math.round(parts[0])) : null;
    }
    const multiply = /[×x*]/.test(bracketed[1]);
    const value = multiply ? parts.reduce((total, part) => total * part, 1) : parts.reduce((total, part) => total + part, 0);
    return Math.max(1, Math.round(value));
  }
  return null;
}

export interface QuestionRecord {
  text: string;
  marks: number;
  questionNumber?: string;
  subpart?: string;
  context?: string;
}

interface MarkerSpan {
  start: number;
  end: number;
  marks: number | null;
  subpart: boolean;
  label: string;
}

// Punctuation that legitimately terminates a parent-question stem before a sub-part label
// ("Question 1...?. a) ...", "...(5 Marks) b) ..."). A diagram/pseudocode vertex token such
// as "(v)" or "v-w)" or "REcTARRY(w)" is preceded by a word, "-", "/" or "(" instead and
// must never be treated as a sub-part marker.
function hasStandaloneSubpartBoundary(line: string, spanStart: number): boolean {
  const before = line.slice(0, spanStart).replace(/[\t ]+$/, '');
  if (before === '') return true;
  if (/[.?:\u2019;,!)\]}]$/.test(before)) return true;
  // Parenthetical form "(a)": the opening paren may complete the boundary.
  if (before.endsWith('(')) {
    const inner = before.slice(0, -1).replace(/[\t ]+$/, '');
    return inner === '' || /[.?:\u2019;,!)\]}]$/.test(inner);
  }
  return false;
}

function allMarkerSpans(line: string): MarkerSpan[] {
  const spans: MarkerSpan[] = [];
  for (const match of line.matchAll(LINE_MARKER)) {
    const raw = match[0];
    const [, questionWord, dot, paren, subpart] = match;
    const subpartMatch = subpart !== undefined;
    const start = match.index ?? 0;
    // An isolated letter / roman-numeral needs real question context: the label must sit
    // after a stem boundary and be followed by substantive text, not pseudocode noise.
    if (subpartMatch && !hasStandaloneSubpartBoundary(line, start)) continue;
    const end = start + raw.length;
    spans.push({
      start,
      end,
      marks: extractQuestionMarks(raw),
      subpart: subpartMatch,
      label: subpartMatch ? subpart.toLowerCase() : (questionWord ?? dot ?? paren).toLowerCase(),
    });
  }
  return spans;
}

// Splits a question paper into question records. Sub-parts ("a)", "(b)") become their own
// records and inherit the numeric question's group (so they stay grouped for mark inheritance
// and sibling-topic inheritance); the stem of a question with sub-parts is dropped because the
// sub-parts are the actual questions. Unmarked sub-parts inherit the max mark already seen in
// their group — never a blanket 10.
interface QuestionDraft {
  lines: string[];
  marks: number;
  questionNumber?: string;
  subpart?: string;
  context?: string;
}

function isDocumentHeading(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 120 || /[?.!]/.test(text)) return false;
  if (/^(?:end\s+of\s+(?:question\s+)?paper|university\s+examination|examination\s+paper|course\s+title|department\s+of|academic\s+year)\b/i.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && !/\b(?:question|q)\s*\d/i.test(text);
}

export function extractNumberedQuestionRecords(content: string): QuestionRecord[] {
  const lines = cleanPaperContent(content).split('\n');
  const drafts: QuestionDraft[] = [];
  let current: QuestionDraft | null = null;
  let openGroup: string | null = null;
  const groupContexts = new Map<string, string>();

  const commit = () => {
    if (current && current.lines.length > 0) drafts.push(current);
    current = null;
  };
  const append = (text: string) => {
    const trimmed = text.trim();
    if (!current || !trimmed) return;
    current.lines.push(trimmed);
    const marks = extractQuestionMarks(trimmed);
    if (marks !== null && marks > current.marks) current.marks = marks;
  };
  const openDraft = (marks: number | null, questionNumber: string) => {
    commit();
    current = { lines: [], marks: marks || 0, questionNumber };
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (BOILERPLATE.test(line) || SECTION_HEADER.test(line) || isDocumentHeading(line)) {
      commit();
      continue;
    }

    const spans = allMarkerSpans(line);
    if (spans.length === 0) {
      append(line);
      continue;
    }

    let cursor = 0;
    for (const span of spans) {
      const pre = line.slice(cursor, span.start).replace(/^[\s(]+/, '').trim();
      if (pre) append(pre);
      if (span.subpart) {
        if (openGroup) {
          const parentContext = current && !current.subpart && current.questionNumber === openGroup
            ? normalizeAcademicQuestion(current.lines.join(' ')) : '';
          if (parentContext) groupContexts.set(openGroup, parentContext);
          commit();
          current = {
            lines: [], marks: span.marks || 0, questionNumber: openGroup,
            subpart: span.label, context: groupContexts.get(openGroup),
          };
        }
      } else {
        openGroup = span.label;
        openDraft(span.marks, span.label);
      }
      cursor = span.end;
    }
    const post = line.slice(cursor).trim();
    if (post) append(post);
  }
  commit();

  const groupsWithSubParts = new Set(drafts.filter((draft) => draft.subpart).map((draft) => draft.questionNumber));
  const maxGroupMarks = drafts.reduce((map, draft) => {
    if (draft.questionNumber && draft.marks > (map.get(draft.questionNumber) || 0)) map.set(draft.questionNumber, draft.marks);
    return map;
  }, new Map<string, number>());

  return drafts
    .filter((draft) => !(!draft.subpart && draft.questionNumber && groupsWithSubParts.has(draft.questionNumber)))
    .filter((draft) => draft.lines.length > 0)
    .map((draft) => {
      const marks = draft.marks > 0 ? draft.marks : (draft.subpart && draft.questionNumber ? (maxGroupMarks.get(draft.questionNumber) || 10) : 10);
      // The "(N Marks)" annotation is boilerplate - marks are stored in their own column and
      // a leftover "Marks" token must never influence topic mapping.
      const text = normalizeAcademicQuestion(draft.lines.join(' ')).replace(/\s*[(\[]\s*\d+(?:\.\d+)?\s*(?:marks?|m)\s*[)\]]/gi, '').replace(/\s+/g, ' ').trim();
      const context = draft.context?.replace(/\s*[(\[]\s*\d+(?:\.\d+)?\s*(?:marks?|m)\s*[)\]]/gi, '').replace(/\s+/g, ' ').trim();
      return { text, marks, questionNumber: draft.questionNumber, subpart: draft.subpart, context };
    });
}

export function extractNumberedQuestions(content: string): string[] {
  const unique = new Map<string, QuestionRecord>();
  for (const section of extractNumberedQuestionRecords(content)) {
    if (!section.text) continue;
    const normalized = `${section.questionNumber || ''}:${section.subpart || ''}:${section.text}`.toLowerCase();
    if (!unique.has(normalized)) unique.set(normalized, section);
  }
  return [...unique.values()].map((section) => section.text);
}

const SENTENCE_END = /[.!?][)\s"]*$/;

// Rejects short/garbled question fragments before they enter the bank that feeds Practice and
// Mock exams. Phantom records from broken extractions are usually diagram labels, orphaned
// marks annotations, or single-character-heavy noise.
function isPersistableQuestion(record: { text: string }): boolean {
  const text = record.text.trim();
  if (!text) return false;
  // A record that begins with a marks annotation ("2 marks) Roll No: ...") is a fragment whose
  // real start was consumed by a stray number marker earlier in the broken extraction.
  if (/^(?:\d+\s*marks?|[(\[]\s*\d+\s*marks?[)\]])/i.test(text)) return false;
  if (/^[\d\s/\\+\-]+$/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  // Too-short fragments ("K traverse v-") without sentence punctuation are never questions.
  if (text.length < 28 && !SENTENCE_END.test(text)) return false;
  // Fragments dominated by single-character diagram tokens ("v", "w", "r") and lacking a
  // sentence terminator are unreadable noise ("Pick a random n x I vectorL (elements ...").
  const shortTokens = words.filter((word) => word.length <= 2).length;
  if (shortTokens / words.length > 0.5 && !SENTENCE_END.test(text)) return false;
  return true;
}

function questionSimilarity(left: string, right: string): number {
  const leftTokens = new Set(academicTokens(left));
  const rightTokens = new Set(academicTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

// Words that would match a junk topic token from a diagram/boilerplate extraction and should
// never be used as a single-token evidence of a real mapping.
const NON_TOPIC_QUESTION_TOKENS = new Set(['prove', 'yes', 'no', 'roll', 'offs', 'pm', 'mark', 'marks', 'aim', 'verify', 'show', 'state', 'find', 'list', 'write', 'solve', 'apply', 'draw', 'define', 'explain', 'describe', 'compare', 'discuss', 'derive', 'compute', 'calculate', 'determine', 'design', 'construct', 'suggest', 'identify', 'justify', 'prepare', 'perform', 'each', 'chapter', 'section', 'paper', 'question', 'questions', 'part', 'parts', 'note', 'notes', 'book', 'answer', 'answers', 'carries', 'bonus', 'extra']);

type ProvisionalTopicRule = { name: string; patterns: RegExp[] };

// PYQ-derived topics are stable academic concepts, not fragments copied from the question.
// They use normalized concept aliases, never capitalization or the first word of a question.
const PROVISIONAL_TOPIC_RULES: ProvisionalTopicRule[] = [
  { name: 'Software Process Models', patterns: [/\b(?:waterfall|spiral|incremental|agile|generic)\s+(?:software\s+)?process(?:\s+models?)?\b/i, /\bsoftware\s+process(?:\s+(?:model|stage|lifecycle|risk))?\b/i] },
  { name: 'Software Architecture', patterns: [/\bsoftware\s+architecture\b/i, /\barchitecture\s+(?:pattern|style|design)\b/i, /\b(?:client.server|layered|microservice|repository)\s+architecture\b/i, /\btransparent\s+replication\b/i, /\breplication\b/i] },
  { name: 'Non-Functional Requirements', patterns: [/\bnon.functional\s+requirements?\b/i, /\bquality\s+(?:attributes?|metrics?|requirements?)\b/i, /\b(?:performance|reliability|availability|maintainability|scalability|interoperability|security)\b/i] },
  { name: 'Software Requirements Specification', patterns: [/\b(?:software\s+)?requirements?\s+specification\b/i, /\bsrs\b/i, /\bfunctional\s+requirements?\b/i] },
  { name: 'Form-Based Requirements Specification', patterns: [/\bform.based\s+(?:requirements?|specification)\b/i, /\b(?:forms?|form\s+handling)\s+(?:to\s+)?(?:specify|capture|requirements?)\b/i] },
  { name: 'Distributed Systems', patterns: [/\bdistributed\s+(?:system|database|application|computing)\b/i, /\b(?:replication|fragmentation|distributed\s+transaction)\b/i] },
  { name: 'Database Systems', patterns: [/\b(?:normalization|relational\s+algebra|sql|database\s+schema|acid|transaction)\b/i] },
  { name: 'Operating Systems', patterns: [/\b(?:paging|page\s+fault|deadlock|process\s+schedul|virtual\s+memory)\b/i] },
  { name: 'Computer Networks', patterns: [/\b(?:tcp|udp|routing|network\s+protocol|congestion\s+control|osi\s+model)\b/i] },
  { name: 'Graph Algorithms', patterns: [/\b(?:dijkstra|bellman.ford|floyd.warshall|breadth.first|depth.first|\bbfs\b|\bdfs\b|minimum\s+spanning|\bmst\b|topological\s+sort)\b/i] },
  { name: 'Dynamic Programming', patterns: [/\b(?:dynamic\s+programming|memoization|tabulation|knapsack|longest\s+common\s+subsequence|matrix\s+chain)\b/i] },
  { name: 'Divide and Conquer', patterns: [/\b(?:divide\s+and\s+conquer|master\s+theorem|recurrence\s+(?:relation|tree)|recurrence)\b/i] },
  { name: 'Greedy Algorithms', patterns: [/\b(?:greedy|huffman|activity\s+selection|fractional\s+knapsack)\b/i] },
  { name: 'Sorting and Searching', patterns: [/\b(?:quicksort|mergesort|heapsort|binary\s+search|counting\s+sort|radix\s+sort)\b/i] },
  { name: 'Tree Data Structures', patterns: [/\b(?:binary\s+search\s+tree|\bbst\b|avl|red.black\s+tree|\bb.tree\b|trie)\b/i] },
  { name: 'Priority Queues', patterns: [/\bpriority\s+queues?\b/i, /\bheap\s+(?:priority\s+)?queues?\b/i] },
];

function classifyProvisionalTopic(questionText: string): { name: string; evidence: string[] } {
  const matches = PROVISIONAL_TOPIC_RULES.map((rule) => ({ rule, matches: rule.patterns.filter((pattern) => pattern.test(questionText)) }))
    .filter((candidate) => candidate.matches.length > 0);
  if (matches.length === 0) return { name: 'General Academic Concepts', evidence: ['provisional academic classification'] };
  matches.sort((left, right) => right.matches.length - left.matches.length || right.rule.name.length - left.rule.name.length);
  return { name: matches[0].rule.name, evidence: matches[0].matches.map((pattern) => 'provisional concept: ' + pattern.source) };
}

// Compatibility stub for old callers. New PYQ ingestion exclusively uses
// classifyProvisionalTopic, which is concept-based rather than capitalization-based.
function inferQuestionTopic(_questionText: string): string | null {
  return null;
  /*
  const isSentenceStartWord = (text: string, word: string): boolean => {
    const index = text.indexOf(word);
    if (index < 0) return false;
    const prefix = text.slice(0, index).trim();
    return prefix === '' || /[?.:!]\s*$/.test(prefix);
  };
  // 1) A multi-word capitalized phrase is the most reliable signal: "Master Theorem",
  //    "Binary Heap", "Dynamic Programming". It must not start with a verb/instruction word,
  //    must have at least one substantive word, and must not be a sentence-initial clause.
  const titlePhrases = questionText.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,3}\b/g) || [];
  const phrase = titlePhrases.find((candidate) => {
    const words = candidate.split(/\s+/);
    const firstWord = words[0];
    if (TOPIC_VERB_PREFIXES.has(firstWord) || TOPIC_STOPWORDS.has(firstWord)) return false;
    if (words.some((word) => /[.\\/]/.test(word))) return false;
    const hasSubstantive = words.some((word) => word.length >= 5);
    if (!hasSubstantive) return false;
    const index = questionText.indexOf(candidate);
    if (index === 0) return false; // "Binary Heap:" running-head style headers, skip
    return !isSentenceStartWord(questionText, candidate);
  });
  if (phrase) return phrase.trim();
  // 2) A single Title-case token as a fallback is only trustworthy when it genuinely reads as
  //    a noun (≥4 lowercase letters after the initial): it must occur mid-sentence (proper
  //    nouns like "Dijkstra", "Euclid"), not sentence-initial, and not be directly followed
  //    by an open parenthesis (a function call like "O(V + E)").
  const capitalized = (questionText.match(/\b[A-Z][a-z]{3,}\b/g) || []).filter((word) => {
    if (TOPIC_VERB_PREFIXES.has(word) || TOPIC_STOPWORDS.has(word)) return false;
    if (isSentenceStartWord(questionText, word)) return false;
    const after = questionText.slice(questionText.indexOf(word) + word.length).trim();
    if (after.startsWith('(') || after.startsWith('-')) return false;
    return !GENERIC_TOPIC_TOKENS.has(word.toLowerCase());
  });
  const single = capitalized.find((word) => !NON_TOPIC_QUESTION_TOKENS.has(word.toLowerCase()));
  if (single) return single;
  // 3) A standalone all-caps acronym ("BFS", "DFS", "MST") is a real topic when it reads as a
  //    term: it must be its own token (never "RE" inside "REcTARRY"), must not be boilerplate,
  //    and should group with a following substantive word ("BFS traversal", "MST on the graph").
  //    Diagram noise like "YES YES..." or "6 PM;" fails the lowercase-follow check.
  const acronym = (questionText.match(/(?<![A-Za-z0-9])[A-Z]{3,4}(?![A-Za-z0-9])/g) || [])
    .find((word) => {
      const lower = word.toLowerCase();
      if (NON_TOPIC_QUESTION_TOKENS.has(lower) || GENERIC_TOPIC_TOKENS.has(lower)) return false;
      if (new Set(['yes', 'no', 'pm', 'off', 'ok', 'gt', 'us', 'tv', 'tt', 'ss']).has(lower)) return false;
      const after = questionText.slice(questionText.indexOf(word) + word.length).trim();
      if (after === '') return false;
      if (after.startsWith('(') || after.startsWith(')') || /^[A-Z0-9]/.test(after)) return false;
      return true;
    });
  return acronym ?? null;
  */
}

export function extractSyllabusTopics(content: string): Array<{ name: string; weightage?: number }> {
  const topics = new Map<string, { name: string; weightage?: number }>();
  const lines = content.replace(/\r/g, '').replace(/\f/g, '\n')
    // A number of PDF text layers flatten a whole syllabus page onto one line. Restore unit
    // boundaries before parsing so a valid syllabus still produces persisted topic names.
    .replace(/\b(?:unit|module|topic|chapter)\s*(?:\d+|[ivxlcdm]+)\s*[:.)\-]/gi, (header) => `\n${header}`)
    .split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const body = line.replace(/^\s*(?:unit|module|topic|chapter)\s*(?:\d+|[ivxlcdm]+)?\s*[:.)\-]?\s*/i, '').trim();
    if (!body) continue;
    const weightageMatch = /(\d+(?:\.\d+)?)\s*%/.exec(body);
    const withoutWeightage = body.replace(/\(?\d+(?:\.\d+)?\s*%\)?/g, '').trim();
    const candidates = withoutWeightage.includes(':') ? withoutWeightage.split(':').slice(1) : [withoutWeightage];
    for (const candidate of candidates.flatMap((item) => item.split(/[;,\u2022|]/))) {
      const name = stripMarkdownNoise(candidate).replace(/^[-\s]+/, '').trim();
      if (name.length < 3 || name.length > 80 || /^(course|syllabus|unit|module)$/i.test(name)) continue;
      topics.set(name.toLowerCase(), { name, weightage: weightageMatch ? Number(weightageMatch[1]) : undefined });
    }
  }
  return [...topics.values()];
}

interface ConceptAliasRule {
  domain: string;
  topicMatches: (topicName: string, topicTokens: string[]) => boolean;
  aliases: Array<{
    label: string;
    pattern: RegExp;
  }>;
}

const CONCEPT_RULES: ConceptAliasRule[] = [
  {
    domain: 'Graph Algorithms',
    topicMatches: (name, tokens) =>
      /\bgraphs?(?:\s+algorithms?|\s+theory)?\b/i.test(name) || tokens.includes('graph'),
    aliases: [
      { label: 'Dijkstra', pattern: /\bdijkstra(?:'s)?\b/i },
      { label: 'shortest path', pattern: /\bshortest\s+paths?\b/i },
      { label: 'BFS', pattern: /\bbfs\b|\bbreadth[\s-]first(?:\s+search)?\b/i },
      { label: 'DFS', pattern: /\bdfs\b|\bdepth[\s-]first(?:\s+search)?\b/i },
      { label: 'MST', pattern: /\bmst\b|\bminimum\s+spanning\s+trees?\b/i },
      { label: 'Prim', pattern: /\bprim(?:'s)?\b/i },
      { label: 'Kruskal', pattern: /\bkruskal(?:'s)?\b/i },
      { label: 'Bellman-Ford', pattern: /\bbellman[\s-]ford\b/i },
      { label: 'Floyd-Warshall', pattern: /\bfloyd[\s-]warshall\b/i },
      { label: 'topological sort', pattern: /\btopological\s+sort(?:ing)?\b/i },
      { label: 'spanning tree', pattern: /\bspanning\s+trees?\b/i },
      { label: 'bipartite', pattern: /\bbipartite(?:\s+graphs?)?\b/i },
    ],
  },
  {
    domain: 'Dynamic Programming',
    topicMatches: (name, tokens) =>
      /\bdynamic\s+programming\b/i.test(name) || /\bdp\b/i.test(name) || (tokens.includes('dynamic') && tokens.includes('programming')),
    aliases: [
      { label: 'Knapsack', pattern: /\bknapsack\b/i },
      { label: 'memoization', pattern: /\bmemoi[sz](?:ation|ed|ing|e)?\b/i },
      { label: 'tabulation', pattern: /\btabulation\b/i },
      { label: 'optimal substructure', pattern: /\boptimal\s+substructures?\b/i },
      { label: 'overlapping subproblems', pattern: /\boverlapping\s+subproblems?\b/i },
      { label: 'Dynamic Programming', pattern: /\bdynamic\s+programming\b/i },
      { label: 'longest common subsequence', pattern: /\blongest\s+common\s+subsequences?\b|\blcs\b/i },
      { label: 'matrix chain multiplication', pattern: /\bmatrix\s+chain(?:\s+multiplication)?\b/i },
    ],
  },
  {
    domain: 'Divide and Conquer',
    topicMatches: (name, tokens) =>
      /\bdivide\s+(?:and|&)\s+conquer\b/i.test(name) || (tokens.includes('divide') && tokens.includes('conquer')),
    aliases: [
      { label: 'Master Theorem', pattern: /\bmaster\s+theorems?\b/i },
      { label: 'recurrence', pattern: /\brecurrence(?:s)?\b/i },
      { label: 'recurrence relation', pattern: /\brecurrence\s+relations?\b/i },
      { label: 'divide and conquer', pattern: /\bdivide\s+(?:and|&)\s+conquer\b/i },
      { label: 'master method', pattern: /\bmaster\s+methods?\b/i },
    ],
  },
  {
    domain: 'Recurrence Relations',
    topicMatches: (name, tokens) =>
      /\brecurrence(?:s|\s+relations?)?\b/i.test(name) || tokens.includes('recurrence') || tokens.includes('recurrences'),
    aliases: [
      { label: 'Master Theorem', pattern: /\bmaster\s+theorems?\b/i },
      { label: 'recurrence', pattern: /\brecurrence(?:s)?\b/i },
      { label: 'recurrence relation', pattern: /\brecurrence\s+relations?\b/i },
      { label: 'master method', pattern: /\bmaster\s+methods?\b/i },
      { label: 'recursion tree', pattern: /\brecursion\s+trees?\b/i },
    ],
  },
  {
    domain: 'Greedy Algorithms',
    topicMatches: (name, tokens) =>
      /\bgreedy\b/i.test(name) || tokens.includes('greedy'),
    aliases: [
      { label: 'Huffman coding', pattern: /\bhuffman(?:\s+coding|\s+code)?\b/i },
      { label: 'activity selection', pattern: /\bactivity\s+selection\b/i },
      { label: 'fractional knapsack', pattern: /\bfractional\s+knapsack\b/i },
      { label: 'greedy choice', pattern: /\bgreedy\s+choice\b/i },
    ],
  },
  {
    domain: 'Sorting and Searching',
    topicMatches: (name, tokens) =>
      /\b(?:sorting|searching)\b/i.test(name) || tokens.includes('sorting') || tokens.includes('searching'),
    aliases: [
      { label: 'quicksort', pattern: /\bquicksort\b/i },
      { label: 'mergesort', pattern: /\bmergesort\b/i },
      { label: 'heapsort', pattern: /\bheapsort\b/i },
      { label: 'radix sort', pattern: /\bradix\s+sort\b/i },
      { label: 'counting sort', pattern: /\bcounting\s+sort\b/i },
      { label: 'binary search', pattern: /\bbinary\s+search\b/i },
    ],
  },
  {
    domain: 'Trees and Search Trees',
    topicMatches: (name, tokens) =>
      /\b(?:trees?|binary\s+search\s+trees?)\b/i.test(name) || tokens.includes('tree'),
    aliases: [
      { label: 'AVL tree', pattern: /\bavl(?:\s+trees?)?\b/i },
      { label: 'red-black tree', pattern: /\bred[\s-]black(?:\s+trees?)?\b/i },
      { label: 'binary search tree', pattern: /\bbinary\s+search\s+trees?\b/i },
      { label: 'BST', pattern: /\bbst\b/i },
      { label: 'B-tree', pattern: /\bb[\s-]trees?\b/i },
      { label: 'trie', pattern: /\btrie\b/i },
    ],
  },
];

function mapQuestionToTopic(questionText: string, topics: TopicRow[]) {
  const questionTokens = new Set(academicTokens(questionText));
  let best: { topic: TopicRow; score: number; evidence: string[] } | null = null;
  for (const topic of topics) {
    const topicTokens = [...new Set(academicTokens(topic.name))];
    const distinctiveCount = topicTokens.filter((token) => !GENERIC_TOPIC_TOKENS.has(token)).length;
    const matches = [...new Set(topicTokens.filter((token) => questionTokens.has(token)))];

    // Check token overlap validity against stop/junk token guards:
    const matchedDistinctive = matches.filter((token) => !GENERIC_TOPIC_TOKENS.has(token)).length;
    const tokenOverlapValid = matches.length > 0 && matchedDistinctive > 0 &&
      !(matchedDistinctive === 1 && distinctiveCount >= 3 && COMMON_ACADEMIC_TOKENS.has(matches[0])) &&
      !(matchedDistinctive === 1 && matches.length === 1 && NON_TOPIC_QUESTION_TOKENS.has(matches[0]));

    const tokenScore = tokenOverlapValid ? (matchedDistinctive / Math.max(1, topicTokens.length)) : 0;

    // Check deterministic concept alias rules:
    const matchedAliases: string[] = [];
    for (const rule of CONCEPT_RULES) {
      if (rule.topicMatches(topic.name, topicTokens)) {
        for (const alias of rule.aliases) {
          if (alias.pattern.test(questionText)) {
            matchedAliases.push(alias.label);
          }
        }
      }
    }
    const uniqueAliases = [...new Set(matchedAliases)];

    // If neither valid token overlap nor concept alias matched, this topic does not match
    if (!tokenOverlapValid && uniqueAliases.length === 0) continue;

    // Combine alias evidence with token-overlap score rather than replacing it
    const aliasScore = uniqueAliases.length > 0 ? (0.75 + 0.15 * Math.min(uniqueAliases.length - 1, 3)) : 0;
    const score = Number((tokenScore + aliasScore).toFixed(3));

    const evidence: string[] = [
      ...(tokenOverlapValid ? matches.map((token) => `matched keyword: ${token}`) : []),
      ...uniqueAliases.map((alias) => `concept alias: ${alias}`),
    ];

    if (!best || score > best.score || (score === best.score && evidence.length > best.evidence.length)) {
      best = { topic, score, evidence };
    }
  }
  return best ?? null;
}

export type AcademicQuestionRow = QuestionRow;
export type RankedTopicRow = TopicRow & {
  priorityScore: number;
  mappedQuestionCount: number;
  totalMarks: number;
  calculatedWeightage: number;
  syllabusEvidence: boolean;
  sourceDocumentIds: string[];
  weightageAvailable: boolean;
  reason: string;
};

export function rankedTopicRows(userId: string, documentId?: string): RankedTopicRow[] {
  const questionsForEvidence = questionRows(userId, documentId);
  const mappedTopicIds = new Set(questionsForEvidence.flatMap((question) => question.topicId ? [question.topicId] : []));
  const allTopics = topicRows(userId);
  const hasSyllabusTopics = allTopics.some((topic) => topic.source === 'syllabus');
  const topics = allTopics.filter((topic) =>
    (!documentId || topic.source === 'syllabus' || mappedTopicIds.has(topic.id)) &&
    // Once a syllabus is present, a provisional topic remains visible only while it has PYQ
    // evidence that could not yet be aligned to any authoritative syllabus topic.
    (!hasSyllabusTopics || topic.source !== 'paper-derived/provisional' || mappedTopicIds.has(topic.id)),
  );
  const sourceDocumentIds = new Map<string, string[]>();
  for (const row of getDb().prepare(`SELECT topic_id AS topicId, document_id AS documentId
    FROM topic_document_sources WHERE user_id = ?`).all(userId) as any[]) {
    sourceDocumentIds.set(row.topicId, [...(sourceDocumentIds.get(row.topicId) || []), row.documentId]);
  }
  const mappedCounts = new Map<string, number>();
  const mappedMarks = new Map<string, number>();
  let totalMappedMarks = 0;
  for (const question of questionsForEvidence) {
    if (question.topicId) {
      mappedCounts.set(question.topicId, (mappedCounts.get(question.topicId) || 0) + 1);
      mappedMarks.set(question.topicId, (mappedMarks.get(question.topicId) || 0) + question.marks);
      totalMappedMarks += question.marks;
    }
  }
  const ranking = topics.map((topic) => {
    const mappedQuestionCount = mappedCounts.get(topic.id) || 0;
    const totalMarks = mappedMarks.get(topic.id) || 0;
    const calculatedWeightage = totalMappedMarks > 0 ? Number(((totalMarks / totalMappedMarks) * 100).toFixed(1)) : 0;
    const topicSourceDocumentIds = sourceDocumentIds.get(topic.id) || [];
    const syllabusEvidence = topicSourceDocumentIds.length > 0 || topic.source === 'syllabus';
    const storedWeightageBonus = topic.weightage >= 20 ? Math.min(2, Math.round(topic.weightage / 25)) : 0;
    const priorityScore = Math.min(10, Math.max(1, Math.round(1 + mappedQuestionCount * 1.5 + calculatedWeightage / 20 + (syllabusEvidence ? 1 : 0) + storedWeightageBonus)));
    const reason = mappedQuestionCount > 0
      ? `${priorityScore >= 7 ? 'High' : 'Medium'} priority: appears in ${mappedQuestionCount} mapped previous question${mappedQuestionCount === 1 ? '' : 's'}, carrying ${totalMarks} marks (${calculatedWeightage}% of mapped-paper marks)${syllabusEvidence ? ', and is present in the syllabus' : ''}.`
      : syllabusEvidence
        ? 'Lower priority: present in the syllabus but no previous questions were mapped.'
        : 'Lower priority: no mapped previous-question evidence yet.';
    return { ...topic, priority: priorityScore, priorityScore, mappedQuestionCount, totalMarks, calculatedWeightage, syllabusEvidence, sourceDocumentIds: topicSourceDocumentIds, weightageAvailable: topic.hasWeightage, reason };
  });
  const updatePriority = getDb().prepare('UPDATE topics SET priority = ? WHERE user_id = ? AND id = ?');
  const apply = getDb().transaction((items: RankedTopicRow[]) => items.forEach((topic) => updatePriority.run(topic.priorityScore, userId, topic.id)));
  apply(ranking);
  return ranking.sort((left, right) => right.priorityScore - left.priorityScore || right.mappedQuestionCount - left.mappedQuestionCount || left.name.localeCompare(right.name));
}

function questionClassificationText(question: Pick<QuestionRecord, 'text' | 'context'>): string {
  return [question.context, question.text].filter(Boolean).join(' ');
}

function findOrCreateProvisionalTopic(userId: string, classification: { name: string; evidence: string[] }): TopicRow {
  const existing = topicRows(userId).find((topic) =>
    topic.source === 'paper-derived/provisional' &&
    classifyProvisionalTopic(topic.name).name === classification.name,
  );
  if (existing) return existing;
  saveTopics(userId, [{
    name: classification.name,
    priority: 1,
    weightage: 10,
    hasWeightage: false,
    source: 'paper-derived/provisional',
  }]);
  return findOwnedTopicByName(userId, classification.name)!;
}

export function ingestAcademicDocument(userId: string, input: { title: string; docType: string; content: string; fileSize?: string; fileData?: Uint8Array; mimeType?: string; extractionMethod?: string; topicMappings?: Array<{ questionText: string; topicName: string; confidence: number }>; questionRecords?: QuestionRecord[] }) {
  const existingDocument = getDb().prepare(`SELECT id, title, doc_type AS docType, content, file_size AS fileSize, created_at AS createdAt
    FROM documents WHERE user_id = ? AND title = ? AND content = ?`).get(userId, input.title.trim(), input.content) as DocumentRow | undefined;
  const document = existingDocument || createDocument(userId, input);
  const syllabusTopics = input.docType.toLowerCase() === 'syllabus' ? extractSyllabusTopics(input.content) : [];
  if (syllabusTopics.length > 0) {
    saveTopics(userId, syllabusTopics.map((topic) => ({
      name: topic.name,
      priority: 1,
      weightage: topic.weightage,
      hasWeightage: topic.weightage !== undefined,
      source: 'syllabus',
    })));
    const associateTopic = getDb().prepare(`INSERT INTO topic_document_sources (user_id, topic_id, document_id, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id, topic_id, document_id) DO NOTHING`);
    const associateAll = getDb().transaction((items: Array<{ name: string }>) => {
      for (const topic of items) {
        const stored = findOwnedTopicByName(userId, topic.name);
        if (stored) associateTopic.run(userId, stored.id, document.id, now());
      }
    });
    associateAll(syllabusTopics);
  }
  const persistedSyllabusTopics = topicRows(userId).filter((topic) => topic.source === 'syllabus');
  if (syllabusTopics.length > 0) {
    remapUnmatchedQuestions(userId, persistedSyllabusTopics);
    reconcileProvisionalMappings(userId, persistedSyllabusTopics);
  }
  // PYQs may only map to syllabus topics that were already persisted. Gemini can improve this
  // mapping, but can neither create a topic nor make extraction depend on its availability.
  const paperMappings = (input.topicMappings || [])
    .filter((mapping) => mapping.topicName.trim() && mapping.confidence >= 0.6)
    .map((mapping) => ({ ...mapping, topicName: resolveSyllabusTopicName(mapping.topicName, persistedSyllabusTopics) }))
    .filter((mapping): mapping is { questionText: string; topicName: string; confidence: number } => Boolean(mapping.topicName));
  const extractedQuestions = (input.docType.toLowerCase().includes('past')
    ? input.questionRecords || extractNumberedQuestionRecords(input.content) : [])
    .map((question) => ({
      ...question,
      text: normalizeAcademicQuestion(question.text),
      context: question.context ? normalizeAcademicQuestion(question.context) : undefined,
    }))
    .filter(isPersistableQuestion);
  const existing = (getDb().prepare('SELECT normalized_text AS normalizedText FROM questions WHERE user_id = ? AND document_id = ?').all(userId, document.id) as any[]).map((row) => row.normalizedText);
  const insert = getDb().prepare(`INSERT INTO questions
    (id, user_id, document_id, topic_id, question_text, normalized_text, question_number, subpart, context_text, marks, question_type, source, suggested_time_minutes, mapping_score, mapping_evidence, mapping_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, document_id, normalized_text) WHERE document_id IS NOT NULL DO NOTHING`);
  const createdQuestionIds: string[] = [];
  // Decide each question's mapping up front so sibling sub-parts that match nothing can
  // inherit the topic of a mapped sub-part in the same question group.
  const mappingDecisions = extractedQuestions.map((question) => {
    const normalizedForMapping = normalizeAcademicQuestion(question.text).toLowerCase();
    const hinted = paperMappings.find((candidate) => {
      const candidateText = normalizeAcademicQuestion(candidate.questionText).toLowerCase();
      return candidateText === normalizedForMapping || candidateText.includes(normalizedForMapping) || normalizedForMapping.includes(candidateText);
    });
    if (hinted) {
      const hintedTopic = findOwnedTopicByName(userId, hinted.topicName);
      if (hintedTopic) return { topic: hintedTopic, score: hinted.confidence, evidence: ['AI topic classification from uploaded paper'] };
    }
    const classificationText = questionClassificationText(question);
    if (persistedSyllabusTopics.length > 0) return mapQuestionToTopic(classificationText, persistedSyllabusTopics);
    const provisional = classifyProvisionalTopic(classificationText);
    return {
      topic: findOrCreateProvisionalTopic(userId, provisional),
      score: 0.8,
      evidence: provisional.evidence,
    };
  });
  applyQuestionGroupInheritance(extractedQuestions, mappingDecisions);
  const saveQuestions = getDb().transaction((items: Array<QuestionRecord>) => {
    items.forEach((item, index) => {
      const questionText = item.text;
      const normalizedText = `${item.questionNumber || ''}:${item.subpart || ''}:${questionText}`.toLowerCase();
      // Numbered questions are distinct exam items even when a paper repeats the same wording.
      // Similarity de-duplication is reserved for malformed records with no recoverable label.
      if (existing.some((stored) => stored === normalizedText || (!item.questionNumber && questionSimilarity(stored, normalizedText) >= 0.88))) return;
      const mapping = mappingDecisions[index];
      const id = createId('question');
      const marks = item.marks;
      insert.run(id, userId, document.id, mapping?.topic.id || null, questionText, normalizedText, item.questionNumber || null, item.subpart || null, item.context || null, marks, 'Subjective', 'pyq', Math.max(5, marks * 2),
        mapping?.score || null, JSON.stringify(mapping?.evidence || []), mapping ? 'mapped' : 'unmatched', now());
      createdQuestionIds.push(id);
      existing.push(normalizedText);
    });
  });
  saveQuestions(extractedQuestions);
  const ranking = rankedTopicRows(userId);
  const questions = questionRows(userId).filter((question) => createdQuestionIds.includes(question.id));
  return {
    document,
    extractedTopicCount: syllabusTopics.length,
    extractedQuestionCount: extractedQuestions.length,
    createdQuestionCount: createdQuestionIds.length,
    questions,
    ranking,
  };
}

// Maps an AI-classified topic name to an exact syllabus topic name, or to the closest one via
// the same strict matcher used for questions. Returns null when it cannot be trusted.
function resolveSyllabusTopicName(topicName: string, syllabusTopics: TopicRow[]): string | null {
  const exact = syllabusTopics.find((topic) => topic.name.trim().toLowerCase() === topicName.trim().toLowerCase());
  if (exact) return exact.name;
  const mapped = mapQuestionToTopic(topicName, syllabusTopics);
  return mapped?.topic.name ?? null;
}

function applyQuestionGroupInheritance(records: QuestionRecord[], decisions: Array<{ topic: TopicRow; score: number; evidence: string[] } | null>): void {
  const groupBest = new Map<string, number>();
  records.forEach((record, index) => {
    if (!record.questionNumber || !decisions[index]) return;
    const bestIndex = groupBest.get(record.questionNumber);
    if (bestIndex === undefined || (decisions[index]!.score ?? 0) > (decisions[bestIndex]!.score ?? 0)) {
      groupBest.set(record.questionNumber, index);
    }
  });
  records.forEach((record, index) => {
    if (!record.questionNumber || !record.subpart || decisions[index]) return;
    const bestIndex = groupBest.get(record.questionNumber);
    if (bestIndex !== undefined && decisions[bestIndex]) {
      decisions[index] = {
        topic: decisions[bestIndex]!.topic,
        score: decisions[bestIndex]!.score,
        evidence: [`Inherited from sibling sub-part in question ${record.questionNumber}`],
      };
    }
  });
}

function remapUnmatchedQuestions(userId: string, topics: TopicRow[]) {
  const unmatched = getDb().prepare(`SELECT id, question_text AS questionText FROM questions
    WHERE user_id = ? AND topic_id IS NULL`).all(userId) as Array<{ id: string; questionText: string }>;
  const update = getDb().prepare(`UPDATE questions SET topic_id = ?, mapping_score = ?, mapping_evidence = ?, mapping_status = 'mapped'
    WHERE user_id = ? AND id = ? AND topic_id IS NULL`);
  const apply = getDb().transaction((questions: typeof unmatched) => {
    for (const question of questions) {
      const mapping = mapQuestionToTopic(question.questionText, topics);
      if (mapping) update.run(mapping.topic.id, mapping.score, JSON.stringify(mapping.evidence), userId, question.id);
    }
  });
  apply(unmatched);
}

// Syllabus topics are authoritative. Once they arrive, replace a provisional mapping whenever
// the stored question/context can be matched to a syllabus concept. Unrelated provisional
// evidence is retained rather than discarded, so a partial syllabus does not erase PYQ trends.
function reconcileProvisionalMappings(userId: string, topics: TopicRow[]) {
  const provisionalQuestions = getDb().prepare(
    'SELECT q.id, q.question_text AS questionText, q.context_text AS context, t.name AS provisionalTopicName ' +
    'FROM questions q JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id ' +
    "WHERE q.user_id = ? AND t.source = 'paper-derived/provisional'",
  ).all(userId) as Array<{ id: string; questionText: string; context: string | null; provisionalTopicName: string }>;
  const update = getDb().prepare("UPDATE questions SET topic_id = ?, mapping_score = ?, mapping_evidence = ?, mapping_status = 'mapped' WHERE user_id = ? AND id = ?");
  const apply = getDb().transaction((questions: typeof provisionalQuestions) => {
    for (const question of questions) {
      const mapping = mapQuestionToTopic(
        [question.context, question.questionText, question.provisionalTopicName].filter(Boolean).join(' '),
        topics,
      );
      if (mapping) {
        update.run(mapping.topic.id, mapping.score, JSON.stringify([
          'Reconciled from provisional PYQ topic',
          ...mapping.evidence,
        ]), userId, question.id);
      }
    }
  });
  apply(provisionalQuestions);
}

// Older uploads predate the question sanitizer. Run this idempotent repair when the service
// starts so existing UI data does not continue to expose HTML/entities after the ingest fix.
export function sanitizePersistedAcademicQuestions() {
  const rows = getDb().prepare(
    'SELECT id, user_id AS userId, question_text AS questionText, context_text AS context, ' +
    'question_number AS questionNumber, subpart, normalized_text AS normalizedText FROM questions',
  ).all() as Array<{
    id: string; userId: string; questionText: string; context: string | null;
    questionNumber: string | null; subpart: string | null; normalizedText: string;
  }>;
  const update = getDb().prepare('UPDATE questions SET question_text = ?, context_text = ?, normalized_text = ? WHERE id = ? AND user_id = ?');
  const apply = getDb().transaction((items: typeof rows) => {
    for (const row of items) {
      const questionText = normalizeAcademicQuestion(row.questionText);
      const context = row.context ? normalizeAcademicQuestion(row.context) : null;
      const normalizedText = ((row.questionNumber || '') + ':' + (row.subpart || '') + ':' + questionText).toLowerCase();
      if (questionText !== row.questionText || context !== row.context || normalizedText !== row.normalizedText) {
        update.run(questionText, context, normalizedText, row.id, row.userId);
      }
    }
  });
  apply(rows);
}

export function academicEvidence(userId: string, documentId?: string) {
  const documents = documentRows(userId);
  const selectedDocumentId = documentId || documents.find((document) => document.docType.toLowerCase().includes('past'))?.id;
  const questions = questionRows(userId, selectedDocumentId);
  return {
    documents,
    activeDocumentId: selectedDocumentId || null,
    questions,
    ranking: rankedTopicRows(userId, selectedDocumentId),
  };
}

export function questionRows(userId: string, documentId?: string): QuestionRow[] {
  return getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.document_id AS documentId, q.question_text AS questionText,
      q.question_number AS questionNumber, q.subpart, q.context_text AS context, q.marks,
      q.question_type AS questionType, q.source, q.suggested_time_minutes AS suggestedTimeMinutes,
      q.mapping_score AS mappingScore, q.mapping_evidence AS mappingEvidence, q.mapping_status AS mappingStatus,
      q.created_at AS createdAt, t.name AS topicName
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
    WHERE q.user_id = ? ${documentId ? 'AND q.document_id = ?' : ''}
    ORDER BY q.created_at DESC
  `).all(userId, ...(documentId ? [documentId] : [])).map((row: any) => ({ ...row, mappingEvidence: parseJsonList(row.mappingEvidence), mappingStatus: row.mappingStatus || (row.topicId ? 'mapped' : 'unmatched') })) as QuestionRow[];
}

export function findOwnedQuestion(userId: string, questionId: string): QuestionRow | undefined {
  const row = getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.document_id AS documentId, q.question_text AS questionText,
      q.question_number AS questionNumber, q.subpart, q.context_text AS context, q.marks,
      q.question_type AS questionType, q.source, q.suggested_time_minutes AS suggestedTimeMinutes,
      q.mapping_score AS mappingScore, q.mapping_evidence AS mappingEvidence, q.mapping_status AS mappingStatus,
      q.created_at AS createdAt, t.name AS topicName
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
    WHERE q.id = ? AND q.user_id = ?
  `).get(questionId, userId) as QuestionRow | undefined;
  return row ? { ...row, mappingEvidence: parseJsonList(row.mappingEvidence), mappingStatus: row.mappingStatus || (row.topicId ? 'mapped' : 'unmatched') } : undefined;
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
    if (item.documentId && (typeof item.documentId !== 'string' || !findOwnedDocument(userId, item.documentId))) {
      throw new HttpError(404, 'The selected document does not exist.');
    }
  }
  for (const item of items) {
    const id = createId('question');
    const topicId = resolveQuestionTopic(userId, item);
    const questionText = normalizeAcademicQuestion(item.questionText);
    getDb().prepare(`INSERT INTO questions
      (id, user_id, document_id, topic_id, question_text, normalized_text, marks, question_type, source, suggested_time_minutes, mapping_score, mapping_evidence, mapping_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, item.documentId || null, topicId, questionText, questionText.toLowerCase(),
        Math.max(1, Number(item.marks) || 10),
        String(item.questionType || 'Subjective'),
        String(item.source || 'extracted'),
        Math.max(1, Number(item.suggestedTimeMinutes) || 15), null, '[]', topicId ? 'mapped' : 'unmatched', now());
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

function toStringValue(value: any, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toStringList(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toStringValue(item, '').trim()).filter((item) => item.length > 0);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trimEnd() + '...';
}

function clampScore(value: number, maxMarks: number): number {
  return Math.min(maxMarks, Math.max(0, Math.round(Number(value) || 0)));
}

export interface PracticeEvaluationResult {
  score: number;
  maxMarks: number;
  strengths: string[];
  improvements: string[];
  feedbackText: string;
  modelAnswerSnippet: string;
}

export function normalizePracticeEvaluation(raw: any, maxMarks: number): PracticeEvaluationResult {
  const marks = Math.max(1, Math.min(100, Math.round(Number(maxMarks) || 0)));
  return {
    score: clampScore(raw?.score, marks),
    maxMarks: marks,
    strengths: toStringList(raw?.strengths).slice(0, 6),
    improvements: toStringList(raw?.improvements).slice(0, 6),
    feedbackText: truncateText(toStringValue(raw?.feedbackText), 4000),
    modelAnswerSnippet: truncateText(toStringValue(raw?.modelAnswerSnippet), 4000),
  };
}

export function savePracticeEvaluation(userId: string, input: any): FeedbackRow {
  const id = createId('feedback');
  const strengths = JSON.stringify(Array.isArray(input.strengths) ? input.strengths.map(String) : []);
  const improvements = JSON.stringify(Array.isArray(input.improvements) ? input.improvements.map(String) : []);
  getDb().prepare(`INSERT INTO feedback
    (id, user_id, question_id, session_id, score, max_marks, source, strengths, improvements,
     feedback_text, model_answer_snippet, focus, difficulty, perceived_progress, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, null, null, Number(input.score), Number(input.maxMarks),
      'gemini', strengths, improvements,
      input.feedbackText || null, input.modelAnswerSnippet || null,
      null, null, null, input.notes || null, now());
  return findOwnedFeedback(userId, id)!;
}

export interface MockExamReportQuestion {
  position: number;
  questionText: string;
  topicName: string;
  answer: string;
  score: number;
  maxMarks: number;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

export interface MockExamTopicScore {
  topic: string;
  score: number;
  maxMarks: number;
  mastery: string;
}

export interface MockExamReport {
  perQuestion: MockExamReportQuestion[];
  topicBreakdown: MockExamTopicScore[];
  answeredCount: number;
  totalScore: number;
  totalMax: number;
  percentage: number;
  grade: string;
  advice: string;
}

export function normalizeMockExamReport(raw: any, questions: any[]): MockExamReport {
  const rawPerQuestion = Array.isArray(raw?.perQuestion) ? raw.perQuestion : [];
  const perQuestion: MockExamReportQuestion[] = questions.map((question: any, index: number) => {
    const position = index + 1;
    const maxMarks = Math.max(1, Math.round(Number(question.marks) || 1));
    const answer = toStringValue(question.answer).trim();
    const item =
      rawPerQuestion.find((candidate: any) => Number(candidate?.index) === position) ||
      rawPerQuestion.find((candidate: any) => Number(candidate?.index) === index);
    return {
      position,
      questionText: toStringValue(question.questionText),
      topicName: toStringValue(question.topicName, 'General'),
      answer,
      score: answer === '' ? 0 : clampScore(item?.score, maxMarks),
      maxMarks,
      strengths: toStringList(item?.strengths).slice(0, 6),
      improvements: toStringList(item?.improvements).slice(0, 6),
      feedback: truncateText(toStringValue(item?.feedback), 2000),
    };
  });
  const answeredCount = perQuestion.filter((q) => q.answer.length > 0).length;
  const totalScore = perQuestion.reduce((sum, q) => sum + q.score, 0);
  const totalMax = perQuestion.reduce((sum, q) => sum + q.maxMarks, 0);
  const percentage = totalMax > 0 ? Math.round((100 * totalScore) / totalMax) : 0;
  const grade = percentage >= 85 ? 'A' : percentage >= 70 ? 'B' : percentage >= 50 ? 'C' : 'D';
  const advice = truncateText(toStringValue(raw?.overall?.advice || raw?.advice), 3000);
  const topicMap = new Map<string, { score: number; maxMarks: number }>();
  for (const question of perQuestion) {
    const topic = question.topicName || 'General';
    const current = topicMap.get(topic) || { score: 0, maxMarks: 0 };
    current.score += question.score;
    current.maxMarks += question.maxMarks;
    topicMap.set(topic, current);
  }
  const rawBreakdown = Array.isArray(raw?.topicBreakdown) ? raw.topicBreakdown : [];
  const topicBreakdown: MockExamTopicScore[] = [...topicMap.entries()].map(([topic, totals]) => {
    const mastery = percentageFor(totals.score, totals.maxMarks);
    const supplied = rawBreakdown.find((entry: any) => toStringValue(entry?.topic) === topic);
    const label =
      mastery >= 85 ? 'Strong' : mastery >= 50 ? 'Developing' : 'Needs Work';
    return {
      topic,
      score: totals.score,
      maxMarks: totals.maxMarks,
      mastery: toStringValue(supplied?.mastery, label).slice(0, 80),
    };
  });
  return {
    perQuestion,
    topicBreakdown,
    answeredCount,
    totalScore,
    totalMax,
    percentage,
    grade,
    advice,
  };
}

function percentageFor(score: number, maxMarks: number): number {
  return maxMarks > 0 ? Math.round((100 * score) / maxMarks) : 0;
}

export function createMockExam(userId: string, input: any): any {
  const examId = createId('mock-exam');
  const createdAt = now();
  const report = input.report;
  getDb().prepare(`INSERT INTO mock_exams
    (id, user_id, exam_name, started_at, ended_at, duration_seconds,
     total_score, total_max, percentage, grade, ai_advice, question_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(examId, userId, toStringValue(input.examName, 'Timed Mock Exam'),
      input.startedAt || createdAt, input.endedAt || createdAt, Math.max(1, Math.round(Number(input.durationSeconds) || 1)),
      report.totalScore, report.totalMax, report.percentage, report.grade,
      report.advice || null, report.perQuestion.length, createdAt);
  for (const question of report.perQuestion) {
    getDb().prepare(`INSERT INTO mock_exam_questions
      (id, mock_exam_id, user_id, position, question_text, topic_name, answer,
       score, max_marks, strengths, improvements, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(createId('mock-question'), examId, userId, question.position,
        question.questionText, question.topicName, question.answer || null,
        question.score, question.maxMarks,
        JSON.stringify(question.strengths || []), JSON.stringify(question.improvements || []),
        question.feedback || null, createdAt);
  }
  return getMockExam(userId, examId);
}

export function mockExamList(userId: string): any[] {
  return getDb().prepare(`
    SELECT id, exam_name AS examName, started_at AS startedAt, ended_at AS endedAt,
      duration_seconds AS durationSeconds, total_score AS totalScore, total_max AS totalMax,
      percentage, grade, question_count AS questionCount, created_at AS createdAt
    FROM mock_exams
    WHERE user_id = ?
    ORDER BY ended_at DESC
  `).all(userId) as any[];
}

export function getMockExam(userId: string, examId: string): any | undefined {
  const exam = getDb().prepare(`
    SELECT id, user_id AS userId, exam_name AS examName, started_at AS startedAt, ended_at AS endedAt,
      duration_seconds AS durationSeconds, total_score AS totalScore, total_max AS totalMax,
      percentage, grade, ai_advice AS advice, question_count AS questionCount, created_at AS createdAt
    FROM mock_exams
    WHERE id = ? AND user_id = ?
  `).get(examId, userId) as any;
  if (!exam) return undefined;
  const questions = getDb().prepare(`
    SELECT id, position, question_text AS questionText, topic_name AS topicName,
      answer, score, max_marks AS maxMarks, strengths, improvements, feedback, created_at AS createdAt
    FROM mock_exam_questions
    WHERE mock_exam_id = ? AND user_id = ?
    ORDER BY position ASC
  `).all(examId, userId) as any[];
  const perQuestion = questions.map((question: any) => ({
    ...question,
    strengths: parseJsonList(question.strengths),
    improvements: parseJsonList(question.improvements),
  }));
  const answeredCount = perQuestion.filter((question: any) => Boolean(question.answer)).length;
  const topicMap = new Map<string, { score: number; maxMarks: number }>();
  for (const question of perQuestion) {
    const topic = question.topicName || 'General';
    const current = topicMap.get(topic) || { score: 0, maxMarks: 0 };
    current.score += question.score;
    current.maxMarks += question.maxMarks;
    topicMap.set(topic, current);
  }
  const topicBreakdown = [...topicMap.entries()].map(([topic, totals]) => ({
    topic,
    score: totals.score,
    maxMarks: totals.maxMarks,
    mastery: totals.maxMarks > 0
      ? percentageFor(totals.score, totals.maxMarks) >= 85
        ? 'Strong'
        : percentageFor(totals.score, totals.maxMarks) >= 50
        ? 'Developing'
        : 'Needs Work'
      : 'Needs Work',
  }));
  return {
    ...exam,
    perQuestion,
    answeredCount,
    topicBreakdown,
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

export interface StudyStreak {
  current: number;
  longest: number;
}

function localDateKey(utcIso: string, tzOffsetMinutes: number): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function currentLocalDateKey(tzOffsetMinutes: number): string {
  return new Date(Date.now() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function computeStudyStreak(userId: string, tzOffsetMinutes: number): StudyStreak {
  const rows = getDb().prepare(`
    SELECT ended_at AS endedAt, started_at AS startedAt
    FROM study_sessions
    WHERE user_id = ? AND status = 'completed'
  `).all(userId) as Array<{ endedAt: string | null; startedAt: string }>;

  const studiedDays = new Set<string>();
  for (const row of rows) {
    const day = localDateKey(row.endedAt || row.startedAt, tzOffsetMinutes);
    if (day) studiedDays.add(day);
  }

  const sorted = [...studiedDays].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && addDaysKey(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  const today = currentLocalDateKey(tzOffsetMinutes);
  const anchor = studiedDays.has(today) ? today : addDaysKey(today, -1);
  let current = 0;
  let cursor = anchor;
  while (studiedDays.has(cursor)) {
    current += 1;
    cursor = addDaysKey(cursor, -1);
  }

  return { current, longest };
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

export type DashboardAnalytics = {
  summary: {
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
    completionRate: number;
    upcomingBlocks: number;
    upcomingMinutes: number;
  };
  sevenDay: {
    startDate: string;
    endDate: string;
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
    completionRate: number;
  };
  feedback: {
    averageFocus: number | null;
    averageDifficulty: number | null;
    averageProgress: number | null;
    responseCount: number;
  };
  topics: Array<{
    topicId: string;
    topicName: string;
    plannedMinutes: number;
    actualSeconds: number;
    completedSessions: number;
    stoppedSessions: number;
  }>;
};

function dashboardCompletionRate(completedSessions: number, stoppedSessions: number): number {
  const terminalSessions = completedSessions + stoppedSessions;
  return terminalSessions === 0 ? 0 : completedSessions / terminalSessions;
}

export function getDashboardAnalytics(userId: string, currentTime = new Date()): DashboardAnalytics {
  const blocks = scheduleBlockRows(userId);
  const sessions = studySessionRows(userId);
  const currentDate = currentTime.toISOString().slice(0, 10);
  const windowStart = new Date(Date.UTC(currentTime.getUTCFullYear(), currentTime.getUTCMonth(), currentTime.getUTCDate() - 6));
  const windowStartDate = windowStart.toISOString().slice(0, 10);
  const windowEnd = new Date(Date.UTC(currentTime.getUTCFullYear(), currentTime.getUTCMonth(), currentTime.getUTCDate() + 1));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const topics = new Map<string, DashboardAnalytics['topics'][number]>();
  const getTopic = (topicId: string, topicName: string) => {
    let topic = topics.get(topicId);
    if (!topic) {
      topic = { topicId, topicName, plannedMinutes: 0, actualSeconds: 0, completedSessions: 0, stoppedSessions: 0 };
      topics.set(topicId, topic);
    }
    return topic;
  };

  let plannedMinutes = 0;
  let upcomingBlocks = 0;
  let upcomingMinutes = 0;
  let windowPlannedMinutes = 0;
  for (const block of blocks) {
    plannedMinutes += block.durationMinutes;
    getTopic(block.topicId, block.topicName).plannedMinutes += block.durationMinutes;
    if (block.date >= windowStartDate && block.date <= currentDate) windowPlannedMinutes += block.durationMinutes;
    if (!block.completed && Date.parse(`${block.date}T${block.startTime}:00.000Z`) > currentTime.getTime()) {
      upcomingBlocks += 1;
      upcomingMinutes += block.durationMinutes;
    }
  }

  let actualSeconds = 0;
  let completedSessions = 0;
  let stoppedSessions = 0;
  let windowActualSeconds = 0;
  let windowCompletedSessions = 0;
  let windowStoppedSessions = 0;
  for (const session of sessions) {
    actualSeconds += session.actualDurationSeconds;
    const block = blockById.get(session.scheduleBlockId);
    if (block) {
      const topic = getTopic(block.topicId, block.topicName);
      topic.actualSeconds += session.actualDurationSeconds;
      if (session.status === 'completed') topic.completedSessions += 1;
      if (session.status === 'stopped') topic.stoppedSessions += 1;
    }
    if (session.status === 'completed') completedSessions += 1;
    if (session.status === 'stopped') stoppedSessions += 1;
    const startedAt = Date.parse(session.startedAt);
    if (startedAt >= windowStart.getTime() && startedAt < windowEnd.getTime()) {
      windowActualSeconds += session.actualDurationSeconds;
      if (session.status === 'completed') windowCompletedSessions += 1;
      if (session.status === 'stopped') windowStoppedSessions += 1;
    }
  }

  const feedback = getDb().prepare(`SELECT AVG(focus_rating) AS averageFocus, AVG(difficulty_rating) AS averageDifficulty,
    AVG(progress_rating) AS averageProgress, COUNT(*) AS responseCount FROM session_feedback WHERE user_id = ?`).get(userId) as any;
  const responseCount = Number(feedback?.responseCount || 0);
  return {
    summary: {
      plannedMinutes,
      actualSeconds,
      completedSessions,
      stoppedSessions,
      completionRate: dashboardCompletionRate(completedSessions, stoppedSessions),
      upcomingBlocks,
      upcomingMinutes,
    },
    sevenDay: {
      startDate: windowStartDate,
      endDate: currentDate,
      plannedMinutes: windowPlannedMinutes,
      actualSeconds: windowActualSeconds,
      completedSessions: windowCompletedSessions,
      stoppedSessions: windowStoppedSessions,
      completionRate: dashboardCompletionRate(windowCompletedSessions, windowStoppedSessions),
    },
    feedback: {
      averageFocus: responseCount ? Number(feedback.averageFocus) : null,
      averageDifficulty: responseCount ? Number(feedback.averageDifficulty) : null,
      averageProgress: responseCount ? Number(feedback.averageProgress) : null,
      responseCount,
    },
    topics: [...topics.values()].filter((topic) => topic.plannedMinutes || topic.actualSeconds || topic.completedSessions || topic.stoppedSessions)
      .sort((left, right) => right.actualSeconds - left.actualSeconds || right.plannedMinutes - left.plannedMinutes || left.topicName.localeCompare(right.topicName)),
  };
}

export type MemoryStatus = 'stable' | 'fading' | 'due';

export type MemoryTopicState = {
  topicId: string;
  topicName: string;
  courseId: string;
  courseName: string;
  lastStudiedAt: string;
  qualifyingSessionCount: number;
  totalActualStudySeconds: number;
  memoryStrengthDays: number;
  predictedRetention: number;
  status: MemoryStatus;
  dueAt: string;
  nextRevisionAt: string;
  daysUntilDue: number;
  priority: number;
  weightage: number;
  hasWeightage: boolean;
};

export type CourseMemorySummary = {
  courseId: string;
  courseName: string;
  studiedTopicCount: number;
  predictedRetention: number;
  stableCount: number;
  fadingCount: number;
  dueCount: number;
};

export type MemoryAtlas = {
  forecastDays: number;
  evaluatedAt: string;
  topics: MemoryTopicState[];
  summary: {
    studiedTopicCount: number;
    stableCount: number;
    fadingCount: number;
    dueCount: number;
    unexploredCount: number;
  };
  courses: CourseMemorySummary[];
};

export type RefreshPlanItem = {
  topicId: string;
  topicName: string;
  courseName: string;
  predictedRetention: number;
  dueAt: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  reason: string;
};

export type RefreshPlan = {
  items: RefreshPlanItem[];
  totalMinutes: number;
  message?: string;
};

function retentionStatus(retention: number): MemoryStatus {
  if (retention >= MEMORY_STABLE_THRESHOLD) return 'stable';
  if (retention >= MEMORY_DUE_THRESHOLD) return 'fading';
  return 'due';
}

function memoryStrengthDays(qualifyingSessionCount: number): number {
  const previousSuccessfulExposures = Math.max(0, qualifyingSessionCount - 1);
  return DEFAULT_MEMORY_STRENGTH_DAYS * (
    1 + MEMORY_STRENGTH_EXPOSURE_BONUS * Math.min(previousSuccessfulExposures, MEMORY_STRENGTH_EXPOSURE_CAP)
  );
}

// This is a scheduling estimate based on completed LazyLift sessions, not a measure of recall.
function predictedRetentionAt(lastStudiedAt: string, strengthDays: number, evaluatedAt: Date): number {
  const elapsedDays = Math.max(0, (evaluatedAt.getTime() - Date.parse(lastStudiedAt)) / 86_400_000);
  return Math.max(0, Math.min(1, Math.exp(-elapsedDays / strengthDays)));
}

export function memoryAtlas(userId: string, forecastDays = 0, currentTime = new Date()): MemoryAtlas {
  const safeForecastDays = Math.max(0, Math.min(14, Math.floor(Number(forecastDays) || 0)));
  const evaluatedAt = new Date(currentTime.getTime() + safeForecastDays * 86_400_000);
  const rows = getDb().prepare(`
    SELECT t.id AS topicId, t.name AS topicName, t.course_id AS courseId, c.name AS courseName,
      t.priority, t.weightage, CAST(t.has_weightage AS INTEGER) AS hasWeightage,
      COUNT(s.id) AS qualifyingSessionCount,
      SUM(s.actual_duration_seconds) AS totalActualStudySeconds,
      MAX(COALESCE(s.ended_at, s.started_at)) AS lastStudiedAt
    FROM topics t
    JOIN courses c ON c.id = t.course_id
    JOIN schedule_blocks b ON b.topic_id = t.id AND b.user_id = t.user_id
    JOIN study_sessions s ON s.schedule_block_id = b.id AND s.user_id = b.user_id
    WHERE t.user_id = ? AND s.status = 'completed' AND s.actual_duration_seconds >= ?
    GROUP BY t.id, t.name, t.course_id, c.name, t.priority, t.weightage, t.has_weightage
  `).all(userId, MIN_MEANINGFUL_STUDY_SECONDS) as any[];

  const topics = rows.map((row) => {
    const qualifyingSessionCount = Number(row.qualifyingSessionCount);
    const strengthDays = memoryStrengthDays(qualifyingSessionCount);
    const lastStudiedAt = String(row.lastStudiedAt);
    const predictedRetention = predictedRetentionAt(lastStudiedAt, strengthDays, evaluatedAt);
    const dueAt = new Date(Date.parse(lastStudiedAt) + strengthDays * Math.log(1 / MEMORY_DUE_THRESHOLD) * 86_400_000);
    return {
      topicId: String(row.topicId), topicName: String(row.topicName), courseId: String(row.courseId), courseName: String(row.courseName),
      lastStudiedAt, qualifyingSessionCount, totalActualStudySeconds: Number(row.totalActualStudySeconds || 0),
      memoryStrengthDays: Number(strengthDays.toFixed(2)), predictedRetention, status: retentionStatus(predictedRetention),
      dueAt: dueAt.toISOString(), nextRevisionAt: dueAt.toISOString(),
      daysUntilDue: Number(((dueAt.getTime() - evaluatedAt.getTime()) / 86_400_000).toFixed(2)),
      priority: Number(row.priority), weightage: Number(row.weightage), hasWeightage: Boolean(row.hasWeightage),
    } satisfies MemoryTopicState;
  }).sort((left, right) => left.daysUntilDue - right.daysUntilDue || right.priority - left.priority || left.topicName.localeCompare(right.topicName));

  const allTopics = Number((getDb().prepare('SELECT COUNT(*) AS count FROM topics WHERE user_id = ?').get(userId) as any)?.count || 0);
  const summary = {
    studiedTopicCount: topics.length,
    stableCount: topics.filter((topic) => topic.status === 'stable').length,
    fadingCount: topics.filter((topic) => topic.status === 'fading').length,
    dueCount: topics.filter((topic) => topic.status === 'due').length,
    unexploredCount: Math.max(0, allTopics - topics.length),
  };
  const byCourse = new Map<string, CourseMemorySummary>();
  for (const topic of topics) {
    const course = byCourse.get(topic.courseId) || {
      courseId: topic.courseId, courseName: topic.courseName, studiedTopicCount: 0, predictedRetention: 0,
      stableCount: 0, fadingCount: 0, dueCount: 0,
    };
    course.studiedTopicCount += 1;
    course.predictedRetention += topic.predictedRetention;
    if (topic.status === 'stable') course.stableCount += 1;
    if (topic.status === 'fading') course.fadingCount += 1;
    if (topic.status === 'due') course.dueCount += 1;
    byCourse.set(topic.courseId, course);
  }
  const courses = [...byCourse.values()].map((course) => ({
    ...course,
    predictedRetention: course.studiedTopicCount ? course.predictedRetention / course.studiedTopicCount : 0,
  })).sort((left, right) => left.courseName.localeCompare(right.courseName));
  return { forecastDays: safeForecastDays, evaluatedAt: evaluatedAt.toISOString(), topics, summary, courses };
}

function refreshDuration(topic: MemoryTopicState): number {
  return topic.status === 'due' && (topic.priority >= 7 || topic.weightage >= 20) ? 20 : topic.status === 'due' ? 15 : 10;
}

function refreshReason(topic: MemoryTopicState): string {
  if (topic.status === 'due') return 'Revision due based on the current memory estimate.';
  return 'Approaching the predicted revision threshold.';
}

function hasPendingRevision(userId: string, topicId: string, currentTime: Date): boolean {
  return scheduleBlockRows(userId).some((block) => block.topicId === topicId && block.blockType === 'revision' && !block.completed
    && Date.parse(`${block.date}T${block.startTime}:00.000Z`) >= currentTime.getTime());
}

function findRefreshSlot(userId: string, topicId: string, durationMinutes: number, proposed: ScheduleBlockInput[], currentTime: Date): ScheduleBlockInput | null {
  const today = currentTime.toISOString().slice(0, 10);
  const currentMinutes = currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes();
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const date = dateAfter(today, dayOffset);
    for (let start = 8 * 60; start + durationMinutes <= 20 * 60; start += 30) {
      if (dayOffset === 0 && start <= currentMinutes) continue;
      const candidate: ScheduleBlockInput = {
        topicId, title: 'Memory refresh', date, startTime: timeFromMinutes(start), durationMinutes, completed: false, blockType: 'revision',
      };
      try {
        assertScheduleBlocksAreValid(userId, [...proposed, candidate]);
        return candidate;
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) continue;
        throw error;
      }
    }
  }
  return null;
}

export function buildMemoryRefreshPlan(userId: string, topicId?: string, currentTime = new Date()): RefreshPlan {
  const atlas = memoryAtlas(userId, 0, currentTime);
  const candidates = atlas.topics
    .filter((topic) => !topicId || topic.topicId === topicId)
    .filter((topic) => topic.status === 'due' || topic.daysUntilDue <= 7)
    .filter((topic) => !hasPendingRevision(userId, topic.topicId, currentTime))
    .sort((left, right) => {
      const statusRank = (status: MemoryStatus) => status === 'due' ? 0 : status === 'fading' ? 1 : 2;
      return statusRank(left.status) - statusRank(right.status)
        || left.daysUntilDue - right.daysUntilDue
        || right.priority - left.priority
        || right.weightage - left.weightage;
    }).slice(0, topicId ? 1 : 6);
  if (topicId && candidates.length === 0) {
    if (!atlas.topics.some((topic) => topic.topicId === topicId)) throw new HttpError(404, 'No qualifying completed study evidence exists for this topic.');
    return { items: [], totalMinutes: 0, message: 'This topic does not currently need a refresh, or already has one scheduled.' };
  }
  const proposed: ScheduleBlockInput[] = [];
  const items: RefreshPlanItem[] = [];
  for (const topic of candidates) {
    const durationMinutes = refreshDuration(topic);
    const slot = findRefreshSlot(userId, topic.topicId, durationMinutes, proposed, currentTime);
    if (!slot) continue;
    proposed.push(slot);
    items.push({ topicId: topic.topicId, topicName: topic.topicName, courseName: topic.courseName, predictedRetention: topic.predictedRetention,
      dueAt: topic.dueAt, date: slot.date, startTime: slot.startTime, durationMinutes, reason: refreshReason(topic) });
  }
  return {
    items,
    totalMinutes: items.reduce((total, item) => total + item.durationMinutes, 0),
    message: items.length ? undefined : 'LazyLift could not safely place a refresh session in the next 14 days.',
  };
}

export function acceptMemoryRefreshPlan(userId: string, submittedItems: RefreshPlanItem[], topicId?: string, currentTime = new Date()) {
  if (!Array.isArray(submittedItems) || submittedItems.length === 0) throw new HttpError(400, 'A non-empty refresh plan is required.');
  const expected = buildMemoryRefreshPlan(userId, topicId, currentTime);
  const matches = expected.items.length === submittedItems.length && expected.items.every((item, index) => {
    const submitted = submittedItems[index];
    return item.topicId === submitted?.topicId && item.date === submitted?.date && item.startTime === submitted?.startTime
      && item.durationMinutes === Number(submitted?.durationMinutes);
  });
  if (!matches) throw new HttpError(409, 'This refresh plan is no longer current. Build a new plan before adding it to your calendar.');
  const blocks = expected.items.map((item) => ({
    topicId: item.topicId, title: `Memory refresh: ${item.topicName}`, date: item.date, startTime: item.startTime,
    durationMinutes: item.durationMinutes, completed: false, blockType: 'revision' as const,
  }));
  return saveScheduleBlocks(userId, blocks, {
    field: 'memory_refresh_plan', oldValue: null,
    newValue: JSON.stringify({ source: 'memory-atlas', topicIds: expected.items.map((item) => item.topicId) }),
  });
}

export type AdaptiveProposal = {
  studySessionId: string;
  originalBlockId: string;
  topicId: string;
  topicName: string;
  proposedDate: string;
  proposedStartTime: string;
  proposedEndTime: string;
  proposedDurationMinutes: number;
  reason: string;
  actionType: 'create_revision';
  trigger: 'stopped' | 'high_difficulty';
};

type AdaptiveProposalResult = { proposal: AdaptiveProposal; message?: undefined } | { proposal: null; message: string };

const ADAPTIVE_DAY_START_MINUTES = 8 * 60;
const ADAPTIVE_DAY_END_MINUTES = 18 * 60;
const ADAPTIVE_SLOT_INCREMENT_MINUTES = 30;
const ADAPTIVE_SEARCH_DAYS = 14;

function dateAfter(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function timeFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function roundUpToSlot(minutes: number): number {
  return Math.ceil(minutes / ADAPTIVE_SLOT_INCREMENT_MINUTES) * ADAPTIVE_SLOT_INCREMENT_MINUTES;
}

function isScheduleConflict(userId: string, candidate: ScheduleBlockInput): boolean {
  try {
    assertScheduleBlocksAreValid(userId, [candidate]);
    return false;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return true;
    throw error;
  }
}

function adaptiveTriggerForSession(userId: string, session: { id: string; status: string }): { trigger: 'stopped' | 'high_difficulty'; reason: string } | null {
  if (session.status === 'stopped') {
    return { trigger: 'stopped', reason: 'This study session was stopped before completion, so a shorter revision is suggested.' };
  }
  const feedback = findSessionFeedback(userId, session.id);
  if (session.status === 'completed' && feedback && feedback.difficultyRating >= 4) {
    return { trigger: 'high_difficulty', reason: 'You rated this completed session as difficult, so a shorter revision is suggested.' };
  }
  return null;
}

function hasAcceptedAdaptiveRevision(userId: string, studySessionId: string): boolean {
  const changes = getDb().prepare(`SELECT new_value AS newValue FROM schedule_changes
    WHERE user_id = ? AND field = 'adaptive_revision'`).all(userId) as Array<{ newValue: string | null }>;
  return changes.some((change) => {
    try {
      const value = JSON.parse(change.newValue || '{}');
      return value.actionType === 'create_revision' && value.studySessionId === studySessionId;
    } catch {
      return false;
    }
  });
}

export function buildAdaptiveProposal(userId: string, studySessionId: string, currentTime = new Date()): AdaptiveProposalResult {
  const session = findOwnedStudySession(userId, studySessionId);
  if (!session) throw new HttpError(404, 'Study session not found.');
  if (hasAcceptedAdaptiveRevision(userId, studySessionId)) {
    return { proposal: null, message: 'A revision from this study session has already been accepted.' };
  }

  const trigger = adaptiveTriggerForSession(userId, session);
  if (!trigger) throw new HttpError(409, 'Only stopped sessions or completed sessions with difficulty feedback of 4 or 5 can generate an adaptive revision proposal.');

  const originalBlock = findOwnedScheduleBlock(userId, session.scheduleBlockId);
  if (!originalBlock) throw new HttpError(404, 'Source schedule block not found.');
  const topic = findOwnedTopic(userId, originalBlock.topicId);
  if (!topic) throw new HttpError(404, 'Source topic not found.');

  const proposedDurationMinutes = Math.floor(originalBlock.durationMinutes / 2);
  if (proposedDurationMinutes < 1 || proposedDurationMinutes >= originalBlock.durationMinutes) {
    return { proposal: null, message: 'This session is too short to create a shorter revision block.' };
  }

  const currentDate = currentTime.toISOString().slice(0, 10);
  const currentMinutes = currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes();
  const firstSearchDate = originalBlock.date > currentDate ? originalBlock.date : currentDate;
  const originalEnd = scheduleStartMinutes(originalBlock.startTime)! + originalBlock.durationMinutes;
  for (let dayOffset = 0; dayOffset < ADAPTIVE_SEARCH_DAYS; dayOffset += 1) {
    const proposedDate = dateAfter(firstSearchDate, dayOffset);
    let firstSlot = ADAPTIVE_DAY_START_MINUTES;
    if (proposedDate === originalBlock.date) firstSlot = Math.max(firstSlot, roundUpToSlot(originalEnd));
    if (proposedDate === currentDate) firstSlot = Math.max(firstSlot, roundUpToSlot(currentMinutes + 1));

    for (let startMinutes = firstSlot; startMinutes + proposedDurationMinutes <= ADAPTIVE_DAY_END_MINUTES; startMinutes += ADAPTIVE_SLOT_INCREMENT_MINUTES) {
      const candidate: ScheduleBlockInput = {
        topicId: topic.id,
        title: `Revision: ${topic.name}`,
        date: proposedDate,
        startTime: timeFromMinutes(startMinutes),
        durationMinutes: proposedDurationMinutes,
        completed: false,
      };
      if (isScheduleConflict(userId, candidate)) continue;
      return {
        proposal: {
          studySessionId,
          originalBlockId: originalBlock.id,
          topicId: topic.id,
          topicName: topic.name,
          proposedDate,
          proposedStartTime: candidate.startTime,
          proposedEndTime: timeFromMinutes(startMinutes + proposedDurationMinutes),
          proposedDurationMinutes,
          reason: trigger.reason,
          actionType: 'create_revision',
          trigger: trigger.trigger,
        },
      };
    }
  }

  return { proposal: null, message: 'No available revision slot was found in the next 14 days.' };
}

export function acceptAdaptiveProposal(userId: string, input: {
  studySessionId: string;
  proposedDate: string;
  proposedStartTime: string;
  proposedDurationMinutes: number;
}) {
  if (hasAcceptedAdaptiveRevision(userId, input.studySessionId)) {
    throw new HttpError(409, 'A revision from this study session has already been accepted.');
  }
  const result = buildAdaptiveProposal(userId, input.studySessionId);
  if (!result.proposal) throw new HttpError(409, result.message);
  const proposal = result.proposal;
  if (
    proposal.proposedDate !== input.proposedDate
    || proposal.proposedStartTime !== input.proposedStartTime
    || proposal.proposedDurationMinutes !== input.proposedDurationMinutes
  ) {
    throw new HttpError(409, 'The proposed revision slot is no longer valid. Generate a new suggestion.');
  }

  const [created] = saveScheduleBlocks(
    userId,
    [{
      topicId: proposal.topicId,
      title: `Revision: ${proposal.topicName}`,
      date: proposal.proposedDate,
      startTime: proposal.proposedStartTime,
      durationMinutes: proposal.proposedDurationMinutes,
      completed: false,
    }],
    {
      field: 'adaptive_revision',
      oldValue: null,
      newValue: JSON.stringify({
        source: 'adaptive',
        trigger: proposal.trigger,
        studySessionId: proposal.studySessionId,
        originalBlockId: proposal.originalBlockId,
        actionType: proposal.actionType,
      }),
    },
  );
  return created;
}

export type SchedulingAssistantChange = {
  blockId: string;
  topicId: string;
  topicName: string;
  original: Pick<ScheduleBlockRow, 'title' | 'date' | 'startTime' | 'durationMinutes'>;
  proposed: Pick<ScheduleBlockInput, 'date' | 'startTime' | 'durationMinutes'>;
  operation?: 'move' | 'shorten' | 'cancel' | 'swap' | 'shift';
};

export type SchedulingAssistantPreview = {
  assistantMessage: string;
  intent: SchedulingAssistantIntent;
  changes: SchedulingAssistantChange[];
  matches?: Array<Pick<ScheduleBlockRow, 'topicName' | 'title' | 'date' | 'startTime' | 'durationMinutes'> & { blockId: string }>;
};

function dateTimeValue(date: string, startTime: string): number {
  return Date.parse(`${date}T${startTime}:00.000Z`);
}

function futureUncompletedBlocks(userId: string, currentTime: Date): ScheduleBlockRow[] {
  return scheduleBlockRows(userId).filter((block) => !block.completed && dateTimeValue(block.date, block.startTime) > currentTime.getTime());
}

function periodMinutes(period?: AssistantPeriod): [number, number] {
  if (period === 'morning') return [8 * 60, 12 * 60];
  if (period === 'afternoon') return [12 * 60, 17 * 60];
  if (period === 'evening') return [17 * 60, 22 * 60];
  return [8 * 60, 18 * 60];
}

type AssistantSlotOptions = {
  period?: AssistantPeriod;
  targetTime?: string;
  targetTimeMode?: 'exact' | 'after';
  beforeTime?: string;
  afterTime?: string;
  excludedWeekdays?: number[];
  maxDailyMinutes?: number;
  searchDays?: number;
};

function scheduleLoadMinutes(userId: string, date: string, proposed: ScheduleBlockInput[]): number {
  const stored = scheduleBlockRows(userId)
    .filter((block) => block.date === date)
    .reduce((total, block) => total + block.durationMinutes, 0);
  const added = proposed
    .filter((block) => block.date === date)
    .reduce((total, block) => total + block.durationMinutes, 0);
  return stored + added;
}

function scoredAssistantSlot(
  userId: string,
  topicId: string,
  title: string,
  durationMinutes: number,
  startDate: string,
  options: AssistantSlotOptions,
  excludedIds: string[],
  proposed: ScheduleBlockInput[],
  currentTime: Date,
  avoidBlock?: Pick<ScheduleBlockInput, 'date' | 'startTime' | 'durationMinutes'>,
): ScheduleBlockInput | null {
  const searchDays = Math.max(1, Math.floor(Number(options.searchDays) || 1));
  const beforeTimeMinutes = options.beforeTime ? scheduleStartMinutes(options.beforeTime) : null;
  const afterTimeMinutes = options.afterTime ? scheduleStartMinutes(options.afterTime) : null;
  const excluded = new Set(options.excludedWeekdays || []);
  let best: { slot: ScheduleBlockInput; score: number } | null = null;

  for (let dayOffset = 0; dayOffset < searchDays; dayOffset += 1) {
    const date = dateAfter(startDate, dayOffset);
    if (excluded.has(new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay())) continue;
    const [baseStart, baseEnd] = options.targetTime
      ? options.targetTimeMode === 'after'
        ? [scheduleStartMinutes(options.targetTime)!, periodMinutes('evening')[1]]
        : [scheduleStartMinutes(options.targetTime)!, scheduleStartMinutes(options.targetTime)! + durationMinutes]
      : periodMinutes(options.period);
    let windowStart = Math.max(baseStart, afterTimeMinutes ?? 0);
    let windowEnd = beforeTimeMinutes === null ? baseEnd : Math.min(baseEnd, beforeTimeMinutes);
    if (windowStart + durationMinutes > windowEnd) windowStart = windowEnd - durationMinutes;
    const dailyLoad = options.maxDailyMinutes === undefined ? 0 : scheduleLoadMinutes(userId, date, proposed);
    const step = options.targetTime && options.targetTimeMode === 'exact' ? Math.max(15, windowEnd - windowStart) : ADAPTIVE_SLOT_INCREMENT_MINUTES;
    for (let minutes = windowStart; minutes + durationMinutes <= windowEnd; minutes += step) {
      const candidate: ScheduleBlockInput = { topicId, title, date, startTime: timeFromMinutes(minutes), durationMinutes, completed: false };
      if (dateTimeValue(candidate.date, candidate.startTime) <= currentTime.getTime()) continue;
      if (avoidBlock && candidate.date === avoidBlock.date && candidate.startTime === avoidBlock.startTime && candidate.durationMinutes === avoidBlock.durationMinutes) continue;
      if (options.maxDailyMinutes !== undefined && dailyLoad + durationMinutes > options.maxDailyMinutes) continue;
      if (beforeTimeMinutes !== null && minutes + durationMinutes > beforeTimeMinutes) continue;
      if (afterTimeMinutes !== null && minutes < afterTimeMinutes) continue;
      try {
        assertScheduleBlocksAreValid(userId, [...proposed, candidate], excludedIds);
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) continue;
        throw error;
      }
      const score = dayOffset * 1440 + minutes + (options.maxDailyMinutes === undefined ? 0 : dailyLoad);
      if (!best || score < best.score) best = { slot: candidate, score };
    }
  }
  return best?.slot || null;
}

function topicMatches(block: ScheduleBlockRow, query: string | undefined): boolean {
  return Boolean(query && block.topicName.toLowerCase().includes(query.toLowerCase()));
}

function matchingBlocks(blocks: ScheduleBlockRow[], intent: SchedulingAssistantIntent): ScheduleBlockRow[] {
  let matches = blocks;
  if (intent.topicQuery) matches = matches.filter((block) => topicMatches(block, intent.topicQuery));
  if (intent.sourceDate) matches = matches.filter((block) => block.date === intent.sourceDate);
  if (intent.sourceTime) matches = matches.filter((block) => block.startTime === intent.sourceTime);
  return matches;
}

function querySchedulingAssistant(userId: string, intent: SchedulingAssistantIntent, currentTime: Date): SchedulingAssistantPreview {
  const upcoming = scheduleBlockRows(userId)
    .filter((block) => dateTimeValue(block.date, block.startTime) > currentTime.getTime());
  if (intent.topicQuery) {
    const matches = upcoming.filter((block) => topicMatches(block, intent.topicQuery));
    if (matches.length === 0) return { intent, changes: [], assistantMessage: `You do not have any upcoming ${intent.topicQuery} sessions.` };
    const next = matches[0];
    return { intent, changes: [], assistantMessage: `Your next ${next.topicName} session is ${next.date} at ${next.startTime} for ${next.durationMinutes} minutes.` };
  }
  if (intent.sourceDate) {
    const [start, end] = intent.period ? periodMinutes(intent.period) : [0, 24 * 60];
    const matches = upcoming.filter((block) => block.date === intent.sourceDate
      && scheduleStartMinutes(block.startTime)! < end
      && start < scheduleStartMinutes(block.startTime)! + block.durationMinutes);
    if (matches.length === 0) return { intent, changes: [], assistantMessage: `You do not have any study sessions scheduled for that time.` };
    const minutes = matches.reduce((total, block) => total + block.durationMinutes, 0);
    return { intent, changes: [], assistantMessage: `You have ${matches.length} session${matches.length === 1 ? '' : 's'} scheduled for ${intent.sourceDate}, totaling ${minutes} minutes.` };
  }
  const next = upcoming[0];
  return next
    ? { intent, changes: [], assistantMessage: `Your next session is ${next.topicName} on ${next.date} at ${next.startTime} for ${next.durationMinutes} minutes.` }
    : { intent, changes: [], assistantMessage: 'You do not have any upcoming study sessions scheduled.' };
}

function queryRangeAssistant(userId: string, intent: SchedulingAssistantIntent, currentTime: Date): SchedulingAssistantPreview {
  const rows = scheduleBlockRows(userId)
    .filter((block) => !block.completed && block.date >= intent.sourceDate && block.date <= intent.rangeEndDate && dateTimeValue(block.date, block.startTime) > currentTime.getTime());
  if (rows.length === 0) return { intent, changes: [], assistantMessage: `You have no unfinished sessions between ${intent.sourceDate} and ${intent.rangeEndDate}.` };
  const byDate = new Map<string, { count: number; minutes: number; names: string[] }>();
  for (const block of rows) {
    const entry = byDate.get(block.date) || { count: 0, minutes: 0, names: [] };
    entry.count += 1;
    entry.minutes += block.durationMinutes;
    if (!entry.names.includes(block.topicName)) entry.names.push(block.topicName);
    byDate.set(block.date, entry);
  }
  const summary = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, entry]) => `${date}: ${entry.count} session${entry.count === 1 ? '' : 's'} totaling ${entry.minutes} minutes (${entry.names.join(', ')})`);
  return { intent, changes: [], assistantMessage: `Between ${intent.sourceDate} and ${intent.rangeEndDate} you have:\n${summary.join('\n')}` };
}

function previewCancelAssistant(userId: string, intent: SchedulingAssistantIntent, currentTime: Date, selectedBlockId?: string): SchedulingAssistantPreview {
  const futureBlocks = futureUncompletedBlocks(userId, currentTime);
  let matches = matchingBlocks(futureBlocks, intent);
  if (selectedBlockId) matches = matches.filter((block) => block.id === selectedBlockId);
  if (matches.length === 0) return { intent, changes: [], assistantMessage: 'I could not find an unfinished future session matching that request.' };
  if (matches.length > 1 && !intent.allMatches) {
    return {
      intent,
      changes: [],
      assistantMessage: `I found ${matches.length} matching sessions. Please be more specific about the date or time.`,
      matches: matches.map(({ id, topicName, title, date, startTime, durationMinutes }) => ({ blockId: id, topicName, title, date, startTime, durationMinutes })),
    };
  }
  const changes = matches.map((block) => ({
    blockId: block.id,
    topicId: block.topicId,
    topicName: block.topicName,
    original: { title: block.title, date: block.date, startTime: block.startTime, durationMinutes: block.durationMinutes },
    proposed: { date: block.date, startTime: block.startTime, durationMinutes: block.durationMinutes },
    operation: 'cancel' as const,
  }));
  const sessions = changes.map((change) => `${change.topicName} at ${change.original.startTime} on ${change.original.date}`).join(', ');
  return { intent, changes, assistantMessage: `I can cancel ${changes.length} session${changes.length === 1 ? '' : 's'}: ${sessions}. Confirm to remove ${changes.length === 1 ? 'it' : 'them'} from your calendar.` };
}

function previewSwapAssistant(userId: string, intent: SchedulingAssistantIntent, currentTime: Date, selectedBlockId?: string): SchedulingAssistantPreview {
  const futureBlocks = futureUncompletedBlocks(userId, currentTime);
  const aBlock = futureBlocks.find((block) => topicMatches(block, intent.topicQuery));
  const bBlocks = intent.otherTopicQuery ? futureBlocks.filter((block) => topicMatches(block, intent.otherTopicQuery)) : [];
  if (!aBlock || bBlocks.length === 0) return { intent, changes: [], assistantMessage: 'I could not find both topics in your upcoming schedule.' };
  const allMatches = [...(bBlocks.some((b) => b.id === aBlock.id) ? [] : [aBlock]), ...bBlocks];
  let blockA = aBlock;
  let blockB = bBlocks[0];
  if (selectedBlockId) {
    const selected = allMatches.find((block) => block.id === selectedBlockId);
    if (!selected) return { intent, changes: [], assistantMessage: 'I could not find a matching session for that selection.' };
    if (topicMatches(selected, intent.topicQuery)) {
      blockA = selected;
      blockB = bBlocks.find((b) => b.id !== selected.id) || bBlocks[0];
    } else {
      blockA = aBlock;
      blockB = selected;
    }
  } else if (bBlocks.length > 1) {
    return {
      intent,
      changes: [],
      assistantMessage: `I found ${bBlocks.length} sessions for the second topic. Please pick which one to swap.`,
      matches: allMatches.map(({ id, topicName, title, date, startTime, durationMinutes }) => ({ blockId: id, topicName, title, date, startTime, durationMinutes })),
    };
  }
  const candidates = [
    { topicId: blockB.topicId, title: blockB.title, date: blockB.date, startTime: blockB.startTime, durationMinutes: blockA.durationMinutes, completed: false },
    { topicId: blockA.topicId, title: blockA.title, date: blockA.date, startTime: blockA.startTime, durationMinutes: blockB.durationMinutes, completed: false },
  ];
  try {
    assertScheduleBlocksAreValid(userId, candidates, [blockA.id, blockB.id]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return { intent, changes: [], assistantMessage: 'That swap would overlap another session, so I cannot suggest it safely.' };
    throw error;
  }
  const changes: SchedulingAssistantChange[] = [
    {
      blockId: blockA.id,
      topicId: blockA.topicId,
      topicName: blockA.topicName,
      original: { title: blockA.title, date: blockA.date, startTime: blockA.startTime, durationMinutes: blockA.durationMinutes },
      proposed: { date: blockB.date, startTime: blockB.startTime, durationMinutes: blockA.durationMinutes },
      operation: 'swap',
    },
    {
      blockId: blockB.id,
      topicId: blockB.topicId,
      topicName: blockB.topicName,
      original: { title: blockB.title, date: blockB.date, startTime: blockB.startTime, durationMinutes: blockB.durationMinutes },
      proposed: { date: blockA.date, startTime: blockA.startTime, durationMinutes: blockB.durationMinutes },
      operation: 'swap',
    },
  ];
  return { intent, changes, assistantMessage: `I can swap ${blockA.topicName} (${blockA.date} at ${blockA.startTime}) with ${blockB.topicName} (${blockB.date} at ${blockB.startTime}). Confirm to update your calendar.` };
}

function previewDayShiftAssistant(userId: string, intent: SchedulingAssistantIntent, currentTime: Date): SchedulingAssistantPreview {
  const moving = futureUncompletedBlocks(userId, currentTime).filter((block) => block.date === intent.sourceDate);
  if (moving.length === 0) return { intent, changes: [], assistantMessage: `I could not find any unfinished future sessions on ${intent.sourceDate}.` };
  const targetDate = dateAfter(intent.sourceDate, intent.shiftDays || 0);
  if (targetDate === intent.sourceDate) return { intent, changes: [], assistantMessage: 'Moving those sessions to the same day would not change anything.' };
  const candidates = moving.map((block) => ({
    topicId: block.topicId,
    title: block.title,
    date: targetDate,
    startTime: block.startTime,
    durationMinutes: block.durationMinutes,
    completed: false,
  }));
  try {
    assertScheduleBlocksAreValid(userId, candidates, moving.map((block) => block.id));
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return { intent, changes: [], assistantMessage: `${targetDate} already has sessions that overlap, so I cannot move these without conflicts.` };
    throw error;
  }
  const changes = moving.map((block) => ({
    blockId: block.id,
    topicId: block.topicId,
    topicName: block.topicName,
    original: { title: block.title, date: block.date, startTime: block.startTime, durationMinutes: block.durationMinutes },
    proposed: { date: targetDate, startTime: block.startTime, durationMinutes: block.durationMinutes },
    operation: 'shift' as const,
  }));
  const sessions = changes.map((change) => change.topicName).join(', ');
  return { intent, changes, assistantMessage: `I can move ${changes.length} session${changes.length === 1 ? '' : 's'} (${sessions}) from ${intent.sourceDate} to ${targetDate}. Confirm to update your calendar.` };
}

export function previewSchedulingAssistant(
  userId: string,
  intent: SchedulingAssistantIntent,
  currentTime = new Date(),
  selectedBlockId?: string,
): SchedulingAssistantPreview {
  if (intent.type === 'query_schedule') return querySchedulingAssistant(userId, intent, currentTime);
  if (intent.type === 'query_range') return queryRangeAssistant(userId, intent, currentTime);
  if (intent.type === 'cancel_topic') return previewCancelAssistant(userId, intent, currentTime, selectedBlockId);
  if (intent.type === 'swap_sessions') return previewSwapAssistant(userId, intent, currentTime, selectedBlockId);
  if (intent.type === 'reschedule_day') return previewDayShiftAssistant(userId, intent, currentTime);
  if (intent.type === 'unsupported') {
    return { intent, changes: [], assistantMessage: 'I can answer schedule questions, move a topic, shorten a session, swap or cancel sessions, shift a whole day, or help when you are unavailable.' };
  }

  const futureBlocks = futureUncompletedBlocks(userId, currentTime);
  let matches = matchingBlocks(futureBlocks, intent);
  if (selectedBlockId) matches = matches.filter((block) => block.id === selectedBlockId);
  if (matches.length === 0) return { intent, changes: [], assistantMessage: 'I could not find an unfinished future session matching that request.' };
  if ((intent.type === 'move_topic' || intent.type === 'shorten_topic' || intent.type === 'move_time') && matches.length > 1 && !intent.allMatches) {
    return {
      intent,
      changes: [],
      assistantMessage: `I found ${matches.length} matching sessions. Please be more specific about the date or time.`,
      matches: matches.map(({ id, topicName, title, date, startTime, durationMinutes }) => ({ blockId: id, topicName, title, date, startTime, durationMinutes })),
    };
  }

  const moving = intent.type === 'unavailable_period' ? matches.filter((block) => {
    const [start, end] = periodMinutes(intent.period);
    return scheduleStartMinutes(block.startTime)! < end && start < scheduleStartMinutes(block.startTime)! + block.durationMinutes;
  }) : matches;
  if (moving.length === 0) return { intent, changes: [], assistantMessage: 'You do not have unfinished sessions in that period.' };

  const excludedIds = moving.map((block) => block.id);
  const proposed: ScheduleBlockInput[] = [];
  const changes: SchedulingAssistantChange[] = [];
  for (const block of moving) {
    const shortened = intent.type === 'shorten_topic' ? Math.floor(block.durationMinutes / 2) : block.durationMinutes;
    if (shortened < 1 || shortened >= block.durationMinutes && intent.type === 'shorten_topic') {
      return { intent, changes: [], assistantMessage: `${block.title} is already too short to shorten further.` };
    }
    const startDate = intent.type === 'unavailable_period'
      ? dateAfter(block.date, 1)
      : intent.targetDate || block.date;
    const slot = intent.type === 'shorten_topic'
      ? { topicId: block.topicId, title: block.title, date: block.date, startTime: block.startTime, durationMinutes: shortened, completed: false }
      : scoredAssistantSlot(
        userId,
        block.topicId,
        block.title,
        shortened,
        startDate,
        {
          period: intent.type === 'unavailable_period' ? 'morning' : intent.period,
          targetTime: intent.targetTime,
          targetTimeMode: intent.targetTimeMode,
          beforeTime: intent.beforeTime,
          excludedWeekdays: intent.excludedWeekdays,
          maxDailyMinutes: intent.maxDailyMinutes,
          searchDays: intent.type === 'unavailable_period' ? ADAPTIVE_SEARCH_DAYS : 1,
        },
        excludedIds,
        proposed,
        currentTime,
        block,
      );
    if (!slot) return { intent, changes: [], assistantMessage: `I could not find a safe replacement slot for ${block.title}.` };
    try {
      assertScheduleBlocksAreValid(userId, [...proposed, slot], excludedIds);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) return { intent, changes: [], assistantMessage: `I could not find a safe replacement slot for ${block.title}.` };
      throw error;
    }
    proposed.push(slot);
    changes.push({
      blockId: block.id,
      topicId: block.topicId,
      topicName: block.topicName,
      original: { title: block.title, date: block.date, startTime: block.startTime, durationMinutes: block.durationMinutes },
      proposed: { date: slot.date, startTime: slot.startTime, durationMinutes: slot.durationMinutes },
    });
  }

  const names = changes.map((change) => change.topicName).join(', ');
  const sessions = changes.map((change) => `${change.topicName} at ${change.original.startTime}`).join(', ');
  const replacements = changes.map((change) => `${change.proposed.date} at ${change.proposed.startTime}`).join(', ');
  const assistantMessage = intent.type === 'unavailable_period'
    ? `You have ${changes.length} unfinished session${changes.length === 1 ? '' : 's'} in that period: ${sessions}. I found free replacement slot${changes.length === 1 ? '' : 's'} on ${replacements}. Confirm to update your calendar.`
    : intent.type === 'shorten_topic'
      ? `I can shorten ${names} to ${changes.map((change) => `${change.proposed.durationMinutes} minutes`).join(', ')}. Confirm to update your calendar.`
      : `I found ${changes.length} safe change${changes.length === 1 ? '' : 's'} for ${names}: ${replacements}. Confirm to update your calendar.`;
  return {
    intent,
    changes,
    assistantMessage,
  };
}

export function confirmSchedulingAssistant(
  userId: string,
  intent: SchedulingAssistantIntent,
  submittedChanges: SchedulingAssistantChange[],
  selectedBlockId?: string,
) {
  const preview = previewSchedulingAssistant(userId, intent, new Date(), selectedBlockId);
  if (preview.changes.length === 0 || preview.changes.length !== submittedChanges.length) {
    throw new HttpError(409, 'Your schedule changed since this suggestion, so I recalculated before making any changes.');
  }
  const matches = preview.changes.every((change, index) => {
    const submitted = submittedChanges[index];
    return change.blockId === submitted.blockId
      && change.proposed.date === submitted.proposed.date
      && change.proposed.startTime === submitted.proposed.startTime
      && change.proposed.durationMinutes === submitted.proposed.durationMinutes;
  });
  if (!matches) throw new HttpError(409, 'Your schedule changed since this suggestion, so I recalculated before making any changes.');

  const blockIds = preview.changes.map((change) => change.blockId);
  const sourceBlocks = preview.changes.map((change) => {
    const block = findOwnedScheduleBlock(userId, change.blockId);
    if (!block) throw new HttpError(404, 'Schedule block not found.');
    if (block.completed) throw new HttpError(409, 'Completed schedule blocks cannot be changed.');
    return block;
  });
  const candidates = preview.changes
    .filter((change) => change.operation !== 'cancel')
    .map((change, index) => ({
      topicId: sourceBlocks.filter((_, i) => preview.changes[i].operation !== 'cancel')[index].topicId,
      title: sourceBlocks.filter((_, i) => preview.changes[i].operation !== 'cancel')[index].title,
      date: change.proposed.date,
      startTime: change.proposed.startTime,
      durationMinutes: change.proposed.durationMinutes,
      completed: false,
    }));
  if (candidates.length > 0) assertScheduleBlocksAreValid(userId, candidates, blockIds);

  const applyAll = getDb().transaction(() => {
    preview.changes.forEach((change, index) => {
      if (change.operation === 'cancel') {
        deleteScheduleBlock(userId, change.blockId);
        return;
      }
      updateScheduleBlock(userId, change.blockId, {
        date: change.proposed.date,
        startTime: change.proposed.startTime,
        durationMinutes: change.proposed.durationMinutes,
      });
      recordScheduleChange(userId, change.blockId, 'conversational_reschedule', JSON.stringify(change.original), JSON.stringify({
        ...change.proposed,
        operation: change.operation,
        swapIndex: change.operation === 'swap' ? index : undefined,
        intent: preview.intent,
        confirmed: true,
      }));
    });
  });
  applyAll([]);
  return scheduleBlockRows(userId);
}

export type StudyRoomRow = {
  id: string;
  name: string;
  topic: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  joined: boolean;
  createdAt: string;
};

export type StudyRoomMemberRow = {
  id: string;
  displayName: string;
  email: string;
  joinedAt: string;
};

export type StudyRoomMessageRow = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isQuestion: boolean;
  topicTag: string | null;
  createdAt: string;
};

export type StudyRoomSessionRow = {
  startedBy: string;
  startedByName: string;
  startedAt: string;
  durationMinutes: number;
  status: 'active' | 'paused' | 'stopped';
  updatedAt: string;
};

function assertRoomMembership(userId: string, roomId: string) {
  const room = getDb().prepare('SELECT id FROM study_rooms WHERE id = ?').get(roomId);
  if (!room) throw new HttpError(404, 'Study room not found.');
  const membership = getDb().prepare('SELECT room_id FROM study_room_memberships WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  if (!membership) throw new HttpError(403, 'Join this study room before accessing it.');
}

export function listStudyRooms(userId: string): StudyRoomRow[] {
  return getDb().prepare(`
    SELECT r.id, r.name, r.topic, r.owner_id AS ownerId,
      owner.display_name AS ownerName,
      COUNT(DISTINCT m.user_id) AS memberCount,
      EXISTS(SELECT 1 FROM study_room_memberships mine WHERE mine.room_id = r.id AND mine.user_id = ?) AS joined,
      r.created_at AS createdAt
    FROM study_rooms r
    JOIN users owner ON owner.id = r.owner_id
    LEFT JOIN study_room_memberships m ON m.room_id = r.id
    GROUP BY r.id, r.name, r.topic, r.owner_id, owner.display_name, r.created_at
    ORDER BY r.created_at DESC
  `).all(userId).map((row: any) => ({ ...row, memberCount: Number(row.memberCount), joined: Boolean(row.joined) })) as StudyRoomRow[];
}

export function createStudyRoom(userId: string, name: string, topic: string): StudyRoomRow {
  const id = createId('room');
  const timestamp = now();
  getDb().transaction(() => {
    getDb().prepare('INSERT INTO study_rooms (id, name, topic, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name.trim(), topic.trim(), userId, timestamp);
    getDb().prepare('INSERT INTO study_room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, userId, timestamp);
  })([]);
  return listStudyRooms(userId).find((room) => room.id === id)!;
}

export function joinStudyRoom(userId: string, roomId: string) {
  const room = getDb().prepare('SELECT id FROM study_rooms WHERE id = ?').get(roomId);
  if (!room) throw new HttpError(404, 'Study room not found.');
  getDb().prepare('INSERT OR IGNORE INTO study_room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(roomId, userId, now());
  return getStudyRoom(userId, roomId);
}

export function leaveStudyRoom(userId: string, roomId: string) {
  assertRoomMembership(userId, roomId);
  const owner = getDb().prepare('SELECT owner_id AS ownerId FROM study_rooms WHERE id = ?').get(roomId) as any;
  if (owner.ownerId === userId) throw new HttpError(409, 'The room owner cannot leave the room.');
  getDb().prepare('DELETE FROM study_room_memberships WHERE room_id = ? AND user_id = ?').run(roomId, userId);
}

export function getStudyRoom(userId: string, roomId: string) {
  assertRoomMembership(userId, roomId);
  return listStudyRooms(userId).find((room) => room.id === roomId)!;
}

export function studyRoomMembers(userId: string, roomId: string): StudyRoomMemberRow[] {
  assertRoomMembership(userId, roomId);
  return getDb().prepare(`
    SELECT u.id, u.display_name AS displayName, u.email, m.joined_at AS joinedAt
    FROM study_room_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ? ORDER BY m.joined_at ASC
  `).all(roomId) as StudyRoomMemberRow[];
}

export function studyRoomMessages(userId: string, roomId: string): StudyRoomMessageRow[] {
  assertRoomMembership(userId, roomId);
  return getDb().prepare(`
    SELECT message.id, message.user_id AS senderId, u.display_name AS senderName,
      message.text, CAST(message.is_question AS INTEGER) AS isQuestion,
      message.topic_tag AS topicTag, message.created_at AS createdAt
    FROM study_room_messages message JOIN users u ON u.id = message.user_id
    WHERE message.room_id = ? ORDER BY message.created_at ASC
  `).all(roomId).map((row: any) => ({ ...row, isQuestion: Boolean(row.isQuestion) })) as StudyRoomMessageRow[];
}

export function createStudyRoomMessage(userId: string, roomId: string, input: { text: string; isQuestion?: boolean; topicTag?: string }) {
  assertRoomMembership(userId, roomId);
  const id = createId('room-message');
  getDb().prepare(`INSERT INTO study_room_messages (id, room_id, user_id, text, is_question, topic_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, roomId, userId, input.text.trim(), input.isQuestion ? 1 : 0, input.topicTag || null, now());
  return studyRoomMessages(userId, roomId).find((message) => message.id === id)!;
}

export function studyRoomSession(userId: string, roomId: string): StudyRoomSessionRow | null {
  assertRoomMembership(userId, roomId);
  const row = getDb().prepare(`
    SELECT session.started_by AS startedBy, u.display_name AS startedByName,
      session.started_at AS startedAt, session.duration_minutes AS durationMinutes,
      session.status, session.updated_at AS updatedAt
    FROM study_room_sessions session JOIN users u ON u.id = session.started_by
    WHERE session.room_id = ?
  `).get(roomId) as any;
  return row || null;
}

export function updateStudyRoomSession(userId: string, roomId: string, input: { status: 'active' | 'paused' | 'stopped'; durationMinutes?: number }) {
  assertRoomMembership(userId, roomId);
  const timestamp = now();
  const existing = getDb().prepare('SELECT room_id FROM study_room_sessions WHERE room_id = ?').get(roomId);
  if (existing) {
    getDb().prepare('UPDATE study_room_sessions SET status = ?, duration_minutes = COALESCE(?, duration_minutes), updated_at = ? WHERE room_id = ?')
      .run(input.status, input.durationMinutes ?? null, timestamp, roomId);
  } else {
    getDb().prepare(`INSERT INTO study_room_sessions (room_id, started_by, started_at, duration_minutes, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(roomId, userId, timestamp, Math.max(1, Number(input.durationMinutes) || 25), input.status, timestamp);
  }
  return studyRoomSession(userId, roomId);
}
