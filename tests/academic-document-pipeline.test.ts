import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  classifyAcademicDocument,
  isBibliographyOrMetadata,
  isPersistableQuestion,
  extractNumberedQuestionRecords,
  ingestAcademicDocument,
  getDeterministicWhatToStudyRanking,
} from '../services';
import { createTestServer, removeTempDir, TestServer } from './helpers';

describe('Academic Document Ingestion & Grounding Pipeline', () => {
  let server: TestServer;
  let userId: string;

  before(async () => {
    server = await createTestServer();
    userId = 'test-academic-pipeline-user';
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  describe('Document Classification (classifyAcademicDocument)', () => {
    it('accurately identifies syllabus and curriculum documents', () => {
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'BTech-CSE Revised curriculum-V1.pdf' }),
        'Syllabus'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'SYLLABUS,MODALITIES.pdf' }),
        'Syllabus'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'CS201_Course_Curriculum.pdf' }),
        'Syllabus'
      );
      assert.strictEqual(
        classifyAcademicDocument({
          fileName: 'Document.pdf',
          content: 'Course Objectives: Learn data structures. Unit 1: Trees, Unit 2: Graphs. Evaluation Scheme: Mid-sem 30%.',
        }),
        'Syllabus'
      );
    });

    it('accurately identifies lecture presentations and slide decks', () => {
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'TREES-SPLAY TREE.pdf' }),
        'Lecture Slides'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'TREES-OPERATIONS ON BINARY THREADED TREE.pdf' }),
        'Lecture Slides'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'Operating Systems Unit 4 - Deadlocks.pptx' }),
        'Lecture Slides'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'Lecture_05_CPU_Scheduling.pdf' }),
        'Lecture Slides'
      );
      assert.strictEqual(
        classifyAcademicDocument({
          fileName: 'Unknown.pdf',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }),
        'Lecture Slides'
      );
    });

    it('accurately identifies past examination papers', () => {
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'End Sem 2024 dsa3.pdf' }),
        'Past Paper'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: '2023 DBMS Mid-Sem Exam.pdf' }),
        'Past Paper'
      );
      assert.strictEqual(
        classifyAcademicDocument({ fileName: 'Operating Systems PYQ 2022.pdf' }),
        'Past Paper'
      );
      assert.strictEqual(
        classifyAcademicDocument({
          fileName: 'Paper.pdf',
          content: 'Maximum Marks: 100\nTime: 3 Hours\nAnswer all questions from Part A.',
        }),
        'Past Paper'
      );
    });
  });

  describe('Bibliography and Metadata Rejection (isBibliographyOrMetadata)', () => {
    it('rejects publisher references, citations, course codes, and catalog listings', () => {
      assert.strictEqual(
        isBibliographyOrMetadata('James A. Freeman, Neural Networks: Algorithms, Applications, Pearson, 2002'),
        true
      );
      assert.strictEqual(
        isBibliographyOrMetadata('Ajay Agarwal, Data Structures, Wiley India Edition'),
        true
      );
      assert.strictEqual(
        isBibliographyOrMetadata('Van Horne James, Financial Management and Policy, Prentice Hall'),
        true
      );
      assert.strictEqual(
        isBibliographyOrMetadata('BTech-CSE Revised curriculum-V1'),
        true
      );
      assert.strictEqual(
        isBibliographyOrMetadata('2009 CSE322 Cloud Computing vol 2 pp. 12-40'),
        true
      );
      assert.strictEqual(
        isBibliographyOrMetadata('McGraw-Hill Education, 3rd Edition, ISBN 978-0071234567'),
        true
      );
    });
  });

  describe('Question Filtering (isPersistableQuestion)', () => {
    it('strictly rejects non-question administrative headers, curriculum lines, and author references', () => {
      assert.strictEqual(isPersistableQuestion({ text: 'BTech-CSE Revised curriculum-V1' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'James A. Freeman' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'Ajay Agarwal, Data Structures' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'CSE322' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'Maximum Marks: 100' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'Time: 3 Hours' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'Department of Computer Science and Engineering' }), false);
      assert.strictEqual(isPersistableQuestion({ text: 'Course Objectives and Learning Outcomes' }), false);
      assert.strictEqual(isPersistableQuestion({ text: '10 marks' }), false);
    });

    it('strictly accepts genuine academic interrogative and imperative tasks', () => {
      assert.strictEqual(
        isPersistableQuestion({ text: 'Describe paging hardware with TLB address translation.' }),
        true
      );
      assert.strictEqual(
        isPersistableQuestion({ text: 'Explain insertion and deletion operations in a Binary Search Tree.' }),
        true
      );
      assert.strictEqual(
        isPersistableQuestion({ text: 'Insert the elements 10, 5, 15, 3, 7, 12, and 20 into the Splay Tree.' }),
        true
      );
      assert.strictEqual(
        isPersistableQuestion({ text: 'Consider a system with 5 processes. Apply Banker\'s algorithm to determine if the state is safe.' }),
        true
      );
      assert.strictEqual(
        isPersistableQuestion({ text: 'What are the four necessary conditions for a deadlock to occur?' }),
        true
      );
    });
  });

  describe('Document Ingestion Isolation (ingestAcademicDocument)', () => {
    it('never persists question records for Syllabus documents even if numbered lines exist', () => {
      const syllabusContent = `
        BTech-CSE Revised curriculum-V1
        Unit 1: Binary Search Trees and Balanced Trees
        1. James A. Freeman, Neural Networks, Pearson Education
        2. Van Horne James, Financial Management, Prentice Hall
        3. Ajay Agarwal, Data Structures, Wiley India
      `;

      const result = ingestAcademicDocument(userId, {
        title: 'BTech-CSE Revised curriculum-V1.pdf',
        docType: 'Syllabus',
        content: syllabusContent,
      });

      assert.strictEqual(result.createdQuestionCount, 0, 'Syllabus must never produce question records');
    });

    it('never persists question records for Lecture Slides documents', () => {
      const slideContent = `
        TREES - SPLAY TREE
        Slide 1: Definition of Splay Tree
        1. Explain what self-adjusting trees are.
        Slide 2: Rotations in Splay Trees
        Zig-Zig and Zig-Zag rotations.
      `;

      const result = ingestAcademicDocument(userId, {
        title: 'TREES-SPLAY TREE.pdf',
        docType: 'Lecture Slides',
        content: slideContent,
      });

      assert.strictEqual(result.createdQuestionCount, 0, 'Lecture slides must never produce question records');
    });

    it('persists only genuine exam questions for Past Paper documents', () => {
      const examContent = `
        End Semester Examination 2024
        Department of Computer Science and Engineering
        Maximum Marks: 100
        Time: 3 Hours
        
        Q1. Explain insertion and deletion in a Splay Tree with suitable examples. (10 marks)
        Q2. Describe paging hardware with TLB address translation. (10 marks)
        3. James A. Freeman, Reference textbook
      `;

      const result = ingestAcademicDocument(userId, {
        title: 'End Sem 2024 dsa3.pdf',
        docType: 'Past Paper',
        content: examContent,
      });

      assert.strictEqual(result.createdQuestionCount, 2, 'Only genuine questions 1 and 2 should be persisted');
    });
  });

  describe('Lecture Slide Grounding (getDeterministicWhatToStudyRanking)', () => {
    it('grounds question clusters directly to lecture slide ranges with exact slide numbers', () => {
      // Ingest lecture slides with structured pages
      ingestAcademicDocument(userId, {
        title: 'Operating Systems Unit 4 - Deadlocks.pptx',
        docType: 'Lecture Slides',
        content: 'Deadlock detection and prevention slides',
        structuredPages: [
          { pageNumber: 18, heading: 'Deadlock Detection Algorithm', text: 'Resource allocation graph reduction and cycle detection.' },
          { pageNumber: 19, heading: 'Deadlock Detection in Systems', text: 'Algorithm for detecting deadlocks with multiple instances of each resource type.' },
          { pageNumber: 20, heading: 'Banker\'s Algorithm', text: 'Safety algorithm and Resource-request algorithm for deadlock avoidance.' },
        ],
      });

      // Ingest past papers asking about Deadlock Detection
      ingestAcademicDocument(userId, {
        title: '2023 End Sem Exam.pdf',
        docType: 'Past Paper',
        content: 'Q1. Explain Deadlock Detection algorithm with multiple resource instances. (10 marks)',
      });

      ingestAcademicDocument(userId, {
        title: '2024 Mid Sem Exam.pdf',
        docType: 'Past Paper',
        content: 'Q1. Explain Deadlock Detection and recovery methods in modern operating systems. (10 marks)',
      });

      const ranking = getDeterministicWhatToStudyRanking(userId);
      assert.ok(ranking.length > 0, 'Ranking should contain identified study concepts');

      const deadlockItem = ranking.find((item) => /deadlock/i.test(item.conceptTitle));
      assert.ok(deadlockItem, 'Deadlock concept should be present in ranking');
      assert.strictEqual(deadlockItem.lectureSource.mapped, true, 'Deadlock concept must be mapped to lecture slides');
      assert.strictEqual(deadlockItem.lectureSource.startSlide, 18);
      assert.ok(deadlockItem.lectureSource.endSlide >= 18);
      assert.strictEqual(deadlockItem.lectureSource.documentTitle, 'Operating Systems Unit 4 - Deadlocks');
    });
  });
});
