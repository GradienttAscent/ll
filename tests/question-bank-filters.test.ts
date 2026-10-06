import { describe, it } from 'node:test';
import assert from 'node:assert';
import { filterQuestionBank } from '../src/utils/questionBankFilters';

describe('question bank filters', () => {
  it('combines persisted topic, year, paper, marks, difficulty and source', () => {
    const questions: any[] = [{ id: 'pyq', topic: 'Paging', year: '2025', documentId: 'paper', marks: 10, difficulty: 'Hard', sourceType: 'past_paper' }, { id: 'ai', topic: 'Paging', year: '2024', documentId: 'generated', marks: 5, difficulty: 'Easy', sourceType: 'ai_generated' }];
    assert.deepStrictEqual(filterQuestionBank(questions, { topic: 'Paging', year: '2025', paper: 'paper', marks: '10', difficulty: 'Hard', source: 'past_paper' }).map((q) => q.id), ['pyq']);
  });
});
