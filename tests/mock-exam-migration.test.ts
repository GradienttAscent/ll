import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import initSqlJs from 'sql.js';
import { initDatabase, closeDatabase, getDatabase, getDbPath, SCHEMA_VERSION_KEY } from '../db';
import { createMockExam, setDb } from '../services';

// Seeds a database at schema_version 0 that already carries the OLD prototype
// `mock_exams` schema (title/status/config ...) from before the Gemini-graded
// mock exam feature. All migrations then run on top of it: v12's `CREATE TABLE
// IF NOT EXISTS` silently skips the existing legacy table, so v13 must rebuild it.
async function seedLegacyMockDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lazylift-legacy-'));
  process.env.LAZYLIFT_DATA_DIR = dir;
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.run(`INSERT INTO meta (key, value) VALUES ('${SCHEMA_VERSION_KEY}', '0');`);
  db.run(`CREATE TABLE mock_exams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    questions TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '{}',
    score REAL,
    max_score REAL,
    percentage REAL,
    grade TEXT,
    topic_breakdown TEXT,
    ai_advice TEXT,
    question_evaluations TEXT,
    time_left_seconds INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    submitted_at TEXT
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS mock_exam_questions (
    id TEXT PRIMARY KEY,
    mock_exam_id TEXT NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    topic_name TEXT NOT NULL DEFAULT '',
    answer TEXT,
    score REAL NOT NULL DEFAULT 0,
    max_marks REAL NOT NULL DEFAULT 0,
    strengths TEXT NOT NULL DEFAULT '[]',
    improvements TEXT NOT NULL DEFAULT '[]',
    feedback TEXT,
    created_at TEXT NOT NULL
  );`);
  db.run(`INSERT INTO mock_exams
    (id, user_id, title, status, config, questions, answers, time_left_seconds, created_at)
    VALUES ('legacy-exam-1', 'user-1', 'Old Prototype', 'finished', '{}', '[]', '{}', 0, '2026-09-01T00:00:00.000Z');`);
  fs.writeFileSync(getDbPath(), Buffer.from(db.export()));
  db.close();
  return dir;
}

describe('mock exam schema migration (legacy rebuild)', () => {
  let dir: string;

  before(async () => {
    dir = await seedLegacyMockDb();
    await initDatabase();
    setDb(await getDatabase());
  });

  after(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('restores the current mock_exams schema (exam_name present)', async () => {
    const { getDatabase } = await import('../db');
    const db = await getDatabase();
    const rows = db
      .prepare(`SELECT group_concat(name) AS cols FROM pragma_table_info('mock_exams')`)
      .get() as { cols: string };
    const cols = String(rows.cols || '').split(',');
    for (const required of ['id', 'user_id', 'exam_name', 'started_at', 'ended_at', 'duration_seconds', 'total_score', 'total_max', 'percentage', 'grade', 'ai_advice', 'question_count', 'created_at']) {
      assert.ok(cols.includes(required), `mock_exams missing column ${required}`);
    }
    assert.ok(!cols.includes('title'), 'legacy title column should be gone');
  });

  it('preserves the legacy table as mock_exams_legacy', async () => {
    const { getDatabase } = await import('../db');
    const db = await getDatabase();
    const legacy = db
      .prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'mock_exams_legacy'`)
      .get() as { n: number };
    assert.strictEqual(Number(legacy.n), 1);
    const row = db
      .prepare(`SELECT title, status FROM mock_exams_legacy WHERE id = 'legacy-exam-1'`)
      .get() as { title: string; status: string };
    assert.strictEqual(row.title, 'Old Prototype');
    assert.strictEqual(row.status, 'finished');
  });

  it('creates mock_exam_questions and accepts new-schema inserts', async () => {
    const { getDatabase } = await import('../db');
    const db = await getDatabase();
    db
      .prepare(`INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('user-1', 'migration@example.com', 'x', 'Migration', '2026-09-01T00:00:00.000Z');

    const report = {
      perQuestion: [
        { position: 1, questionText: 'Q1', topicName: 'Graphs', answer: 'A', score: 3, maxMarks: 5, strengths: [], improvements: [], feedback: 'ok' },
      ],
      topicBreakdown: [{ topic: 'Graphs', score: 3, maxMarks: 5, mastery: 'Developing' }],
      answeredCount: 1,
      totalScore: 3,
      totalMax: 5,
      percentage: 60,
      grade: 'C',
      advice: 'Keep going.',
    };
    const record = createMockExam('user-1', {
      examName: 'Timed Mock Examination',
      durationSeconds: 2700,
      startedAt: '2026-09-21T08:00:00.000Z',
      endedAt: '2026-09-21T08:45:00.000Z',
      report,
    });
    assert.ok(record.id);
    assert.strictEqual(record.examName, 'Timed Mock Examination');
    assert.strictEqual(record.perQuestion.length, 1);
    assert.strictEqual(record.grade, 'C');
    assert.strictEqual(path.basename(getDbPath()), 'lazylift.db');
  });
});
