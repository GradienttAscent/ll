import { extractNumberedQuestionRecords, extractSyllabusTopics } from './services';

export interface FallbackEvaluationResult {
  score: number;
  maxMarks: number;
  strengths: string[];
  improvements: string[];
  feedbackText: string;
  modelAnswerSnippet: string;
}

const STOPWORDS = new Set([
  'what', 'is', 'are', 'the', 'and', 'for', 'with', 'explain', 'describe', 'define',
  'discuss', 'between', 'difference', 'compare', 'contrast', 'give', 'write', 'how',
  'why', 'which', 'when', 'where', 'whose', 'from', 'this', 'that', 'these', 'those',
  'does', 'have', 'been', 'using', 'used', 'state', 'illustrate', 'briefly', 'note',
  'about', 'into', 'over', 'after', 'such', 'than', 'them', 'then', 'also', 'will',
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

function generateModelSnippet(question: string, keywords: string[]): string {
  const topWords = keywords.slice(0, 4);
  const subject = topWords.length > 0 ? topWords.join(', ') : 'the concept';
  return `1. Core Definition & Principle: Rigorously define ${subject}, clarifying the foundational operational context.\n2. Key Operational Mechanism: Detail step-by-step procedures, invariants, and mathematical/algorithmic formulas.\n3. Complexity & Boundary Conditions: State time/space bounds and evaluate edge cases with a concrete scenario.`;
}

/**
 * Deterministically evaluates a student's answer based on keyword coverage,
 * explanatory depth, technical structure, and mark allocation.
 */
export function generateFallbackEvaluation(
  question: string,
  studentAnswer: string,
  maxMarksInput?: number
): FallbackEvaluationResult {
  const maxMarks = Math.max(1, Math.min(100, Math.round(Number(maxMarksInput) || 10)));
  const answer = String(studentAnswer || '').trim();
  const qText = String(question || '').trim();
  const uniqueQWords = extractKeywords(qText);

  // If answer is empty or completely blank
  if (!answer) {
    return {
      score: 0,
      maxMarks,
      strengths: [],
      improvements: [
        'Provide a complete, structured answer addressing the prompt.',
        'Include formal definitions, operational principles, and illustrative examples.',
      ],
      feedbackText: 'No answer was submitted. To earn marks, write a clear explanation covering core definitions, working mechanisms, and key properties.',
      modelAnswerSnippet: generateModelSnippet(qText, uniqueQWords),
    };
  }

  const answerLower = answer.toLowerCase();
  const words = answer.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Keyword coverage
  const matchedWords = uniqueQWords.filter((w) => answerLower.includes(w));
  const keywordCoverage = uniqueQWords.length > 0 ? matchedWords.length / uniqueQWords.length : 0.6;

  // Target depth based on marks (~8 words per mark)
  const targetWords = Math.max(15, maxMarks * 8);
  const lengthRatio = Math.min(1.0, wordCount / targetWords);

  // Structural indicators
  const hasBulletsOrNumbers = /(?:^|\n)\s*(?:[•\-\*]|\d+[\.\)])\s+/m.test(answer);
  const hasTransitionWords = /\b(because|therefore|furthermore|specifically|for example|in contrast|consequently|steps?|algorithm|complexity|output|input|condition|proof)\b/i.test(answer);
  const structureScore = (hasBulletsOrNumbers ? 0.5 : 0) + (hasTransitionWords ? 0.5 : 0.2);

  // Weighted overall quality (0..1)
  const quality = (keywordCoverage * 0.45) + (lengthRatio * 0.35) + (structureScore * 0.20);

  let rawScore = Math.round(quality * maxMarks);
  if (wordCount >= 3 && rawScore === 0) rawScore = 1;
  const score = Math.max(0, Math.min(maxMarks, rawScore));

  const strengths: string[] = [];
  if (matchedWords.length > 0) {
    const keyTerms = matchedWords.slice(0, 3).map((w) => `"${w}"`).join(', ');
    strengths.push(`Directly addressed core concepts including ${keyTerms}.`);
  }
  if (wordCount >= targetWords * 0.6) {
    strengths.push(`Provided substantive technical depth appropriate for a ${maxMarks}-mark question.`);
  }
  if (hasBulletsOrNumbers || hasTransitionWords) {
    strengths.push('Demonstrated organized reasoning with structured explanations.');
  }
  if (strengths.length === 0) {
    strengths.push('Attempted the question with relevant introductory context.');
  }

  const improvements: string[] = [];
  const missedWords = uniqueQWords.filter((w) => !answerLower.includes(w));
  if (missedWords.length > 0) {
    const missedTerms = missedWords.slice(0, 3).map((w) => `"${w}"`).join(', ');
    improvements.push(`Expand on related core terminology such as ${missedTerms}.`);
  }
  if (wordCount < targetWords * 0.75) {
    improvements.push(`Elaborate further on mechanisms and algorithmic or operational details (aim for ~${targetWords} words).`);
  }
  if (!hasBulletsOrNumbers) {
    improvements.push('Format multi-step points or advantages into clear bullet points or numbered steps for readability.');
  }
  if (!/\b(complexity|example|edge case|time|space|tradeoff|boundary)\b/i.test(answerLower)) {
    improvements.push('Include complexity analysis, edge cases, or concrete real-world examples to secure top marks.');
  }

  const pct = Math.round((score / maxMarks) * 100);
  let feedbackText = '';
  if (pct >= 85) {
    feedbackText = `Excellent answer demonstrating thorough mastery (${pct}%). Your response clearly covers the primary principles with solid explanatory clarity.`;
  } else if (pct >= 65) {
    feedbackText = `Good response covering the essential concepts (${pct}%). To achieve full marks, provide deeper technical rigor, edge cases, and formal step-by-step mechanisms.`;
  } else if (pct >= 40) {
    feedbackText = `Satisfactory foundational attempt (${pct}%). The core idea is present, but the answer lacks sufficient technical depth, formal terminology, and structured derivation expected for ${maxMarks} marks.`;
  } else {
    feedbackText = `Needs revision (${pct}%). The submission is brief or misses key subject elements. Review the reference notes and expand your explanation with step-by-step reasoning.`;
  }

  return {
    score,
    maxMarks,
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    feedbackText,
    modelAnswerSnippet: generateModelSnippet(qText, uniqueQWords),
  };
}

/**
 * Deterministically generates a structured tutoring hint without spoiling the full solution.
 */
export function generateFallbackHint(question: string, maxMarks?: number): { hint: string } {
  const qText = String(question || '').trim();
  const marks = Math.max(1, Math.round(Number(maxMarks) || 5));

  const isComparison = /\b(difference|compare|contrast|versus|vs\.?)\b/i.test(qText);
  const isAlgorithm = /\b(algorithm|sort|search|dijkstra|tree|graph|dp|dynamic|shortest|traversal|greedy)\b/i.test(qText);
  const isComplexity = /\b(complexity|time|space|big[\s-]o|recurrence|master|theta|omega)\b/i.test(qText);
  const isDefinition = /\b(what is|define|explain|state|describe)\b/i.test(qText);

  const bullets: string[] = [];

  if (isComparison) {
    bullets.push('• Frame your response across 3-4 distinct criteria: definition, operational mechanism, complexity, and primary use-case.');
    bullets.push('• Highlight the key trade-off (e.g. time vs. space, simplicity vs. optimality) where one approach outperforms the other.');
  } else if (isAlgorithm) {
    bullets.push('• Identify the data structure and invariant maintained at each step (e.g., visited set, distance array, or memoization table).');
    bullets.push('• Trace the state transition: how values update from the base condition through to the final target.');
    bullets.push('• State the resulting time and auxiliary space complexity in Big-O notation.');
  } else if (isComplexity) {
    bullets.push('• State the base recurrence relation or step cost clearly before simplifying.');
    bullets.push('• Identify the dominant term or apply standard theorem rules (e.g., Master Theorem case) step-by-step.');
  } else if (isDefinition) {
    bullets.push('• Start with a concise, rigorous 1-2 sentence academic definition.');
    bullets.push('• Detail 2-3 core properties, internal components, or operational rules.');
  } else {
    bullets.push('• Break the problem into its foundational premise, working mechanism, and expected outcome.');
    bullets.push('• Focus on key terminology and avoid high-level generalizations.');
  }

  bullets.push(`• Boundary checks: Note edge cases (empty inputs, single elements, or cyclic conditions) to substantiate full ${marks} marks.`);

  return {
    hint: bullets.join('\n'),
  };
}

/**
 * Deterministically grades a submitted timed mock exam question-by-question.
 */
export function generateFallbackMockExamReport(questions: any[]): any {
  const perQuestion = questions.map((q: any, index: number) => {
    const position = index + 1;
    const maxMarks = Math.max(1, Math.round(Number(q.marks) || 1));
    const answer = String(q.answer || '').trim();
    const evalResult = generateFallbackEvaluation(q.questionText, answer, maxMarks);
    return {
      index: position,
      score: evalResult.score,
      strengths: evalResult.strengths,
      improvements: evalResult.improvements,
      feedback: evalResult.feedbackText,
    };
  });

  const topicTotals = new Map<string, { score: number; maxMarks: number }>();
  questions.forEach((q, idx) => {
    const topic = String(q.topicName || 'General').trim() || 'General';
    const curr = topicTotals.get(topic) || { score: 0, maxMarks: 0 };
    curr.score += perQuestion[idx].score;
    curr.maxMarks += Math.max(1, Math.round(Number(q.marks) || 1));
    topicTotals.set(topic, curr);
  });

  const topicBreakdown = Array.from(topicTotals.entries()).map(([topic, totals]) => {
    const pct = totals.maxMarks > 0 ? (totals.score / totals.maxMarks) * 100 : 0;
    const mastery = pct >= 80 ? 'Mastered' : pct >= 50 ? 'Needs Review' : 'Weak';
    return {
      topic,
      score: totals.score,
      maxMarks: totals.maxMarks,
      mastery,
    };
  });

  const totalScore = perQuestion.reduce((sum, item) => sum + item.score, 0);
  const totalMax = questions.reduce((sum, q) => sum + Math.max(1, Math.round(Number(q.marks) || 1)), 0);
  const percentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  const weakTopics = topicBreakdown.filter((t) => t.mastery === 'Weak').map((t) => t.topic);
  const strongTopics = topicBreakdown.filter((t) => t.mastery === 'Mastered').map((t) => t.topic);

  let advice = `Overall Exam Performance: ${totalScore}/${totalMax} (${percentage}%).\n`;
  if (strongTopics.length > 0) {
    advice += `Strong mastery demonstrated in ${strongTopics.join(', ')}. Keep reinforcement steady.\n`;
  }
  if (weakTopics.length > 0) {
    advice += `High priority for immediate revision: ${weakTopics.join(', ')}. Dedicate focused problem-solving blocks to these concepts.\n`;
  } else {
    advice += 'Consistent performance across all tested topics. Focus next on timed speed and edge-case proofs under strict exam conditions.\n';
  }
  advice += 'Review question-level feedback to address specific missed terminology and depth criteria.';

  return {
    perQuestion,
    overall: { advice },
    topicBreakdown,
  };
}

/**
 * Deterministically analyzes academic document text into structured topics and extracted questions.
 */
export function generateFallbackDocumentAnalysis(
  content: string,
  documentName: string,
  documentType: string
): any {
  const text = String(content || '').trim();
  const name = String(documentName || 'Academic Document').trim();
  const isPastPaper = /past|paper|exam|question|pyq/i.test(documentType) || /past|exam|test/i.test(name);

  // 1. Try extracting syllabus topics
  const syllabusTopics = extractSyllabusTopics(text);
  // 2. Try extracting numbered questions
  const questionRecords = extractNumberedQuestionRecords(text);

  let topics: Array<{ name: string; priority: number; weightage: number; source: string }> = [];
  let extractedQuestions: Array<{
    id: string;
    topic: string;
    question: string;
    marks: number;
    type: string;
    suggestedTimeMinutes: number;
  }> = [];

  if (syllabusTopics.length > 0) {
    const totalTopics = syllabusTopics.length;
    topics = syllabusTopics.slice(0, 10).map((t, idx) => ({
      name: t.name,
      priority: Math.max(1, 5 - Math.floor(idx / 2)),
      weightage: t.weightage ? Math.round(t.weightage) : Math.max(5, Math.round(100 / Math.min(totalTopics, 10))),
      source: 'extracted',
    }));
  }

  if (questionRecords.length > 0) {
    extractedQuestions = questionRecords.map((q, idx) => {
      const marks = q.marks || 5;
      const mappedTopic = topics.length > 0 ? topics[idx % topics.length].name : 'General';
      return {
        id: `q-${idx + 1}`,
        topic: mappedTopic,
        question: q.text + (q.context ? ` [Context: ${q.context}]` : ''),
        marks,
        type: marks > 5 ? 'Long Answer' : 'Short Answer',
        suggestedTimeMinutes: Math.max(2, Math.round(marks * 1.5)),
      };
    });

    if (topics.length === 0) {
      const detectedTopics = new Set<string>();
      for (const q of questionRecords) {
        const words = q.text.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter((w) => w.length > 4);
        if (words.length > 0) {
          const capitalized = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
          detectedTopics.add(capitalized);
        }
      }
      const list = Array.from(detectedTopics).slice(0, 6);
      if (list.length === 0) list.push('Core Subject Topics');
      topics = list.map((tName, idx) => ({
        name: tName,
        priority: Math.max(1, 5 - idx),
        weightage: Math.round(100 / list.length),
        source: 'extracted',
      }));
    }
  }

  if (topics.length === 0) {
    const candidateLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3 && l.length < 60 && !/^\d+$/.test(l));
    const uniqueLines = Array.from(new Set(candidateLines)).slice(0, 5);
    const chosenTopics = uniqueLines.length > 0 ? uniqueLines : ['Foundational Concepts', 'Applied Methods', 'Advanced Principles'];
    topics = chosenTopics.map((tName, idx) => ({
      name: tName,
      priority: Math.max(1, 5 - idx),
      weightage: Math.round(100 / chosenTopics.length),
      source: 'extracted',
    }));
  }

  if (extractedQuestions.length === 0 && isPastPaper) {
    extractedQuestions = topics.slice(0, 5).map((t, idx) => ({
      id: `q-${idx + 1}`,
      topic: t.name,
      question: `Explain the fundamental principles, operational mechanism, and real-world applications of ${t.name}.`,
      marks: 10,
      type: 'Long Answer',
      suggestedTimeMinutes: 15,
    }));
  }

  const summary = `Successfully extracted ${topics.length} topics and ${extractedQuestions.length} questions from ${name}.`;

  return {
    title: name,
    summary,
    topics,
    extractedQuestions,
  };
}

