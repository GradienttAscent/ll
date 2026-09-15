import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateBlocks } from '../src/components/PlannerView';

const today = new Date(2026, 0, 1);
const topics = [
  { id: 'topic-high', courseId: 'course', name: 'High', priority: 10, weightage: 60, source: 'test', createdAt: '' },
  { id: 'topic-low', courseId: 'course', name: 'Low', priority: 5, weightage: 40, source: 'test', createdAt: '' },
];

function overlaps(a: { date: string; startTime: string; durationMinutes: number }, b: { date: string; startTime: string; durationMinutes: number }) {
  if (a.date !== b.date) return false;
  const start = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const aStart = start(a.startTime);
  const bStart = start(b.startTime);
  return aStart < bStart + b.durationMinutes && bStart < aStart + a.durationMinutes;
}

describe('planner slot selection', () => {
  it('skips persisted occupied intervals and permits adjacency', () => {
    const existing = [{ date: '2026-01-01', startTime: '08:00', durationMinutes: 60 }];
    const generated = generateBlocks([topics[0]], '2026-01-02', 4, existing, today);
    assert.ok(generated.length > 0);
    assert.strictEqual(generated[0].startTime, '09:00');
    assert.ok(!generated.some((block) => overlaps(block, existing[0])));
  });

  it('does not overlap persisted or newly generated blocks', () => {
    const existing = [{ date: '2026-01-01', startTime: '09:00', durationMinutes: 60 }];
    const generated = generateBlocks(topics, '2026-01-02', 6, existing, today);
    for (const block of generated) {
      assert.ok(!overlaps(block, existing[0]));
    }
    for (let index = 0; index < generated.length; index += 1) {
      for (let other = index + 1; other < generated.length; other += 1) {
        assert.ok(!overlaps(generated[index], generated[other]));
      }
    }
  });

  it('treats completed blocks as occupied', () => {
    const completed = [{ date: '2026-01-01', startTime: '08:00', durationMinutes: 60, completed: true }];
    const generated = generateBlocks([topics[0]], '2026-01-02', 4, completed, today);
    assert.ok(generated.length > 0);
    assert.strictEqual(generated[0].startTime, '09:00');
  });

  it('returns no blocks when the planning window is full', () => {
    const fullDay = [{ date: '2026-01-01', startTime: '08:00', durationMinutes: 600 }];
    assert.deepStrictEqual(generateBlocks([topics[0]], '2026-01-02', 10, fullDay, today), []);
  });
});
