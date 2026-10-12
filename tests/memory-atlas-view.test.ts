import { describe, it } from 'node:test';
import assert from 'node:assert';
import { atlasForForecast, canBuildMemoryRefreshPlan, selectedAtlasTopic } from '../src/components/MemoryAtlasView';
import { createMemoryAtlasDemo, isMemoryAtlasDemo } from '../src/data/memoryAtlasDemo';

describe('Memory Atlas forecast selection', () => {
  it('restores the current snapshot when the forecast returns to Today', () => {
    const current: any = { forecastDays: 0, topics: [{ topicId: 'current' }], summary: {}, courses: [] };
    const future: any = { forecastDays: 7, topics: [{ topicId: 'future' }], summary: {}, courses: [] };
    assert.strictEqual(atlasForForecast(7, current, future), future);
    assert.strictEqual(atlasForForecast(0, current, future), current);
  });
});

describe('Memory Atlas presentation demo', () => {
  it('recovers exactly the original three fixture topics with distinct retention states', () => {
    const demo = createMemoryAtlasDemo(0);

    assert.deepStrictEqual(demo.topics.map((topic) => topic.topicName), [
      'Memory Graphs',
      'Brief Reading',
      'Memory Dynamic Programming',
    ]);
    assert.deepStrictEqual(demo.topics.map((topic) => topic.status), ['stable', 'due', 'fading']);
    assert.ok(demo.topics.every((topic) => topic.predictedRetention !== null && topic.predictedRetention > 0));
    assert.strictEqual(isMemoryAtlasDemo(demo), true);
  });

  it('forecasts the same demo topics and restores Today without retaining the forecast values', () => {
    const today = createMemoryAtlasDemo(0);
    const future = createMemoryAtlasDemo(14);
    const restored = atlasForForecast(0, today, future)!;

    assert.deepStrictEqual(future.topics.map((topic) => topic.topicId), today.topics.map((topic) => topic.topicId));
    assert.ok(future.topics.every((topic, index) => topic.predictedRetention! < today.topics[index].predictedRetention!));
    assert.strictEqual(restored, today);
  });

  it('selects a demo topic for curve highlighting and keeps demo IDs out of the standard refresh plan', () => {
    const demo = createMemoryAtlasDemo(0);
    const selected = selectedAtlasTopic(demo, 'demo-memory-dynamic-programming', demo.topics[0]);

    assert.strictEqual(selected?.topicName, 'Memory Dynamic Programming');
    assert.strictEqual(canBuildMemoryRefreshPlan(demo), false);
  });
});
