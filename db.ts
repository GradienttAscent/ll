import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const dataDirectory = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDirectory, 'lazylift.db');

export const DEFAULT_COURSE_ID = 'course-demo';

let SQL: any;
let database: SqlJsDatabase | null = null;

// Initialize sql.js and load/create database
export async function initDatabase() {
  if (database) return database;

  SQL = await initSqlJs();
  fs.mkdirSync(dataDirectory, { recursive: true });

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileContent = fs.readFileSync(dbPath);
    database = new SQL.Database(fileContent);
  } else {
    database = new SQL.Database();
  }

  // Create tables
  database.run(`
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

  // Insert default course
  try {
    database.run(
      'INSERT OR IGNORE INTO courses (id, name, created_at) VALUES (?, ?, ?)',
      [DEFAULT_COURSE_ID, 'Demo Academic Course', new Date().toISOString()]
    );
  } catch (e) {
    // Ignore if it already exists
  }

  return database;
}

// Wrapper to save database to disk
export function saveDatabase() {
  if (!database) return;
  const data = database.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Create a wrapper object that mimics better-sqlite3 interface
export class DatabaseWrapper {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  prepare(sql: string) {
    const db = this.db;
    return {
      run: (...params: any[]) => {
        try {
          db.run(sql, params);
          saveDatabase();
          return { changes: 1 };
        } catch (e) {
          throw e;
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
      try {
        fn(items);
        this.db.run('COMMIT');
        saveDatabase();
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
    };
  }

  exec(sql: string) {
    this.db.run(sql);
    saveDatabase();
  }
}

export async function getDatabase() {
  if (!database) {
    await initDatabase();
  }
  return new DatabaseWrapper(database!);
}
