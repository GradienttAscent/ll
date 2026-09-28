import crypto from 'node:crypto';
import { getDb } from './services';
import { createId, now } from './utils';

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export function hashPassword(password: string): { stored: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return { stored: `scrypt:${SCRYPT_KEYLEN}:${salt}:${derived.toString('hex')}` };
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const keylen = Number(parts[1]);
  if (!Number.isInteger(keylen) || keylen <= 0) return false;
  const expected = Buffer.from(parts[3], 'hex');
  const actual = crypto.scryptSync(password, parts[2], keylen);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId: string): string {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  getDb().prepare(`INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`).run(createId('session'), userId, tokenHash, now(), expiresAt);
  return token;
}

export function registerUser(input: { email: string; password: string; displayName?: string }): { token: string; user: AuthUser } {
  const email = String(input.email).trim().toLowerCase();
  const displayName = String(input.displayName || '').trim();
  const id = createId('user');
  const { stored } = hashPassword(input.password);
  getDb().prepare(`INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(id, email, stored, displayName, now());
  const token = createSession(id);
  return { token, user: { id, email, displayName, createdAt: now() } };
}

export function loginUser(input: { email: string; password: string }): { token: string; user: AuthUser } | null {
  const email = String(input.email || '').trim().toLowerCase();
  const row = getDb().prepare(`SELECT id, email, password_hash AS passwordHash, display_name AS displayName, created_at AS createdAt
    FROM users WHERE email = ?`).get(email) as any | undefined;
  if (!row || !verifyPassword(String(input.password || ''), row.passwordHash)) return null;
  const user: AuthUser = { id: row.id, email: row.email, displayName: row.displayName || '', createdAt: row.createdAt };
  const token = createSession(user.id);
  return { token, user };
}

export function logoutUser(token: string) {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function getSessionUser(token: string): AuthUser | null {
  const row = getDb().prepare(`SELECT u.id, u.email, u.display_name AS displayName, u.created_at AS createdAt
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`)
    .get(hashToken(token), now()) as any | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.displayName || '', createdAt: row.createdAt };
}
