import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { getDatabase } from '../db';
import { generateToken, getSessionUser, hashPassword, hashToken, registerUser, verifyPassword } from '../auth';
import { extractPdfText } from '../pdfText';
import { computeStudyStreak } from '../services';
import { createTestServer, removeTempDir, type TestServer } from './helpers';

// Fills the remaining white-box gaps in three small modules that the HTTP-level
// suites only ever reach on their happy path: the auth crypto helpers, the PDF
// text extractor's internals, and the two branches of computeStudyStreak that the
// existing streak suite does not exercise.
describe('GAP auth crypto helpers (auth.ts)', () => {
  // AUTH-01 - hashPassword uses a fresh 16-byte random salt per call, so the stored
  // string is not reproducible, but both hashes still verify the same password.
  it('AUTH-01 salts every hash and still verifies the original password', () => {
    const first = hashPassword('secret123').stored;
    const second = hashPassword('secret123').stored;
    assert.notStrictEqual(first, second);
    for (const stored of [first, second]) {
      assert.strictEqual(stored.split(':').length, 4);
      assert.strictEqual(stored.split(':')[0], 'scrypt');
      assert.strictEqual(stored.split(':')[1], '64');
      assert.strictEqual(Buffer.from(stored.split(':')[3], 'hex').length, 64);
      assert.strictEqual(verifyPassword('secret123', stored), true);
      assert.strictEqual(verifyPassword('secret124', stored), false);
    }
  });

  // AUTH-02 - every early rejection in verifyPassword. The HTTP suite can only ever
  // present a well-formed scrypt hash, so these guards are otherwise unreachable.
  it('AUTH-02 rejects malformed stored hashes without throwing', () => {
    const salt = 'a'.repeat(32);
    const digest = 'b'.repeat(128);
    const malformed: Array<[string, string]> = [
      ['too few parts', `scrypt:64:${salt}`],
      ['too many parts', `scrypt:64:${salt}:${digest}:extra`],
      ['unknown algorithm', `bcrypt:64:${salt}:${digest}`],
      ['non-numeric keylen', `scrypt:abc:${salt}:${digest}`],
      ['fractional keylen', `scrypt:64.5:${salt}:${digest}`],
      ['zero keylen', `scrypt:0:${salt}:${digest}`],
      ['negative keylen', `scrypt:-8:${salt}:${digest}`],
      // The declared keylen disagrees with the stored digest length.
      ['keylen shorter than digest', `scrypt:32:${salt}:${digest}`],
      ['keylen longer than digest', `scrypt:128:${salt}:${digest}`],
    ];
    for (const [label, stored] of malformed) {
      assert.strictEqual(verifyPassword('secret123', stored), false, label);
    }
  });

  // AUTH-03 - the length guard must reject before timingSafeEqual, which throws on
  // mismatched buffer sizes.
  it('AUTH-03 compares equal-length buffers only', () => {
    const { stored } = hashPassword('secret123');
    const [scheme, keylen, salt] = stored.split(':');
    const actual = crypto.scryptSync('secret123', salt, Number(keylen));
    assert.strictEqual(verifyPassword('secret123', `scrypt:${keylen}:${salt}:${actual.toString('hex')}`), true);
    // Same length, different bytes -> a clean false rather than a throw.
    const tampered = Buffer.from(actual);
    tampered[0] ^= 0xff;
    assert.strictEqual(verifyPassword('secret123', `${scheme}:${keylen}:${salt}:${tampered.toString('hex')}`), false);
    // Truncated digest -> rejected by the length guard.
    assert.strictEqual(verifyPassword('secret123', `${scheme}:${keylen}:${salt}:${actual.subarray(0, 32).toString('hex')}`), false);
  });

  // AUTH-04 - session token helpers.
  it('AUTH-04 issues unique 32-byte tokens and hashes them as sha256', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));
    assert.strictEqual(tokens.size, 50);
    for (const token of tokens) assert.match(token, /^[0-9a-f]{64}$/);
    const token = 'fixed-token-value';
    assert.strictEqual(hashToken(token), crypto.createHash('sha256').update(token).digest('hex'));
    assert.strictEqual(hashToken(token), hashToken(token));
    assert.notStrictEqual(hashToken(token), hashToken('another-token'));
    // The raw token is never what gets stored.
    assert.notStrictEqual(hashToken(token), token);
  });

  // AUTH-05 - getSessionUser is the token -> user lookup. The HTTP suites exercise it
  // only indirectly through the auth middleware, and never on the expired or unknown
  // token paths.
  it('AUTH-05 resolves a live session and rejects an unknown or expired one', async () => {
    const server = await createTestServer();
    try {
      const { token, user } = registerUser({ email: '  AUTH-05@Example.COM ', password: 'secret123', displayName: 'Auth Five' });
      const resolved = getSessionUser(token);
      assert.ok(resolved);
      // The email is trimmed and lower-cased on the way in.
      assert.strictEqual(resolved.email, 'auth-05@example.com');
      assert.strictEqual(resolved.id, user.id);
      assert.strictEqual(resolved.displayName, 'Auth Five');
      // DEFECT-AUTH-01: registerUser calls now() twice (once for the INSERT, once for
      // the returned AuthUser), so the createdAt handed back by the register response
      // is not the value that was persisted. The lookup returns the stored one.
      const db = await getDatabase();
      const stored = db.prepare('SELECT created_at AS createdAt FROM users WHERE id = ?').get(user.id) as { createdAt: string };
      assert.strictEqual(resolved.createdAt, stored.createdAt);
      assert.notStrictEqual(user.createdAt, stored.createdAt);
      // An unknown token has no row.
      assert.strictEqual(getSessionUser('not-a-real-token'), null);
      // A stored row whose expires_at is in the past is rejected by the query itself.
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
        .run(new Date(Date.now() - 1000).toISOString(), hashToken(token));
      assert.strictEqual(getSessionUser(token), null);
      // A blank display name is normalised to an empty string, not left undefined.
      const blank = registerUser({ email: 'blank-name@example.com', password: 'secret123' });
      assert.strictEqual(getSessionUser(blank.token)?.displayName, '');
    } finally {
      await server.close();
      removeTempDir(server.dbDir);
    }
  });
});

