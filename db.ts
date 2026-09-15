import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

export const DEFAULT_COURSE_ID = 'course-demo';
export const SCHEMA_VERSION_KEY = 'schema_version';

let SQL: any;
let database: SqlJsDatabase | null = null;

export function getDataDirectory(): string {
  return process.env.LAZYLIFT_DATA_DIR
    ? path.resolve(process.env.LAZYLIFT_DATA_DIR)
    : path.join(process.cwd(), 'data');
}

export function getDbPath(): string {
  return path.join(getDataDirectory(), 'lazylift.db');
}

function tableExists(db: SqlJsDatabase, name: string): boolean {
  const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`);
  stmt.bind([name]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function pragmaTableInfo(db: SqlJsDatabase, table: string): Array<{ name: string }> {
  const results = db.exec(`PRAGMA table_info(${table})`);
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  const nameIndex = columns.indexOf('name');
  return values.map((row) => ({ name: row[nameIndex] }));
}

function queryOne(db: SqlJsDatabase, sql: string, params: any[] = []): any | undefined {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row: any | undefined;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function rebuildTopicsWithUserId(db: SqlJsDatabase) {
  db.run('ALTER TABLE topics RENAME TO topics_legacy;');
  db.run(`CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id),
    name TEXT NOT NULL,
    priority INTEGER NOT NULL,
    weightage REAL NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`);
  db.run(`INSERT INTO topics (id, user_id, course_id, name, priority, weightage, source, created_at)
    SELECT id, '', course_id, name, priority, weightage, source, created_at FROM topics_legacy;`);
  db.run('DROP TABLE topics_legacy;');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_user_course_name ON topics(user_id, course_id, name);');
}

export interface Migration {
  version: number;
  name: string;
  up: (db: SqlJsDatabase) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'auth-multi-user-isolation',
    up: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`);

      if (!tableExists(db, 'topics')) {
        db.run(`CREATE TABLE topics (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id TEXT NOT NULL REFERENCES courses(id),
          name TEXT NOT NULL,
          priority INTEGER NOT NULL,
          weightage REAL NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL
        );`);
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_user_course_name ON topics(user_id, course_id, name);');
      } else if (!pragmaTableInfo(db, 'topics').some((column) => column.name === 'user_id')) {
        rebuildTopicsWithUserId(db);
      } else {
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_user_course_name ON topics(user_id, course_id, name);');
      }

      if (!tableExists(db, 'schedule_blocks')) {
        db.run(`CREATE TABLE schedule_blocks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );`);
      } else if (!pragmaTableInfo(db, 'schedule_blocks').some((column) => column.name === 'user_id')) {
        db.run("ALTER TABLE schedule_blocks ADD COLUMN user_id TEXT NOT NULL DEFAULT '' REFERENCES users(id);");
      }

      if (!tableExists(db, 'study_sessions')) {
        db.run(`CREATE TABLE study_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          schedule_block_id TEXT NOT NULL REFERENCES schedule_blocks(id) ON DELETE CASCADE,
          started_at TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          actual_duration_seconds INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          ended_at TEXT,
          created_at TEXT NOT NULL
        );`);
      } else {
        const sessionColumns = pragmaTableInfo(db, 'study_sessions').map((column) => column.name);
        if (!sessionColumns.includes('user_id')) {
          db.run("ALTER TABLE study_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT '' REFERENCES users(id);");
        }
        if (!sessionColumns.includes('ended_at')) {
          db.run('ALTER TABLE study_sessions ADD COLUMN ended_at TEXT;');
        }
        if (!sessionColumns.includes('actual_duration_seconds')) {
          db.run('ALTER TABLE study_sessions ADD COLUMN actual_duration_seconds INTEGER NOT NULL DEFAULT 0;');
        }
        if (!sessionColumns.includes('created_at')) {
          db.run("ALTER TABLE study_sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT '';");
          db.run("UPDATE study_sessions SET created_at = started_at WHERE created_at = '';");
        }
      }

      db.run(`CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        doc_type TEXT NOT NULL DEFAULT 'Past Paper',
        content TEXT,
        file_size TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
        question_text TEXT NOT NULL,
        marks INTEGER NOT NULL DEFAULT 10,
        question_type TEXT NOT NULL DEFAULT 'Subjective',
        source TEXT NOT NULL DEFAULT 'extracted',
        suggested_time_minutes INTEGER NOT NULL DEFAULT 15,
        created_at TEXT NOT NULL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
        score REAL NOT NULL,
        max_marks REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'gemini',
        strengths TEXT NOT NULL DEFAULT '[]',
        improvements TEXT NOT NULL DEFAULT '[]',
        feedback_text TEXT,
        model_answer_snippet TEXT,
        created_at TEXT NOT NULL
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS schedule_changes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        block_id TEXT NOT NULL REFERENCES schedule_blocks(id) ON DELETE CASCADE,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TEXT NOT NULL
      );`);

      db.run('INSERT OR IGNORE INTO courses (id, name, created_at) VALUES (?, ?, ?)', [
        DEFAULT_COURSE_ID,
        'Demo Academic Course',
        new Date().toISOString(),
      ]);
    },
  },
  {
    version: 2,
    name: 'schedule-change-reason-and-session-feedback',
    up: (db) => {
      if (!pragmaTableInfo(db, 'schedule_changes').some((column) => column.name === 'reason')) {
        db.run('ALTER TABLE schedule_changes ADD COLUMN reason TEXT;');
      }
      const feedbackColumns = pragmaTableInfo(db, 'feedback').map((column) => column.name);
      if (!feedbackColumns.includes('session_id')) {
        db.run('ALTER TABLE feedback ADD COLUMN session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL;');
      }
      if (!feedbackColumns.includes('focus')) {
        db.run('ALTER TABLE feedback ADD COLUMN focus REAL;');
      }
      if (!feedbackColumns.includes('difficulty')) {
        db.run('ALTER TABLE feedback ADD COLUMN difficulty TEXT;');
      }
      if (!feedbackColumns.includes('perceived_progress')) {
        db.run('ALTER TABLE feedback ADD COLUMN perceived_progress INTEGER;');
      }
      if (!feedbackColumns.includes('notes')) {
        db.run('ALTER TABLE feedback ADD COLUMN notes TEXT;');
      }
    },
  },
];