/**
 * Deterministically creates a day-by-day revision schedule for target exam and topics.
 */
export function generateFallbackStudyPlan(
  examNameInput?: string,
  examDateInput?: string,
  dailyHoursInput?: number,
  topicsInput?: string[]
): any {
  const examName = String(examNameInput || 'Target Examination').trim() || 'Target Examination';
  const dailyHours = Math.max(1, Math.min(16, Number(dailyHoursInput) || 4));
  const topics = Array.isArray(topicsInput) && topicsInput.length > 0
    ? topicsInput.map(String).filter((t) => t.trim().length > 0)
    : ['Core Concepts', 'Algorithmic Methods', 'System Architecture', 'Practice & Revision'];

  let totalDays = 7;
  if (examDateInput) {
    const targetDate = new Date(examDateInput);
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0 && diffDays <= 60) {
      totalDays = diffDays;
    }
  }

  const dailySchedule: Array<{
    day: number;
    date: string;
    topic: string;
    hours: number;
    focus: string;
    status: string;
  }> = [];

  const now = new Date();
  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(now.getTime() + (day - 1) * 24 * 60 * 60 * 1000);
    const dateStr = dateObj.toISOString().split('T')[0];
    const topic = topics[(day - 1) % topics.length];

    let focus = '';
    if (day === totalDays) {
      focus = 'Final full revision, high-yield formula recap, and mock exam review.';
    } else if (day === totalDays - 1) {
      focus = 'Comprehensive timed mock exam practice under simulated test conditions.';
    } else if (day % 3 === 0) {
      focus = `Past-paper problem solving and edge-case analysis for ${topic}.`;
    } else if (day % 2 === 0) {
      focus = `Detailed mechanisms, proofs, and active recall practice for ${topic}.`;
    } else {
      focus = `Foundational theory, core definitions, and notes synthesis for ${topic}.`;
    }

    dailySchedule.push({
      day,
      date: dateStr,
      topic,
      hours: dailyHours,
      focus,
      status: 'scheduled',
    });
  }

  return {
    title: `${examName} Structured Revision Plan`,
    totalDays,
    dailySchedule,
  };
}
