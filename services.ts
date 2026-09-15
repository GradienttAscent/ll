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
  createdAt: string;
};

export type QuestionRow = {
  id: string;
  topicId: string | null;
  topicName: string | null;
  documentId: string | null;
  questionText: string;
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

export type ScheduleBlockInput = {
  topicId: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  completed?: boolean;
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

function academicTokens(value: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'which', 'using', 'explain', 'describe', 'discuss', 'compare', 'define', 'write', 'about', 'into', 'your', 'their', 'are', 'is', 'of', 'to', 'in', 'a', 'an']);
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/)
    .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

export function normalizeAcademicQuestion(value: string): string {
  return value.replace(/^\s*(?:(?:question|q)\s*)?\d+\s*(?:\([^)]*\))?\s*[.):\-]\s*/i, '')
    .replace(/\s+/g, ' ').trim();
}

export function extractNumberedQuestions(content: string): string[] {
  const prefix = /^\s*(?:(?:question|q)\s*)?\d+\s*(?:\([^)]*\))?\s*[.):\-]\s*/i;
  const sections = content.replace(/\r/g, '').split(/(?=^\s*(?:(?:question|q)\s*)?\d+\s*(?:\([^)]*\))?\s*[.):\-]\s*)/im);
  const unique = new Map<string, string>();
  for (const section of sections) {
    if (!prefix.test(section)) continue;
    const question = normalizeAcademicQuestion(section);
    const normalized = question.toLowerCase();
    if (question && !unique.has(normalized)) unique.set(normalized, question);
  }
  return [...unique.values()];
}

function extractSyllabusTopics(content: string): Array<{ name: string; weightage?: number }> {
  const topics = new Map<string, { name: string; weightage?: number }>();
  for (const rawLine of content.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const body = line.replace(/^\s*(?:unit|module|topic|chapter)\s*\d*\s*[:.)\-]?\s*/i, '').trim();
    if (!body || body.length > 120) continue;
    const weightageMatch = /(\d+(?:\.\d+)?)\s*%/.exec(body);
    const withoutWeightage = body.replace(/\(?\d+(?:\.\d+)?\s*%\)?/g, '').trim();
    const candidates = withoutWeightage.includes(':') ? withoutWeightage.split(':').slice(1) : [withoutWeightage];
    for (const candidate of candidates.flatMap((item) => item.split(/[;,]/))) {
      const name = candidate.replace(/^[-*]\s*/, '').trim();
      if (name.length < 3 || name.length > 80 || /^(course|syllabus|unit|module)$/i.test(name)) continue;
      topics.set(name.toLowerCase(), { name, weightage: weightageMatch ? Number(weightageMatch[1]) : undefined });
    }
  }
  return [...topics.values()];
}

function mapQuestionToTopic(questionText: string, topics: TopicRow[]) {
  const questionTokens = new Set(academicTokens(questionText));
  let best: { topic: TopicRow; score: number; evidence: string[] } | null = null;
  for (const topic of topics) {
    const matches = [...new Set(academicTokens(topic.name).filter((token) => questionTokens.has(token)))];
    if (matches.length === 0) continue;
    const topicTokenCount = Math.max(1, academicTokens(topic.name).length);
    const score = matches.length / topicTokenCount;
    const evidence = matches.map((token) => `matched keyword: ${token}`);
    if (!best || score > best.score || (score === best.score && matches.length > best.evidence.length)) {
      best = { topic, score, evidence };
    }
  }
  return best && best.score >= 0.3 ? best : null;
}

export type AcademicQuestionRow = QuestionRow;
export type RankedTopicRow = TopicRow & {
  priorityScore: number;
  mappedQuestionCount: number;
  syllabusEvidence: boolean;
  sourceDocumentIds: string[];
  weightageAvailable: boolean;
  reason: string;
};

