import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDirectory = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, 'lazylift.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id),
    name TEXT NOT NULL,
    priority INTEGER NOT NULL,
    weightage REAL NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(course_id, name)
  );
  CREATE TABLE IF NOT EXISTS schedule_blocks (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES topics(id),
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    schedule_block_id TEXT NOT NULL REFERENCES schedule_blocks(id),
    started_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL
  );
`);

const DEFAULT_COURSE_ID = 'course-demo';
db.prepare('INSERT OR IGNORE INTO courses (id, name, created_at) VALUES (?, ?, ?)')
  .run(DEFAULT_COURSE_ID, 'Demo Academic Course', new Date().toISOString());

export { db, DEFAULT_COURSE_ID };
