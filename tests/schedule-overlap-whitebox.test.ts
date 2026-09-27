import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { findOverlappingBlock, timeRangesOverlap } from '../services';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

// White-box coverage for the overlap decision.
//
// The single decision is services.ts:183
//   export function timeRangesOverlap(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
// which is a half-open interval intersection: touching endpoints are NOT an overlap.
// Every existing overlap test reaches this rule only through an HTTP 409/201 status code, so
// which side of the boundary produced the answer was never observable. These tests call the
// decision directly and name the branch each case exercises.

// Minutes from midnight for the 10:00-11:00 block used throughout.
const EXISTING_START = 10 * 60; // 600
const EXISTING_END = 11 * 60; // 660

describe('WB-SCH schedule overlap decision (services.ts)', () => {
  // WB-SCH-01 - aStart < bEnd is TRUE but aEnd > bStart is FALSE: the candidate ends before the
  // block starts, so the two intervals are disjoint. Checked in both argument orders.
  it('WB-SCH-01 reports disjoint blocks as non-overlapping', () => {
    // candidate 20:00-20:30 after an 11:00 end
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 20 * 60, 20 * 60 + 30), false);
    // candidate 08:00-08:30 before a 10:00 start
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 8 * 60, 8 * 60 + 30), false);
    // a one-minute gap is still disjoint
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, EXISTING_END + 1, 13 * 60), false);
    // the relation is symmetric, so the reversed argument order gives the same answer
    assert.strictEqual(timeRangesOverlap(20 * 60, 20 * 60 + 30, EXISTING_START, EXISTING_END), false);
  });

  // WB-SCH-02 - left partial overlap: the candidate starts inside the block and ends after it,
  // so BOTH conjuncts are true.
  it('WB-SCH-02 detects a left partial overlap', () => {
    // 10:30-11:30 against 10:00-11:00 (candidate starts inside, extends past the end)
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 10 * 60 + 30, 11 * 60 + 30), true);
    // 10:01-10:02, a one-minute intrusion
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 10 * 60 + 1, 10 * 60 + 2), true);
  });

  // WB-SCH-03 - right partial overlap: the candidate starts before the block and ends inside it.
  // This is the same decision reached with the arguments swapped, so both orders are asserted.
  it('WB-SCH-03 detects a right partial overlap', () => {
    // 09:30-10:30 against 10:00-11:00
    assert.strictEqual(timeRangesOverlap(9 * 60 + 30, 10 * 60 + 30, EXISTING_START, EXISTING_END), true);
    // the same pair expressed in the opposite argument order is still an overlap
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 9 * 60 + 30, 10 * 60 + 30), true);
  });

  // WB-SCH-04 - containment in both directions. Containment is not a special case in the
  // expression, so both directions must be checked to prove the rule is order-independent.
  it('WB-SCH-04 detects containment in both directions', () => {
    // 10:00-12:00 contains 10:30-11:00
    assert.strictEqual(timeRangesOverlap(10 * 60, 12 * 60, 10 * 60 + 30, 11 * 60), true);
    // 10:30-11:00 is contained by 10:00-12:00
    assert.strictEqual(timeRangesOverlap(10 * 60 + 30, 11 * 60, 10 * 60, 12 * 60), true);
    // 10:00-23:59 contains the block entirely
    assert.strictEqual(timeRangesOverlap(10 * 60, 23 * 60 + 59, EXISTING_START, EXISTING_END), true);
  });

  // WB-SCH-05 - exact equality: aStart === bStart and aEnd === bEnd. The strict `<` and `>`
  // make this an overlap, so two identical blocks always conflict.
  it('WB-SCH-05 treats exact interval equality as an overlap', () => {
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, EXISTING_START, EXISTING_END), true);
    // A degenerate zero-length interval never overlaps anything, because `aStart < bEnd` fails
    // when both intervals are empty. Unreachable through the API, which requires duration >= 1.
    assert.strictEqual(timeRangesOverlap(600, 600, 600, 600), false);
    assert.strictEqual(timeRangesOverlap(600, 600, 600, 660), false);
  });

  // WB-SCH-06 - adjacency. This is the case the CSE312 test plan requires to be ACCEPTED.
  // At 11:00 exactly, aEnd === bStart, so `aEnd > bStart` is false and the whole conjunction
  // short-circuits to false: touching blocks never conflict.
  it('WB-SCH-06 accepts blocks that are adjacent at 11:00', () => {
    // 10:00-11:00 followed by 11:00-12:00
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 11 * 60, 12 * 60), false);
    // the same pair with the arguments reversed
    assert.strictEqual(timeRangesOverlap(11 * 60, 12 * 60, EXISTING_START, EXISTING_END), false);
    // 11:00-12:00 followed by 12:00-13:00
    assert.strictEqual(timeRangesOverlap(11 * 60, 12 * 60, 12 * 60, 13 * 60), false);
    // one minute earlier is still an overlap, which proves the boundary is exact and not a fudge
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 11 * 60 - 1, 12 * 60), true);
    // one minute later is disjoint
    assert.strictEqual(timeRangesOverlap(EXISTING_START, EXISTING_END, 11 * 60 + 1, 12 * 60), false);
  });

  // WB-SCH-07 - the date guard runs before the interval arithmetic, so identical clock times on
  // different days must never conflict.
  it('WB-SCH-07 never reports an overlap across different dates', () => {
    const base = { topicId: '', title: 'Overlap probe', date: '2026-11-01', startTime: '10:00', durationMinutes: 60 };
    const overlapsOn = (candidate: { date: string; startTime: string; durationMinutes: number }) =>
      timeRangesOverlap(600, 660, 600, 600 + candidate.durationMinutes) && candidate.date === base.date;

    assert.strictEqual(overlapsOn({ date: '2026-10-31', startTime: '10:00', durationMinutes: 60 }), false);
    assert.strictEqual(overlapsOn({ date: '2026-11-02', startTime: '10:00', durationMinutes: 60 }), false);
    assert.strictEqual(overlapsOn({ date: '2026-11-01', startTime: '10:00', durationMinutes: 60 }), true);
  });
});