export function rankedTopicRows(userId: string): RankedTopicRow[] {
  const topics = topicRows(userId);
  const sourceDocumentIds = new Map<string, string[]>();
  for (const row of getDb().prepare(`SELECT topic_id AS topicId, document_id AS documentId
    FROM topic_document_sources WHERE user_id = ?`).all(userId) as any[]) {
    sourceDocumentIds.set(row.topicId, [...(sourceDocumentIds.get(row.topicId) || []), row.documentId]);
  }
  const mappedCounts = new Map<string, number>();
  for (const question of questionRows(userId)) {
    if (question.topicId) mappedCounts.set(question.topicId, (mappedCounts.get(question.topicId) || 0) + 1);
  }
  const ranking = topics.map((topic) => {
    const mappedQuestionCount = mappedCounts.get(topic.id) || 0;
    const topicSourceDocumentIds = sourceDocumentIds.get(topic.id) || [];
    const syllabusEvidence = topicSourceDocumentIds.length > 0 || topic.source === 'syllabus';
    const storedWeightageBonus = topic.weightage >= 20 ? Math.min(2, Math.round(topic.weightage / 25)) : 0;
    const priorityScore = Math.min(10, 1 + mappedQuestionCount * 2 + (syllabusEvidence ? 2 : 0) + storedWeightageBonus);
    const reason = mappedQuestionCount > 0
      ? `${priorityScore >= 7 ? 'High' : 'Medium'} priority: appears in ${mappedQuestionCount} mapped previous question${mappedQuestionCount === 1 ? '' : 's'}${syllabusEvidence ? ' and is present in the syllabus' : ''}.`
      : syllabusEvidence
        ? 'Lower priority: present in the syllabus but no previous questions were mapped.'
        : 'Lower priority: no mapped previous-question evidence yet.';
    return { ...topic, priority: priorityScore, priorityScore, mappedQuestionCount, syllabusEvidence, sourceDocumentIds: topicSourceDocumentIds, weightageAvailable: topic.hasWeightage, reason };
  });
  const updatePriority = getDb().prepare('UPDATE topics SET priority = ? WHERE user_id = ? AND id = ?');
  const apply = getDb().transaction((items: RankedTopicRow[]) => items.forEach((topic) => updatePriority.run(topic.priorityScore, userId, topic.id)));
  apply(ranking);
  return ranking.sort((left, right) => right.priorityScore - left.priorityScore || right.mappedQuestionCount - left.mappedQuestionCount || left.name.localeCompare(right.name));
}