// Builds a minimal single-stream PDF carrying the supplied content stream body.
function pdf(stream: string, dict = ''): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< ${dict}/Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, 'latin1');
}

const SHORT_TEXT_ERROR = 'No readable text was found in this PDF. Upload a text-based PDF or configure GEMINI_API_KEY for OCR analysis.';

describe('GAP PDF text extraction (pdfText.ts)', () => {
  // PDF-01 - the raw (uncompressed) source is searched first, so a plain Tj works.
  it('PDF-01 extracts a single Tj run', () => {
    const text = extractPdfText(pdf('BT (Question one explains breadth first traversal) Tj ET'));
    assert.strictEqual(text, 'Question one explains breadth first traversal');
  });

  // PDF-02 - the 20-character floor. The error text names the OCR fallback rather
  // than returning an empty string, so callers cannot mistake it for real content.
  it('PDF-02 throws a named OCR error below the 20 character floor', () => {
    assert.throws(() => extractPdfText(pdf('BT (nope) Tj ET')), (error: Error) => {
      assert.strictEqual(error.message, SHORT_TEXT_ERROR);
      return true;
    });
    // Exactly at the boundary the text is accepted.
    const exactly20 = 'abcdefghijklmnopqrst';
    assert.strictEqual(exactly20.length, 20);
    assert.strictEqual(extractPdfText(pdf(`BT (${exactly20}) Tj ET`)), exactly20);
  });

  // PDF-03 - a TJ array concatenates its runs, which is how kerned glyphs arrive.
  it('PDF-03 concatenates the runs inside a TJ array', () => {
    assert.strictEqual(extractPdfText(pdf('BT [(Question) -250 (one) -250 (explains) -250 (BFS)] TJ ET')), 'QuestiononeexplainsBFS');
  });

  // PDF-04 - ET/Td/TD/Tm each start a new physical line, and runs sharing a line
  // are concatenated in document order.
  it('PDF-04 groups runs into lines on the text-positioning operators', () => {
    assert.strictEqual(extractPdfText(pdf('BT (Q1) Tj ( explains) Tj ET BT (Q2) Tj ( explains) Tj ET')), 'Q1 explains\nQ2 explains');
    assert.strictEqual(extractPdfText(pdf('BT 1 0 0 1 0 0 Tm (alpha line of text) Tj 1 0 0 1 0 14 Tm (beta line of text) Tj ET')), 'alpha line of text\nbeta line of text');
    assert.strictEqual(extractPdfText(pdf('BT (gamma line of text) Tj 0 -14 Td (delta line of text) Tj ET')), 'gamma line of text\ndelta line of text');
  });

  // PDF-05 - DEFECT-PDF-01: `PDF_LINE_BREAK` lists `T\*` (next-line show text) but the
  // trailing `\b` cannot match after the non-word `*`, so `Tj T*` runs are glued
  // together with no separator and the two lines merge into one run of text.
  it('PDF-05 documents that T* does not start a new line', () => {
    assert.strictEqual(extractPdfText(pdf('BT /F1 12 Tf 14 TL (first line of text) Tj T* (second line of text) Tj ET')), 'first line of textsecond line of text');
    // The other positioning operators in the same list do break the line.
    assert.strictEqual(extractPdfText(pdf('BT /F1 12 Tf 14 TL (first line of text) Tj 0 -14 TD (second line of text) Tj ET')), 'first line of text\nsecond line of text');
  });

  // PDF-06 - PDF string escapes, including octal, are decoded. Note the decoded tab
  // is then collapsed to a space by the `[\t ]+` normalisation in pdfLineSegments.
  it('PDF-06 decodes escaped characters and octal codes in PDF strings', () => {
    assert.strictEqual(extractPdfText(pdf('BT (line one\\nline two is long enough here) Tj ET')), 'line one\nline two is long enough here');
    assert.strictEqual(extractPdfText(pdf('BT (tab\\there and enough text to pass) Tj ET')), 'tab here and enough text to pass');
    assert.strictEqual(extractPdfText(pdf('BT (a \\(parenthesised\\) string here) Tj ET')), 'a (parenthesised) string here');
    assert.strictEqual(extractPdfText(pdf('BT (octal \\101\\102\\103 is ABC here) Tj ET')), 'octal ABC is ABC here');
  });

  // PDF-07 - DEFECT-PDF-02: the run pattern `\((?:\\.|[^\\)])*\)\s*Tj` treats an
  // escaped `\)` inside a string as the closing delimiter, so the remainder of the
  // string is lexed as a second run and glued on with no separator.
  it('PDF-07 documents that an escaped closing paren splits the run', () => {
    assert.strictEqual(extractPdfText(pdf('BT (a \\(b) Tj (tail of the string) Tj ET')), 'a (btail of the string');
    // Without the escape the same text lexes correctly.
    assert.strictEqual(extractPdfText(pdf('BT (a (b) Tj (tail of the string) Tj ET')), 'a (btail of the string');
  });

  // PDF-08 - a FlateDecode stream is inflated and searched alongside the raw bytes.
  it('PDF-08 inflates a FlateDecode content stream', () => {
    const body = 'BT (compressed question text is readable) Tj ET';
    const compressed = deflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    assert.strictEqual(extractPdfText(pdf(compressed, '/Filter /FlateDecode ')), 'compressed question text is readable');
  });

  // PDF-09 - an unreadable stream is skipped rather than aborting the extraction,
  // so a damaged object cannot hide the readable text elsewhere in the file.
  it('PDF-09 skips a corrupt FlateDecode stream and keeps the readable text', () => {
    const raw = `%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length 12 >>\nstream\n\x00\x01\x02not-deflate\nendstream\n2 0 obj\n<< /Length 44 >>\nstream\nBT (surviving readable question text) Tj ET\nendstream\n%%EOF`;
    assert.strictEqual(extractPdfText(Buffer.from(raw, 'latin1')), 'surviving readable question text');
  });

  // PDF-10 - runs of tabs/spaces inside a line collapse, and blank segments are dropped.
  it('PDF-10 collapses horizontal whitespace and drops empty segments', () => {
    assert.strictEqual(extractPdfText(pdf('BT (lots     of\t\tspaces here in this line) Tj ET')), 'lots of spaces here in this line');
    assert.strictEqual(extractPdfText(pdf('BT () Tj (   ) Tj (only real text survives here) Tj ET')), 'only real text survives here');
  });
});

