import { it, describe } from 'node:test';
import assert from 'node:assert';
import {
  parseSyllabus,
  extractTopicNames,
  extractQuestions,
  normalizeQuestionText,
  deduplicateQuestions,
  mapQuestionToTopic,
  calculateTopicPriorities,
} from '../academic';

describe('Academic Document Processing', () => {
  it('parses syllabus into units and topics', () => {
    const text = `
      Unit 1: Fundamentals of Graphs
      1. BFS and DFS
      2. Dijkstra Algorithm
      
      Unit 2: Dynamic Programming
      - Knapsack problem
      - Matrix chain multiplication
    `;
    const units = parseSyllabus(text);
    assert.strictEqual(units.length, 2);
    assert.strictEqual(units[0].unitTitle, 'Fundamentals of Graphs');
    assert.deepStrictEqual(units[0].topics, ['BFS and DFS', 'Dijkstra Algorithm']);
    assert.strictEqual(units[1].unitTitle, 'Dynamic Programming');
    assert.deepStrictEqual(units[1].topics, ['Knapsack problem', 'Matrix chain multiplication']);
  });

  it('extracts unique topics from units', () => {
    const units = [
      { unitNumber: 1, unitTitle: 'Graphs', topics: ['BFS', 'dfs'] },
      { unitNumber: 2, unitTitle: 'More Graphs', topics: ['BFS', 'A*'] },
    ];
    const topics = extractTopicNames(units);
    assert.deepStrictEqual(topics, ['Graphs', 'BFS', 'dfs', 'More Graphs', 'A*']);
  });

  it('extracts PYQ questions and metadata', () => {
    const text = `
      Q1. Explain Dijkstra. [10 marks]
      Question 2) Solve Knapsack. (15 points)
      3. What is O(n)?
    `;
    const qs = extractQuestions(text, 'Exam 2025');
    assert.strictEqual(qs.length, 3);
    assert.strictEqual(qs[0].marks, 10);
    assert.strictEqual(qs[0].year, '2025');
    assert.strictEqual(qs[0].questionText, 'Explain Dijkstra.');
    
    assert.strictEqual(qs[1].marks, 15);
    assert.strictEqual(qs[1].questionText, 'Solve Knapsack.');

    assert.strictEqual(qs[2].marks, null);
    assert.strictEqual(qs[2].questionText, 'What is O(n)?');
  });

  it('normalizes question text', () => {
    assert.strictEqual(normalizeQuestionText(' Q1) What is a graph? (10 marks)   '), 'What is a graph?');
    assert.strictEqual(normalizeQuestionText('Question 2. Solve this. [5 pts]'), 'Solve this.');
  });

  it('deduplicates questions keeping the best one', () => {
    const qs = [
      { questionText: 'Explain the Dijkstra algorithm', marks: 10, year: null, questionType: '', source: '' },
      { questionText: 'Explain the Dijkstra algorithm in detail please', marks: 15, year: null, questionType: '', source: '' }, // Should keep this (longer)
      { questionText: 'What is O(n)?', marks: null, year: null, questionType: '', source: '' },
    ];
    const deduped = deduplicateQuestions(qs, 0.5);
    assert.strictEqual(deduped.length, 2);
    assert.strictEqual(deduped.find((q) => q.questionText.includes('Explain'))?.marks, 15);
  });

  it('maps questions to topics deterministically', () => {
    const topics = ['Graph Traversal', 'Dynamic Programming', 'Big O Notation'];
    const q1 = mapQuestionToTopic('Explain graph traversal using BFS', topics);
    assert.strictEqual(q1.topicName, 'Graph Traversal');

    const q2 = mapQuestionToTopic('What is the big O time complexity?', topics);
    assert.strictEqual(q2.topicName, 'Big O Notation');

    const q3 = mapQuestionToTopic('How does photosynthesis work?', topics);
    assert.strictEqual(q3.topicName, null);
  });

  it('calculates evidence-based priority', () => {
    const inputs = [
      { topicId: 't1', topicName: 'Graphs', source: 'syllabus', questionCount: 5, totalMarks: 50 },
      { topicId: 't2', topicName: 'DP', source: 'extracted', questionCount: 2, totalMarks: 10 },
      { topicId: 't3', topicName: 'Math', source: 'syllabus', questionCount: 0, totalMarks: 0 },
    ];
    const priorities = calculateTopicPriorities(inputs);
    
    const graphs = priorities.find((p) => p.topicName === 'Graphs');
    assert.strictEqual(graphs?.frequencyCount, 5);
    assert.strictEqual(graphs?.avgMarks, 10);
    assert.strictEqual(graphs?.inSyllabus, true);
    assert.strictEqual(graphs?.priorityScore, 10);
    assert.ok(graphs?.evidence.includes('High priority'));

    const dp = priorities.find((p) => p.topicName === 'DP');
    assert.strictEqual(dp?.priorityScore, 5);
    assert.ok(dp?.evidence.includes('Medium priority'));

    const math = priorities.find((p) => p.topicName === 'Math');
    assert.strictEqual(math?.priorityScore, 2);
    assert.ok(math?.evidence.includes('Low priority'));
    assert.ok(math?.evidence.includes('no PYQ questions found yet'));
  });
});