function getMeta(db: SqlJsDatabase, key: string): string | undefined {
  const row = queryOne(db, 'SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value;
}

function setMeta(db: SqlJsDatabase, key: string, value: string) {
  db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

function runMigrations(db: SqlJsDatabase) {
  db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  let currentVersion = Number(getMeta(db, SCHEMA_VERSION_KEY)) || 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    db.run('BEGIN');
    try {
      migration.up(db);
      setMeta(db, SCHEMA_VERSION_KEY, String(migration.version));
      db.run('COMMIT');
      currentVersion = migration.version;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }
}

export async function initDatabase() {
  if (database) return database;

  if (!SQL) SQL = await initSqlJs();
  const dataDirectory = getDataDirectory();
  fs.mkdirSync(dataDirectory, { recursive: true });

  const file = getDbPath();
  if (fs.existsSync(file)) {
    database = new SQL.Database(fs.readFileSync(file));
  } else {
    database = new SQL.Database();
  }

  database.run('PRAGMA foreign_keys = OFF;');
  runMigrations(database);
  database.run('PRAGMA foreign_keys = ON;');
  saveDatabase();

  return database;
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = null;
  }
}

export function saveDatabase() {
  if (!database) return;
  const data = database.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
}

export class DatabaseWrapper {
  private db: SqlJsDatabase;
  private transactionDepth = 0;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  prepare(sql: string) {
    const db = this.db;
    const wrapper = this;
    return {
      run: (...params: any[]) => {
        const bindParams =
          params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
            ? params[0]
            : params;
        const stmt = db.prepare(sql);
        try {
          stmt.bind(bindParams);
          stmt.step();
          if (wrapper.transactionDepth === 0) saveDatabase();
          return { changes: 1 };
        } catch (e) {
          throw e;
        } finally {
          stmt.free();
        }
      },
      get: (...params: any[]) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all: (...params: any[]) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results: any[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  }

  transaction(fn: (items: any[]) => void) {
    return (items: any[]) => {
      this.db.run('BEGIN TRANSACTION');
      this.transactionDepth += 1;
      try {
        fn(items);
        this.db.run('COMMIT');
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      } finally {
        this.transactionDepth -= 1;
        saveDatabase();
      }
    };
  }
}

export async function getDatabase() {
  if (!database) {
    await initDatabase();
  }
  return new DatabaseWrapper(database!);
}