describe('GAP study streak branches (services.ts computeStudyStreak)', () => {
  let server: TestServer;
  let seq = 0;

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  const nextUser = () => `gap-streak-${(seq += 1)}`;

  // Creates a real schedule block and a completed session on it, then rewrites the
  // timestamps. Going through the tables directly is what lets ended_at be NULL,
  // which the HTTP session endpoints never produce.
  async function seedCompleted(userId: string, startedAt: string, endedAt: string | null): Promise<void> {
    const db = await getDatabase();
    const blockId = `gap-block-${(seq += 1)}`;
    db.prepare(`INSERT INTO schedule_blocks
      (id, user_id, topic_id, title, date, start_time, duration_minutes, completed, created_at)
      VALUES (?, ?, ?, 'Gap block', '2099-01-01', '08:00', 30, 0, ?)`)
      .run(blockId, userId, `gap-topic-${userId}`, startedAt);
    db.prepare(`INSERT INTO study_sessions
      (id, user_id, schedule_block_id, started_at, ended_at, duration_minutes, actual_duration_seconds, status, active_since, created_at)
      VALUES (?, ?, ?, ?, ?, 30, 1800, 'completed', ?, ?)`)
      .run(`gap-sess-${blockId}`, userId, blockId, startedAt, endedAt, startedAt, startedAt);
  }

  // STREAK-01 - computeStudyStreak falls back to started_at when ended_at is NULL.
  it('STREAK-01 attributes an unfinished session by its start time', async () => {
    const userId = nextUser();
    const now = new Date();
    const dayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
    await seedCompleted(userId, `${dayKey}T12:00:00.000Z`, null);
    assert.deepStrictEqual(computeStudyStreak(userId, 0), { current: 1, longest: 1 });
  });

  // STREAK-02 - a zero current streak is reported when neither today nor yesterday
  // was studied, while the longest run is still derived from history.
  it('STREAK-02 reports a zero current streak when the last study is older than yesterday', async () => {
    const userId = nextUser();
    const stale = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await seedCompleted(userId, stale, stale);
    const streak = computeStudyStreak(userId, 0);
    assert.strictEqual(streak.current, 0);
    assert.strictEqual(streak.longest, 1);
  });

  // STREAK-03 - the existing suite only ever passes offsets 0 and +60, so the
  // negative-offset (UTC+ zones) direction is uncovered. Two sessions either side of
  // the UTC midnight boundary are two local days at offset 0 but one day at -60.
  it('STREAK-03 splits day attribution for a negative timezone offset', async () => {
    const userId = nextUser();
    const now = new Date();
    const boundary = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 30 * 60 * 1000;
    const before = new Date(boundary).toISOString();
    const after = new Date(boundary + 60 * 60 * 1000).toISOString();
    await seedCompleted(userId, before, before);
    await seedCompleted(userId, after, after);
    // UTC: the two sessions fall on consecutive calendar days, so the streak is 2.
    assert.strictEqual(computeStudyStreak(userId, 0).longest, 2);
    // UTC+1: both sessions move onto the same local day, so the streak collapses to 1.
    const localDay = (iso: string) => new Date(new Date(iso).getTime() + 60 * 60_000).toISOString().slice(0, 10);
    assert.strictEqual(localDay(before), localDay(after));
    assert.strictEqual(computeStudyStreak(userId, -60).longest, 1);
  });
});