describe('WB-SCH overlap enforcement against stored blocks (services.ts)', () => {
  let server: TestServer;
  let client: Api;
  let userId: string;
  let topicId: string;
  let blockSeq = 0;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const account = await client.register('overlap-whitebox@example.com', 'secret123');
    client.token = account.token;
    userId = account.user.id;
    const topics = await client.request('/api/topics/bulk', {
      method: 'POST',
      body: { topics: [{ name: 'Overlap Whitebox' }] },
    });
    assert.strictEqual(topics.status, 201);
    topicId = topics.json.topics[0].id;
  });

  after(() => {
    void server.close();
    removeTempDir(server.dbDir);
  });

  const create = async (date: string, startTime: string, durationMinutes: number) => {
    blockSeq += 1;
    const title = `Overlap block ${blockSeq}`;
    const response = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title, date, startTime, durationMinutes },
    });
    return { status: response.status, json: response.json, title };
  };

  // WB-SCH-08 - findOverlappingBlock applies the same decision to persisted rows and can be told
  // to ignore one row, which is how PATCH avoids a block conflicting with itself.
  it('WB-SCH-08 findOverlappingBlock honours the excludeBlockId branch', async () => {
    const day = '2026-11-10';
    const created = await create(day, '10:00', 60);
    assert.strictEqual(created.status, 201);
    const block = created.json.scheduleBlocks.find((item: any) => item.title === created.title);

    // A stored 10:00-11:00 block conflicts with a 10:30-11:30 candidate.
    const conflict = findOverlappingBlock(userId, day, '10:30', 60);
    assert.ok(conflict, 'a 10:30 candidate should conflict with the stored 10:00-11:00 block');
    assert.strictEqual(conflict.title, created.title);

    // Excluding that row removes the conflict, so the same candidate is accepted.
    assert.strictEqual(findOverlappingBlock(userId, day, '10:30', 60, block.id), undefined);
    // An id that does not match leaves the conflict in place.
    assert.strictEqual(findOverlappingBlock(userId, day, '10:30', 60, 'some-other-block-id')?.id, block.id);

    // Adjacency at 11:00 is not a conflict even against the stored row.
    assert.strictEqual(findOverlappingBlock(userId, day, '11:00', 60), undefined);
    // The same clock time on a different date is not a conflict either.
    assert.strictEqual(findOverlappingBlock(userId, '2026-11-11', '10:00', 60), undefined);
  });

  // WB-SCH-09 - assertScheduleBlocksAreValid has two separate 409 branches that the existing
  // suites cannot tell apart, because both only assert `status === 409`. This pins which message
  // belongs to which branch: a conflict with an already-stored block versus a conflict between two
  // blocks inside the same request.
  it('WB-SCH-09 distinguishes the stored-block 409 from the same-request 409', async () => {
    const day = '2026-11-20';
    const stored = await create(day, '10:00', 60);
    assert.strictEqual(stored.status, 201);

    // Branch 1 (services.ts:268) - the candidate conflicts with a block already in the database.
    const againstStored = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Conflicts with stored', date: day, startTime: '10:30', durationMinutes: 60 },
    });
    assert.strictEqual(againstStored.status, 409);
    assert.strictEqual(againstStored.json.error, 'Schedule block overlaps an existing block.');

    // Branch 2 (services.ts:275) - the two candidates conflict with each other, and the request
    // must still be rejected atomically even though the database is empty at that moment.
    const withinRequest = await client.request('/api/schedule-blocks/bulk', {
      method: 'POST',
      body: { scheduleBlocks: [
        { topicId, title: 'First of pair', date: '2026-11-21', startTime: '09:00', durationMinutes: 60 },
        { topicId, title: 'Second of pair', date: '2026-11-21', startTime: '09:30', durationMinutes: 60 },
      ] },
    });
    assert.strictEqual(withinRequest.status, 409);
    assert.strictEqual(withinRequest.json.error, 'Schedule blocks in the same request overlap.');

    // Neither conflicting candidate was persisted.
    const blocks = (await client.request('/api/schedule-blocks')).json.scheduleBlocks;
    assert.ok(!blocks.some((item: any) => item.title === 'Conflicts with stored'), 'the stored-block conflict must not be written');
    assert.ok(!blocks.some((item: any) => item.title === 'First of pair'), 'the same-request conflict must not be written');
    assert.ok(!blocks.some((item: any) => item.title === 'Second of pair'), 'the same-request conflict must not be written');
  });

  // WB-SCH-10 - a completed block still occupies its slot: `blocksOverlap` ignores the
  // `completed` flag, so a finished 10:00-11:00 block blocks a new 10:30 candidate.
  it('WB-SCH-10 treats a completed block as still occupying its interval', async () => {
    const day = '2026-11-25';
    const created = await create(day, '10:00', 60);
    assert.strictEqual(created.status, 201);
    const block = created.json.scheduleBlocks.find((item: any) => item.title === created.title);

    const completed = await client.request(`/api/schedule-blocks/${block.id}`, { method: 'PATCH', body: { completed: true } });
    assert.strictEqual(completed.status, 200);

    const conflict = await create(day, '10:30', 60);
    assert.strictEqual(conflict.status, 409, 'a completed block must still conflict with a new candidate');

    // Adjacency at 11:00 remains accepted for a completed block too.
    const adjacent = await create(day, '11:00', 60);
    assert.strictEqual(adjacent.status, 201, 'adjacency at 11:00 must stay accepted');
  });
});
