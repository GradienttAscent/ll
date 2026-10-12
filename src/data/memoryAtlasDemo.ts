import { CourseMemorySummary, MemoryAtlasData, MemoryStatus, MemoryTopicState } from '../types';

const DEMO_AS_OF = new Date('2026-10-12T12:00:00.000Z');
const DEMO_STRENGTH_DAYS = 7;
const DUE_THRESHOLD = 0.5;
const DAY_MS = 86_400_000;

export const MEMORY_ATLAS_DEMO_TOPICS = [
  { topicId: 'demo-memory-graphs', topicName: 'Memory Graphs', elapsedDays: 1, priority: 9, weightage: 40 },
  { topicId: 'demo-brief-reading', topicName: 'Brief Reading', elapsedDays: 6, priority: 4, weightage: 10 },
  { topicId: 'demo-memory-dynamic-programming', topicName: 'Memory Dynamic Programming', elapsedDays: 3, priority: 7, weightage: 20 },
] as const;

function statusFor(retention: number): MemoryStatus {
  if (retention >= 0.7) return 'stable';
  if (retention >= DUE_THRESHOLD) return 'fading';
  return 'due';
}

export function createMemoryAtlasDemo(forecastDays: number): MemoryAtlasData {
  const safeForecastDays = Math.max(0, Math.min(14, Math.floor(forecastDays)));
  const evaluatedAt = new Date(DEMO_AS_OF.getTime() + safeForecastDays * DAY_MS);
  const topics: MemoryTopicState[] = MEMORY_ATLAS_DEMO_TOPICS.map((topic) => {
    const elapsedDays = topic.elapsedDays + safeForecastDays;
    const predictedRetention = Math.exp(-elapsedDays / DEMO_STRENGTH_DAYS);
    const dueDays = DEMO_STRENGTH_DAYS * Math.log(1 / DUE_THRESHOLD);
    const dueAt = new Date(DEMO_AS_OF.getTime() + (dueDays - topic.elapsedDays) * DAY_MS);
    return {
      topicId: topic.topicId,
      topicName: topic.topicName,
      topicSource: 'demo-presentation',
      courseId: 'demo-memory-course',
      courseName: 'Design and Analysis of Algorithms',
      lastStudiedAt: new Date(DEMO_AS_OF.getTime() - topic.elapsedDays * DAY_MS).toISOString(),
      qualifyingSessionCount: 0,
      syntheticSessionCount: 0,
      totalActualStudySeconds: 0,
      memoryStrengthDays: DEMO_STRENGTH_DAYS,
      predictedRetention,
      status: statusFor(predictedRetention),
      dueAt: dueAt.toISOString(),
      nextRevisionAt: dueAt.toISOString(),
      daysUntilDue: Number(((dueAt.getTime() - evaluatedAt.getTime()) / DAY_MS).toFixed(2)),
      priority: topic.priority,
      weightage: topic.weightage,
      hasWeightage: true,
    };
  });
  const summary = {
    studiedTopicCount: topics.length,
    stableCount: topics.filter((topic) => topic.status === 'stable').length,
    fadingCount: topics.filter((topic) => topic.status === 'fading').length,
    dueCount: topics.filter((topic) => topic.status === 'due').length,
    unexploredCount: 0,
  };
  const course: CourseMemorySummary = {
    courseId: 'demo-memory-course',
    courseName: 'Design and Analysis of Algorithms',
    topicCount: topics.length,
    studiedTopicCount: topics.length,
    predictedRetention: topics.reduce((total, topic) => total + (topic.predictedRetention || 0), 0) / topics.length,
    stableCount: summary.stableCount,
    fadingCount: summary.fadingCount,
    dueCount: summary.dueCount,
  };
  return { forecastDays: safeForecastDays, evaluatedAt: evaluatedAt.toISOString(), topics, summary, courses: [course] };
}

export function isMemoryAtlasDemo(atlas: MemoryAtlasData | null): boolean {
  return Boolean(atlas?.topics.length === 3 && atlas.topics.every((topic) => topic.topicSource === 'demo-presentation'));
}