export function ingestAcademicDocument(userId: string, input: { title: string; docType: string; content: string; fileSize?: string }) {
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
  if (syllabusTopics.length > 0) remapUnmatchedQuestions(userId, topicRows(userId));
  const topics = topicRows(userId);
  const extractedQuestions = input.docType.toLowerCase().includes('past') ? extractNumberedQuestions(input.content) : [];
  const existing = new Set((getDb().prepare('SELECT normalized_text AS normalizedText FROM questions WHERE user_id = ? AND document_id = ?').all(userId, document.id) as any[]).map((row) => row.normalizedText));
  const insert = getDb().prepare(`INSERT INTO questions
    (id, user_id, document_id, topic_id, question_text, normalized_text, marks, question_type, source, suggested_time_minutes, mapping_score, mapping_evidence, mapping_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, document_id, normalized_text) WHERE document_id IS NOT NULL DO NOTHING`);
  const createdQuestionIds: string[] = [];
  const saveQuestions = getDb().transaction((items: string[]) => {
    for (const questionText of items) {
      const normalizedText = questionText.toLowerCase();
      if (existing.has(normalizedText)) continue;
      const mapping = mapQuestionToTopic(questionText, topics);
      const id = createId('question');
      insert.run(id, userId, document.id, mapping?.topic.id || null, questionText, normalizedText, 10, 'Subjective', 'pyq', 15,
        mapping?.score || null, JSON.stringify(mapping?.evidence || []), mapping ? 'mapped' : 'unmatched', now());
      createdQuestionIds.push(id);
      existing.add(normalizedText);
    }
  });
  saveQuestions(extractedQuestions);
  const ranking = rankedTopicRows(userId);
  return {
    document,
    extractedTopicCount: syllabusTopics.length,
    extractedQuestionCount: extractedQuestions.length,
    createdQuestionCount: createdQuestionIds.length,
    questions: questionRows(userId).filter((question) => createdQuestionIds.includes(question.id)),
    ranking,
  };
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

export function academicEvidence(userId: string) {
  return { documents: documentRows(userId), questions: questionRows(userId), ranking: rankedTopicRows(userId) };
}

export function questionRows(userId: string): QuestionRow[] {
  return getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.document_id AS documentId, q.question_text AS questionText, q.marks,
      q.question_type AS questionType, q.source, q.suggested_time_minutes AS suggestedTimeMinutes,
      q.mapping_score AS mappingScore, q.mapping_evidence AS mappingEvidence, q.mapping_status AS mappingStatus,
      q.created_at AS createdAt, t.name AS topicName
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id AND t.user_id = q.user_id
    WHERE q.user_id = ?
    ORDER BY q.created_at DESC
  `).all(userId).map((row: any) => ({ ...row, mappingEvidence: parseJsonList(row.mappingEvidence), mappingStatus: row.mappingStatus || (row.topicId ? 'mapped' : 'unmatched') })) as QuestionRow[];
}

export function findOwnedQuestion(userId: string, questionId: string): QuestionRow | undefined {
  const row = getDb().prepare(`
    SELECT q.id, q.topic_id AS topicId, q.document_id AS documentId, q.question_text AS questionText, q.marks,
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

function assistantSlot(
  userId: string,
  topicId: string,
  title: string,
  durationMinutes: number,
  startDate: string,
  period: AssistantPeriod | undefined,
  excludedIds: string[],
  proposed: ScheduleBlockInput[],
  currentTime: Date,
  targetTime?: string,
  searchDays = 1,
  avoidBlock?: Pick<ScheduleBlockInput, 'date' | 'startTime' | 'durationMinutes'>,
): ScheduleBlockInput | null {
  for (let dayOffset = 0; dayOffset < searchDays; dayOffset += 1) {
    const date = dateAfter(startDate, dayOffset);
    const [windowStart, windowEnd] = targetTime
      ? [scheduleStartMinutes(targetTime)!, scheduleStartMinutes(targetTime)! + durationMinutes]
      : periodMinutes(period);
    for (let minutes = windowStart; minutes + durationMinutes <= windowEnd; minutes += targetTime ? windowEnd : ADAPTIVE_SLOT_INCREMENT_MINUTES) {
      const candidate: ScheduleBlockInput = { topicId, title, date, startTime: timeFromMinutes(minutes), durationMinutes, completed: false };
      if (dateTimeValue(candidate.date, candidate.startTime) <= currentTime.getTime()) continue;
      if (avoidBlock && candidate.date === avoidBlock.date && candidate.startTime === avoidBlock.startTime && candidate.durationMinutes === avoidBlock.durationMinutes) continue;
      try {
        assertScheduleBlocksAreValid(userId, [...proposed, candidate], excludedIds);
        return candidate;
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) continue;
        throw error;
      }
    }
  }
  return null;
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

export function previewSchedulingAssistant(
  userId: string,
  intent: SchedulingAssistantIntent,
  currentTime = new Date(),
  selectedBlockId?: string,
): SchedulingAssistantPreview {
  if (intent.type === 'query_schedule') return querySchedulingAssistant(userId, intent, currentTime);
  if (intent.type === 'unsupported') {
    return { intent, changes: [], assistantMessage: 'I can answer schedule questions, move a topic, shorten a session, or help when you are unavailable.' };
  }

  const futureBlocks = futureUncompletedBlocks(userId, currentTime);
  let matches = matchingBlocks(futureBlocks, intent);
  if (selectedBlockId) matches = matches.filter((block) => block.id === selectedBlockId);
  if (matches.length === 0) return { intent, changes: [], assistantMessage: 'I could not find an unfinished future session matching that request.' };
  if ((intent.type === 'move_topic' || intent.type === 'shorten_topic' || intent.type === 'move_time') && matches.length > 1) {
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
      : assistantSlot(
        userId,
        block.topicId,
        block.title,
        shortened,
        startDate,
        intent.type === 'unavailable_period' ? 'morning' : intent.period,
        excludedIds,
        proposed,
        currentTime,
        intent.targetTime,
        intent.type === 'unavailable_period' ? ADAPTIVE_SEARCH_DAYS : 1,
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
    if (block.completed) throw new HttpError(409, 'Completed schedule blocks cannot be moved.');
    return block;
  });
  const candidates = preview.changes.map((change, index) => ({
    topicId: sourceBlocks[index].topicId,
    title: sourceBlocks[index].title,
    date: change.proposed.date,
    startTime: change.proposed.startTime,
    durationMinutes: change.proposed.durationMinutes,
    completed: false,
  }));
  assertScheduleBlocksAreValid(userId, candidates, blockIds);

  const applyAll = getDb().transaction(() => {
    preview.changes.forEach((change, index) => {
      updateScheduleBlock(userId, change.blockId, {
        date: change.proposed.date,
        startTime: change.proposed.startTime,
        durationMinutes: change.proposed.durationMinutes,
      });
      recordScheduleChange(userId, change.blockId, 'conversational_reschedule', JSON.stringify(change.original), JSON.stringify({
        ...change.proposed,
        intent: preview.intent,
        confirmed: true,
      }));
    });
  });
  applyAll([]);
  return scheduleBlockRows(userId);
}
