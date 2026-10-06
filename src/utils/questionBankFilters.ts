import type { QuestionItem } from '../types';

export type QuestionBankFilters = { topic: string; year: string; paper: string; marks: string; difficulty: string; source: string };
export function filterQuestionBank(questions: QuestionItem[], filters: QuestionBankFilters) {
  return questions.filter((q) => (!filters.topic || q.topic === filters.topic) && (!filters.year || q.year === filters.year) && (!filters.paper || q.documentId === filters.paper) && (!filters.marks || String(q.marks) === filters.marks) && (!filters.difficulty || (q as any).difficulty === filters.difficulty) && (!filters.source || (q as any).sourceType === filters.source));
}
