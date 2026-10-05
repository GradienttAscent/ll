import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';

let server: TestServer;

async function createClient(emailPrefix = 'wts'): Promise<{ client: Api; userId: string }> {
  const client = new Api(server.baseUrl);
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { token, user } = await client.register(email, 'secret123');
  client.token = token;
  return { client, userId: user.id };
}

describe("TEACHER'S EXAM INTELLIGENCE — What to Study & Calendar Loop", () => {
  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('requires authentication for /api/academic/what-to-study', async () => {
    const anon = new Api(server.baseUrl);
    const res = await anon.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 401);
  });

  it('returns empty whatToStudy array for fresh account with no documents', async () => {
    const { client } = await createClient('fresh-wts');
    const res = await client.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.json.whatToStudy, []);
  });

  it('loads sample course pack and correctly identifies, clusters, ranks, and maps questions', async () => {
    const { client } = await createClient('os-student');

    // Load sample course pack
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    assert.strictEqual(loadRes.status, 201);
    assert.ok(Array.isArray(loadRes.json.whatToStudy));
    assert.ok(loadRes.json.whatToStudy.length >= 2);

    const items = loadRes.json.whatToStudy;

    // 1. Verify "Explain Deadlock Detection"
    const deadlockItem = items.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('deadlock') && item.conceptTitle.toLowerCase().includes('detection')
    );
    assert.ok(deadlockItem, 'Expected Deadlock Detection item to be present');
    assert.strictEqual(deadlockItem.priorityTag, 'HIGH PRIORITY');
    assert.strictEqual(deadlockItem.appearanceCount, 4);
    assert.ok(deadlockItem.distinctYearsCount >= 3);
    assert.ok(deadlockItem.unitTopic.toLowerCase().includes('deadlock'));

    // Check evidence occurrences
    assert.strictEqual(deadlockItem.occurrences.length, 4);
    const labels = deadlockItem.occurrences.map((o: any) => o.label);
    assert.ok(labels.some((l: string) => l.includes('2023')), 'Expected 2023 exam in occurrences');
    assert.ok(labels.some((l: string) => l.includes('2024')), 'Expected 2024 exam in occurrences');
    assert.ok(labels.some((l: string) => l.includes('2025')), 'Expected 2025 exam in occurrences');

    // Check strict lecture slide mapping (NO hallucination, exactly Slides 18–24)
    assert.strictEqual(deadlockItem.lectureSource.mapped, true);
    assert.ok(deadlockItem.lectureSource.documentTitle.includes('Operating Systems Unit 4'));
    assert.strictEqual(deadlockItem.lectureSource.slideRange, 'Slides 18–24');
    assert.ok(deadlockItem.lectureSource.slideSnippet.length > 20);

    // 2. Verify "Banker's Algorithm"
    const bankerItem = items.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('banker')
    );
    assert.ok(bankerItem, 'Expected Banker\'s Algorithm item to be present');
    assert.strictEqual(bankerItem.priorityTag, 'HIGH PRIORITY');
    assert.strictEqual(bankerItem.appearanceCount, 3);
    assert.strictEqual(bankerItem.lectureSource.mapped, true);
    assert.strictEqual(bankerItem.lectureSource.slideRange, 'Slides 25–31');
  });

  it('unmapped lecture concepts report "Source location not confidently mapped" without guessing', async () => {
    const { client } = await createClient('unmapped-test');

    // Ingest a past paper with a concept not present in any lecture slides
    await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: '2024 Computer Networks Exam',
        docType: 'Past Paper',
        content: `QUESTION 1 (10 Marks): Explain BGP routing and autonomous system path vectors.`,
      },
    });

    const res = await client.request('/api/academic/what-to-study');
    assert.strictEqual(res.status, 200);
    const items = res.json.whatToStudy;
    assert.ok(items.length >= 1);

    const bgpItem = items[0];
    assert.strictEqual(bgpItem.lectureSource.mapped, false);
    assert.strictEqual(bgpItem.lectureSource.unmappedReason, 'Source location not confidently mapped.');
  });

  it('completes the full loop: What to Study -> Schedule Calendar Event -> Execute -> Ascent Rises', async () => {
    const { client } = await createClient('full-loop-user');

    // Step 1: Load academic pack
    await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const wtsRes = await client.request('/api/academic/what-to-study');
    const items = wtsRes.json.whatToStudy;
    const deadlock = items.find((i: any) => i.conceptTitle.includes('Deadlock Detection'));
    assert.ok(deadlock);

    // Initial Ascent state
    const initialAscent = (await client.request('/api/ascent')).json.ascent;
    assert.strictEqual(initialAscent.progress, 0.05);
    assert.strictEqual(initialAscent.elevationMeters, 222);

    // Get an owned topic
    const topicsRes = await client.request('/api/topics');
    const topics = topicsRes.json.topics || [];
    let topic = topics.find((t: any) => t.name.toLowerCase().includes('deadlock')) || topics[0];
    if (!topic) {
      const createdTopic = await client.request('/api/topics', {
        method: 'POST',
        body: { name: 'Unit 4 · Deadlocks', priority: 5, weightage: 20 },
      });
      topic = createdTopic.json.topics[0];
    }

    // Step 2: Schedule study block directly from What to Study
    const today = new Date().toISOString().slice(0, 10);
    const scheduleRes = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: {
        topicId: topic.id,
        title: `${deadlock.conceptTitle} (${deadlock.lectureSource.slideRange})`,
        date: today,
        startTime: '19:00',
        durationMinutes: 60,
        blockType: 'study',
      },
    });
    assert.strictEqual(scheduleRes.status, 201);
    const createdBlock = scheduleRes.json.scheduleBlocks[0];
    assert.strictEqual(createdBlock.title, 'Explain Deadlock Detection (Slides 18–24)');

    // Step 3: Ascent reflects scheduled block today
    const midAscent = (await client.request('/api/ascent')).json.ascent;
    assert.strictEqual(midAscent.todayScheduledCount, 1);
    assert.strictEqual(midAscent.todayCompletedCount, 0);
    // Uncompleted upcoming block has not moved progress yet (logging in / scheduling != progress)
    assert.strictEqual(midAscent.progress, 0.05);

    // Step 4: Student executes and completes the scheduled calendar session
    const completeRes = await client.request(`/api/schedule-blocks/${createdBlock.id}`, {
      method: 'PATCH',
      body: { completed: true },
    });
    assert.strictEqual(completeRes.status, 200);

    // Step 5: Ascent physically MOVES UPWARD!
    const climbedAscent = (await client.request('/api/ascent')).json.ascent;
    assert.strictEqual(climbedAscent.todayCompletedCount, 1);
    assert.strictEqual(climbedAscent.totalCompleted, 1);
    assert.strictEqual(climbedAscent.progress, 0.135);
    assert.strictEqual(climbedAscent.elevationMeters, 394); // Exact 394m from prompt!
    assert.strictEqual(climbedAscent.stage, 'STARTING');
  });

  it('missing a scheduled study block decreases Ascent', async () => {
    const { client } = await createClient('miss-study-user');
    const topicRes = await client.request('/api/topics', {
      method: 'POST',
      body: { name: 'Algorithms', priority: 5, weightage: 20 },
    });
    const topicId = topicRes.json.topics[0].id;

    // Create and complete one block to climb to 394m
    const today = new Date().toISOString().slice(0, 10);
    const res1 = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Session 1', date: today, startTime: '10:00', durationMinutes: 45, blockType: 'study' },
    });
    const block1 = res1.json.scheduleBlocks.find((b: any) => b.title === 'Session 1');
    await client.request(`/api/schedule-blocks/${block1.id}`, { method: 'PATCH', body: { completed: true } });

    // Create a second block and mark it missed
    const res2 = await client.request('/api/schedule-blocks', {
      method: 'POST',
      body: { topicId, title: 'Session 2', date: today, startTime: '14:00', durationMinutes: 45, blockType: 'study' },
    });
    const block2 = res2.json.scheduleBlocks.find((b: any) => b.title === 'Session 2');

    const missRes = await client.request(`/api/schedule-blocks/${block2.id}`, {
      method: 'PATCH',
      body: { missed: true },
    });
    assert.strictEqual(missRes.status, 200);

    const ascentAfterMiss = (await client.request('/api/ascent')).json.ascent;
    assert.strictEqual(ascentAfterMiss.totalCompleted, 1);
    assert.strictEqual(ascentAfterMiss.totalMissed, 1);
    assert.strictEqual(ascentAfterMiss.todayMissedCount, 1);
    // 0.05 + 0.085 - 0.065 = 0.070
    assert.strictEqual(ascentAfterMiss.progress, 0.07);
    assert.ok(ascentAfterMiss.elevationMeters < 394, `Expected elevation < 394m, got ${ascentAfterMiss.elevationMeters}m`);
  });

  it('streams document content via /api/documents/:id/file', async () => {
    const { client } = await createClient('doc-stream-user');

    await client.request('/api/academic-documents/analyze', {
      method: 'POST',
      body: {
        title: 'Algorithms_Lecture_1.txt',
        docType: 'Lecture Slides',
        content: 'Slide 1: Divide and Conquer\nSlide 2: Merge Sort Analysis',
      },
    });

    const docs = (await client.request('/api/documents')).json.documents;
    const docId = docs[0].id;

    const fileRes = await fetch(`${server.baseUrl}/api/documents/${docId}/file`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    assert.strictEqual(fileRes.status, 200);
    const text = await fileRes.text();
    assert.ok(text.includes('Slide 1: Divide and Conquer'));
  });
});
