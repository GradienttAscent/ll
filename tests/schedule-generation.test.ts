import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createScheduleProposal, DerivedScheduleDataset, SCHEDULE_DURATION_ALGORITHM } from '../services';
import { parseSchedulingAssistantIntent } from '../schedulingAssistant';

const dataset: DerivedScheduleDataset = {
  schemaVersion: 1,
  sourceDataset: 'test',
  sourceDocuments: [{ documentId: 'paper-1', title: 'Paper', extractionMethod: 'pdf-text' }],
  topics: [
    {
      topicId: 'high', topicName: 'High', priority: 10, weightage: 60,
      estimatedDurationMinutes: 30, durationAlgorithm: SCHEDULE_DURATION_ALGORITHM,
      questions: [{ questionId: 'q-high', questionNumber: '1', marks: 10, pageNumber: 1, suggestedTimeMinutes: 20 }], lectureSource: null,
    },
    {
      topicId: 'low', topicName: 'Low', priority: 2, weightage: 10,
      estimatedDurationMinutes: 36, durationAlgorithm: SCHEDULE_DURATION_ALGORITHM,
      questions: [{ questionId: 'q-low', questionNumber: '2', marks: 18, pageNumber: 1, suggestedTimeMinutes: 36 }], lectureSource: null,
    },
    {
      topicId: 'unmapped', topicName: 'No Evidence', priority: 1, weightage: 1,
      estimatedDurationMinutes: null, durationAlgorithm: null, questions: [], lectureSource: null,
    },
  ],
};

const settings = {
  examDate: '2026-01-03',
  availability: [{ weekday: 4, startTime: '08:00', endTime: '10:00' }, { weekday: 5, startTime: '08:00', endTime: '10:00' }],
  excludedDates: [] as string[],
  excludedWeekdays: [] as number[],
  preferredPeriods: [] as ('morning' | 'afternoon' | 'evening')[],
  dailyMaxMinutes: 60,
};

 describe('schedule generation', () => {
  it('uses canonical PYQ duration, preserves no-evidence state, and is deterministic', () => {
    const input = { dataset, settings, existingBlocks: [], referenceTime: new Date('2026-01-01T07:00:00.000Z') };
    const first = createScheduleProposal(input);
    const second = createScheduleProposal(input);
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.durationAlgorithm, 'pyq-marks-v1');
    assert.strictEqual(first.requiredStudyMinutes, 66);
    assert.strictEqual(first.allocatedMinutesByTopic.high, 30);
    assert.strictEqual(first.allocatedMinutesByTopic.low, 36);
    assert.strictEqual(first.unallocatedReasons.unmapped, 'No mapped questions provide a duration estimate.');
  });

  it('reports per-topic capacity shortfalls and respects excluded dates', () => {
    const proposal = createScheduleProposal({
      dataset,
      settings: { ...settings, excludedDates: ['2026-01-01'], dailyMaxMinutes: 30 },
      existingBlocks: [],
      referenceTime: new Date('2026-01-01T07:00:00.000Z'),
    });
    assert.ok(Object.keys(proposal.unallocatedMinutesByTopic).length > 0);
    assert.ok(proposal.blocks.every((block) => block.date !== '2026-01-01'));
  });

  it('recognizes the new assistant commands', () => {
    const now = new Date('2026-09-14T10:00:00.000Z');
    assert.strictEqual(parseSchedulingAssistantIntent('Generate my study schedule', now).type, 'generate_schedule');
    assert.strictEqual(parseSchedulingAssistantIntent("I couldn't study today; reschedule the remaining topics", now).type, 'reschedule_remaining');
    assert.strictEqual(parseSchedulingAssistantIntent("I finished this topic; what's next?", now).type, 'complete_topic');
    assert.strictEqual(parseSchedulingAssistantIntent("Show slides for today's topic", now).type, 'show_source');
  });
});
