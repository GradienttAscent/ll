import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { createTestServer, removeTempDir, type TestServer } from './helpers';
import { extractNumberedQuestions, ingestAcademicDocument, normalizeAcademicQuestion } from '../services';

// Academic past-paper ingestion, white-box. The pure helpers
// (`normalizeAcademicQuestion`, `extractNumberedQuestions`) are exercised directly,
// and the persistence/mapping layer (`ingestAcademicDocument`) is called in-process
// against a throwaway database so no HTTP round-trip is needed for these branches.
describe('ACAD academic parser branch coverage (services.ts)', () => {
  let server: TestServer;

  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  let seq = 0;
  const nextUser = () => `acad-user-${(seq += 1)}`;

  type Mapping = { questionText: string; topicName: string; confidence: number };
  const ingest = (input: { title: string; docType?: string; content: string; topicMappings?: Mapping[] }) =>
    ingestAcademicDocument(nextUser(), { docType: 'Past Paper', ...input });

  // ACAD-01 - white-box: which question-number prefixes are stripped and which are not.
  it('ACAD-01 strips recognised question numbers and leaves unrecognised prefixes alone', () => {
    const stripped: Array<[string, string]> = [
      ['1. Explain BFS traversal', 'Explain BFS traversal'],
      ['  2.  Explain  binary  search  ', 'Explain binary search'],
      ['12) Explain TCP', 'Explain TCP'],
      ['3- Explain virtual memory', 'Explain virtual memory'],
      ['Q4) Explain paging', 'Explain paging'],
      ['Question 7 (a): Explain TLB', 'Explain TLB'],
    ];
    for (const [input, expected] of stripped) {
      assert.strictEqual(normalizeAcademicQuestion(input), expected, `input: ${JSON.stringify(input)}`);
    }
    // Not stripped: a leading "(5)" has no number in front of it, and a bare
    // "Q12"/"Q. 3"/"Que 4" has no separator for the pattern to anchor on.
    const kept = ['(5) Explain segmentation', 'Q12 Explain X', 'Q. 3 Explain X', 'Que 4 Explain X'];
    for (const input of kept) {
      assert.strictEqual(normalizeAcademicQuestion(input), input, `input: ${JSON.stringify(input)}`);
    }
    // DEFECT-ACAD-02: "1.2" is refused as a marker by `\.(?!\d)` but the number
    // stripper then deletes "1." and leaves the mangled "2 Explain x".
    assert.strictEqual(normalizeAcademicQuestion('1.2 Explain x'), '2 Explain x');
  });

  // ACAD-02 - white-box: the main question stage and the lettered sub-part stage.
  it('ACAD-02 splits a numbered question into its lettered sub-parts', () => {
    // The parent stem is replaced by its sub-parts.
    assert.deepStrictEqual(
      extractNumberedQuestions('1. What is BFS? a) Define graph. b) Explain BFS. (3 marks)'),
      ['Define graph.', 'Explain BFS.'],
    );
    // Numbering styles that are all accepted as top-level markers.
    assert.deepStrictEqual(extractNumberedQuestions('1. Explain BFS\n2. Explain DFS'), ['Explain BFS', 'Explain DFS']);
    assert.deepStrictEqual(extractNumberedQuestions('Q1) Explain BFS\nQ.2 Explain DFS'), ['Explain BFS', 'Explain DFS']);
    // A second marker mid-line also opens a new question.
    assert.deepStrictEqual(extractNumberedQuestions('1. Explain BFS and then 2. Explain DFS'), ['Explain BFS and then', 'Explain DFS']);
  });

  // ACAD-03 - white-box: the roman-numeral sub-part stage, and that sub-parts with
  // no parent question are discarded rather than orphaned.
  it('ACAD-03 splits roman-numeral sub-parts and discards parentless sub-parts', () => {
    assert.deepStrictEqual(
      extractNumberedQuestions('1. Explain paging i) Define a page fault. ii) Compare paging and segmentation.'),
      ['Define a page fault.', 'Compare paging and segmentation.'],
    );
    assert.deepStrictEqual(extractNumberedQuestions('i) Explain BFS\nii) Explain DFS'), []);
  });

  // ACAD-04 - white-box: the guards that keep decimals and page markers out of the
  // question boundaries.
  it('ACAD-04 does not split on decimals or page markers', () => {
    // `(?!\d)` keeps "2.30" whole, so no question marker is found.
    assert.deepStrictEqual(extractNumberedQuestions('2.30 Marks for the whole paper'), []);
    // `cleanPaperContent` strips "1/2"-style page markers before splitting.
    assert.deepStrictEqual(extractNumberedQuestions('1/2 UNIT 3\n1. Explain BFS'), ['Explain BFS']);
  });

  // ACAD-05 - white-box: the BOILERPLATE noise filter. It is anchored `^...$` and
  // `cleanPaperContent` has already collapsed every newline into a space, so a
  // furniture line is only rejected when the document is nothing but furniture.
  it('ACAD-05 rejects standalone furniture documents and folds furniture into a question', () => {
    for (const furniture of ['Time: 3 hours', 'Marks: 20', 'Total Marks: 50', 'Page 2 of 9']) {
      assert.deepStrictEqual(extractNumberedQuestions(furniture), [], `input: ${JSON.stringify(furniture)}`);
    }
    // Furniture that shares a line with a real question is NOT stripped; it is
    // appended to the question text after whitespace collapsing.
    assert.deepStrictEqual(extractNumberedQuestions('1. Explain BFS\n   Time: 3 hours'), ['Explain BFS Time: 3 hours']);
    assert.deepStrictEqual(extractNumberedQuestions('1. Explain BFS\n   Marks: 20'), ['Explain BFS Marks: 20']);
  });

  // ACAD-06 - white-box: `cleanPaperContent` flattens newlines, so heading lines
  // before the first marker are dropped (they belong to no draft) but a heading
  // after a marker is absorbed into the question.
  it('ACAD-06 drops leading furniture and absorbs furniture after a marker', () => {
    assert.deepStrictEqual(extractNumberedQuestions('UNIT 3\nPage 4 of 9\n1. Explain BFS traversal'), ['Explain BFS traversal']);
    assert.deepStrictEqual(extractNumberedQuestions('1. Explain BFS\n   SECTION A'), ['Explain BFS SECTION A']);
    // A leading boilerplate prefix does not discard the questions behind it.
    assert.deepStrictEqual(extractNumberedQuestions('Question Paper, Semester 5 1. Explain BFS traversal'), ['Explain BFS traversal']);
  });

  // ACAD-07 - white-box: documents with nothing extractable.
  it('ACAD-07 returns no questions for empty, whitespace and noise-only content', () => {
    for (const input of ['', '   \n\t  ', 'Answer the following questions in section A', '***', '___']) {
      assert.deepStrictEqual(extractNumberedQuestions(input), [], `input: ${JSON.stringify(input)}`);
    }
  });

  // ACAD-08 - white-box: marks extraction and the unmarked default.
  it('ACAD-08 reads marks keywords, square brackets and the 10-mark default', () => {
    assert.strictEqual(ingest({ title: 'm1', content: '1. Explain BFS traversal (5 Marks)' }).questions[0].marks, 5);
    assert.strictEqual(ingest({ title: 'm2', content: '1. Explain BFS traversal (12 marks)' }).questions[0].marks, 12);
    assert.strictEqual(ingest({ title: 'm3', content: '1. Explain BFS traversal (5 M)' }).questions[0].marks, 5);
    assert.strictEqual(ingest({ title: 'm4', content: '1. Explain BFS traversal [5]' }).questions[0].marks, 5);
    // A decimal allocation is rounded to the nearest whole mark.
    assert.strictEqual(ingest({ title: 'm5', content: '1. Explain BFS traversal (7.5 Marks)' }).questions[0].marks, 8);
    // No allocation anywhere -> the 10-mark default.
    assert.strictEqual(ingest({ title: 'm6', content: '1. Explain BFS traversal' }).questions[0].marks, 10);
  });

  // ACAD-09 - white-box: MARKS_TAIL arithmetic on the leading "QUESTION n (...)" form.
  it('ACAD-09 adds and multiplies a marks allocation attached to the question marker', () => {
    assert.strictEqual(ingest({ title: 'a0', content: 'Question 1 (5 + 3) Explain BFS' }).questions[0].marks, 8);
    assert.strictEqual(ingest({ title: 'a1', content: 'QUESTION 1 (2 x 4): Explain BFS' }).questions[0].marks, 8);
    assert.strictEqual(ingest({ title: 'a2', content: 'Q1 (5 = 20) Explain BFS' }).questions[0].marks, 20);
    assert.strictEqual(ingest({ title: 'a3', content: '1. Explain BFS [2 + 3]' }).questions[0].marks, 5);
  });

  // ACAD-10 - white-box: one marked sub-part seeds the group total and every later
  // unmarked sibling inherits it.
  it('ACAD-10 propagates one sub-part marks figure across the whole group', () => {
    // `questionRows` orders by created_at DESC, so compare on a stable key.
    const byText = (rows: Array<{ questionText: string; marks: number }>) => rows.map((q) => [q.questionText, q.marks]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const marked = ingest({ title: 'm7', content: '1. Explain paging a) Define a page fault. (4 Marks) b) Compare paging and segmentation.' });
    assert.deepStrictEqual(byText(marked.questions), [
      ['Compare paging and segmentation.', 4],
      ['Define a page fault.', 4],
    ]);
    // A trailing allocation on the final sub-part seeds the same group total.
    const trailing = ingest({ title: 'm8', content: '1. Explain paging a) Define a page fault. b) Compare paging and segmentation. (9 Marks)' });
    assert.deepStrictEqual(byText(trailing.questions), [
      ['Compare paging and segmentation.', 9],
      ['Define a page fault.', 9],
    ]);
  });

  // ACAD-11 - DEFECT-ACAD-01: a marks allocation that is NOT adjacent to the question
  // marker is split by the sub-part alternative `(?<![\w(])(\d{1,3})\)(?!\s*marks?\b)`,
  // whose only guard is the "marks" keyword. So "(5 + 3)" loses its "3)" to a
  // sub-part boundary: the question text is truncated to "Explain BFS (5 +" and the
  // add/multiply branches in `extractQuestionMarks` never see the closing number, so
  // the question silently falls back to the 10-mark default. Square brackets are
  // unaffected because "5]" is not a sub-part marker.
  it('ACAD-11 documents that a trailing parenthesised marks total is split as a sub-part', () => {
    const summed = ingest({ title: 'd1', content: '1. Explain BFS (5 + 3)' });
    assert.deepStrictEqual(summed.questions.map((q) => q.questionText), ['Explain BFS (5 +']);
    assert.strictEqual(summed.questions[0].marks, 10);
    assert.strictEqual(ingest({ title: 'd2', content: '1. Explain BFS (2 x 4)' }).questions[0].marks, 10);
    assert.strictEqual(ingest({ title: 'd3', content: '1) Explain BFS (2 + 2)' }).questions[0].marks, 10);
    // A bare "(5)" is the same failure, not the null the bracketed branch intends.
    assert.strictEqual(ingest({ title: 'd4', content: '1. Explain BFS (5)' }).questions[0].marks, 10);
  });

  // ACAD-12 - white-box: the 0.6 confidence gate on AI topic suggestions.
  it('ACAD-12 accepts a 0.6 confidence hint and discards anything below it', () => {
    const hint: Mapping = { questionText: 'Explain Kruskal algorithm', topicName: 'Greedy Algorithms', confidence: 0.6 };
    const accepted = ingest({ title: 'c1', content: '1. Explain Kruskal algorithm (5 Marks)', topicMappings: [hint] });
    assert.deepStrictEqual(accepted.questions.map((q) => [q.topicName, q.mappingStatus, q.mappingScore]), [['Greedy Algorithms', 'mapped', 0.6]]);
    assert.deepStrictEqual(accepted.ranking.map((t) => t.name), ['Greedy Algorithms']);
    // Below the threshold the hint is thrown away and rule-based inference supplies a
    // paper-derived topic instead.
    const rejected = ingest({ title: 'c2', content: '1. Explain Kruskal algorithm (5 Marks)', topicMappings: [{ ...hint, confidence: 0.59 }] });
    assert.deepStrictEqual(rejected.questions.map((q) => [q.topicName, q.mappingStatus]), [['Kruskal', 'mapped']]);
    assert.deepStrictEqual(rejected.ranking.map((t) => `${t.name}(${t.source})`), ['Kruskal(paper-derived)']);
  });

  // ACAD-13 - white-box: with no syllabus on file the topic list is inferred from the
  // paper itself and every question is force-mapped.
  it('ACAD-13 infers paper-derived topics when no syllabus exists', () => {
    const result = ingest({ title: 's1', content: '1. Explain Kruskal algorithm (5 Marks)\n2. Describe TCP congestion control (5 Marks)' });
    assert.strictEqual(result.extractedTopicCount, 0);
    assert.deepStrictEqual(result.ranking.map((t) => `${t.name}(${t.source})`), ['Kruskal(paper-derived)', 'TCP(paper-derived)']);
    assert.deepStrictEqual(result.questions.map((q) => [q.topicName, q.mappingStatus]).sort(), [
      ['Kruskal', 'mapped'],
      ['TCP', 'mapped'],
    ]);
  });

  // ACAD-14 - white-box: a question built only from generic words cannot be tied to a
  // syllabus topic and stays unmatched.
  it('ACAD-14 leaves an all-generic question unmatched', () => {
    const owner = nextUser();
    ingestAcademicDocument(owner, { title: 's2', docType: 'Syllabus', content: 'Unit 1: Greedy Algorithms\nUnit 2: Management and System Design' });
    const result = ingestAcademicDocument(owner, { title: 'p2', docType: 'Past Paper', content: '1. Explain management of the system design process (5 Marks)' });
    assert.deepStrictEqual(result.questions.map((q) => [q.questionText, q.topicName, q.mappingStatus]), [['Explain management of the system design process', null, 'unmatched']]);
  });

  // ACAD-15 - white-box: hint resolution against the syllabus. There is no
  // abbreviation table, so a hint only survives when its name matches a syllabus unit;
  // an unresolvable hint is dropped and the rule-based keyword fallback runs instead.
  it('ACAD-15 resolves an exact syllabus name and falls back when the hint is unknown', () => {
    const owner = nextUser();
    ingestAcademicDocument(owner, { title: 's3', docType: 'Syllabus', content: 'Unit 1: Disjoint Set Union\nUnit 2: Greedy Algorithms' });
    const content = '1. Explain Kruskal algorithm (5 Marks)';
    const exact = ingestAcademicDocument(owner, {
      title: 'p3', docType: 'Past Paper', content,
      topicMappings: [{ questionText: 'Explain Kruskal algorithm', topicName: 'Disjoint Set Union', confidence: 0.9 }],
    });
    assert.deepStrictEqual(exact.questions.map((q) => [q.topicName, q.mappingEvidence]), [['Disjoint Set Union', ['AI topic classification from uploaded paper']]]);
    // "DSU" is an abbreviation with no matching unit, so the hint is dropped and the
    // rule-based keyword match on "algorithm" wins instead.
    const unknown = ingestAcademicDocument(owner, {
      title: 'p4', docType: 'Past Paper', content,
      topicMappings: [{ questionText: 'Explain Kruskal algorithm', topicName: 'DSU', confidence: 0.9 }],
    });
    assert.deepStrictEqual(unknown.questions.map((q) => [q.topicName, q.mappingEvidence]), [['Greedy Algorithms', ['matched keyword: algorithm']]]);
  });
});
