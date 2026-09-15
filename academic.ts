/**
 * Academic Document Processing & Intelligence
 *
 * Deterministic syllabus parsing, PYQ extraction, question normalisation,
 * duplicate detection, topic mapping, and evidence-based priority scoring.
 */

// ─── Syllabus Parsing ──────────────────────────────────────────────────────────

export interface ParsedUnit {
  unitNumber: number | null;
  unitTitle: string;
  topics: string[];
}

/**
 * Parse syllabus text into structured units → topics.
 * Handles "Unit 1:", "Module 2 –", "Chapter 3.", numbered lists, and bullet lists.
 */
export function parseSyllabus(text: string): ParsedUnit[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const units: ParsedUnit[] = [];
  let current: ParsedUnit | null = null;

  const unitHeadingRe = /^(?:unit|module|chapter|section)\s*(\d+)\s*[:\-–.]\s*(.+)/i;
  const numberedItemRe = /^\d+[.)]\s+(.+)/;
  const bulletItemRe = /^[-•*]\s+(.+)/;

  for (const line of lines) {
    const unitMatch = line.match(unitHeadingRe);
    if (unitMatch) {
      if (current) units.push(current);
      current = {
        unitNumber: parseInt(unitMatch[1], 10),
        unitTitle: unitMatch[2].trim(),
        topics: [],
      };
      // The unit title line might also contain comma-separated topics
      const inlineTopics = unitMatch[2].split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 2);
      if (inlineTopics.length > 1) {
        current.topics.push(...inlineTopics);
      }
      continue;
    }

    const numberedMatch = line.match(numberedItemRe);
    const bulletMatch = line.match(bulletItemRe);
    const topicText = numberedMatch?.[1] || bulletMatch?.[1];

    if (topicText && current) {
      // Might contain comma-separated sub-topics
      const subs = topicText.split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 2);
      current.topics.push(...(subs.length > 0 ? subs : [topicText]));
    } else if (topicText && !current) {
      // Topic line before any unit heading → create implicit unit
      if (!current) {
        current = { unitNumber: null, unitTitle: 'General', topics: [] };
      }
      current.topics.push(topicText);
    } else if (current && line.length > 3 && line.length < 120 && !line.match(/^(question|q\s)/i)) {
      // Heuristic: short non-question lines under a unit → treat as topics
      const subs = line.split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 2);
      if (subs.length > 0) current.topics.push(...subs);
    }
  }
  if (current) units.push(current);

  return units;
}

/**
 * Flatten parsed units into unique topic name list.
 */
export function extractTopicNames(units: ParsedUnit[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const unit of units) {
    // Always include unit title as a topic
    const title = unit.unitTitle.trim();
    if (title && title !== 'General' && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      result.push(title);
    }
    for (const topic of unit.topics) {
      const key = topic.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(topic);
      }
    }
  }
  return result;
}

// ─── PYQ Extraction ─────────────────────────────────────────────────────────────

export interface ExtractedQuestion {
  questionText: string;
  marks: number | null;
  year: string | null;
  questionType: string;
  source: string;
}

/**
 * Extract individual questions from past paper text.
 * Handles patterns: "Q1.", "Question 1)", "1.", "1)", "Q.1", and multi-line.
 */
export function extractQuestions(text: string, documentName?: string): ExtractedQuestion[] {
  const lines = text.split(/\r?\n/);
  const questions: ExtractedQuestion[] = [];

  // Match question-start patterns
  const qStartRe = /^\s*(?:q(?:uestion)?\.?\s*)?(\d+)\s*[.):\-]\s*/i;

  let currentQ: string[] = [];
  let currentMarks: number | null = null;

  const flushQuestion = () => {
    if (currentQ.length === 0) return;
    const rawText = currentQ.join(' ').trim();
    if (rawText.length < 5) { currentQ = []; currentMarks = null; return; }

    const marksMatch = rawText.match(/\[?\(?\s*(\d+)\s*marks?\s*\]?\)?/i) ||
                       rawText.match(/\((\d+)\s*(?:marks?|pts?|points?)\)/i);
    const marks = currentMarks || (marksMatch ? parseInt(marksMatch[1], 10) : null);

    // Try to extract year from document name
    const yearMatch = documentName?.match(/(20\d{2})/);

    questions.push({
      questionText: normalizeQuestionText(rawText),
      marks,
      year: yearMatch?.[1] || null,
      questionType: inferQuestionType(rawText),
      source: documentName || 'pasted',
    });
    currentQ = [];
    currentMarks = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const qMatch = trimmed.match(qStartRe);
    if (qMatch) {
      flushQuestion();
      const rest = trimmed.replace(qStartRe, '').trim();
      if (rest) currentQ.push(rest);

      // Check for marks annotation in the line itself  
      const marksInLine = trimmed.match(/\[?\(?\s*(\d+)\s*marks?\s*\]?\)?/i);
      if (marksInLine) currentMarks = parseInt(marksInLine[1], 10);
    } else if (currentQ.length > 0) {
      // Continuation of current question
      currentQ.push(trimmed);
    }
  }
  flushQuestion();

  return questions;
}

// ─── Question Normalisation ─────────────────────────────────────────────────────

/**
 * Normalise question text: collapse whitespace, strip marks annotations,
 * remove leading numbering, trim.
 */
export function normalizeQuestionText(text: string): string {
  return text
    .replace(/\[?\(?\s*\d+\s*(marks?|pts?|points?)\s*\]?\)?/gi, '')  // remove marks annotations
    .replace(/^\s*(?:q(?:uestion)?\.?\s*)?\d+\s*[.):\-]\s*/i, '')  // remove leading Q numbering
    .replace(/\s+/g, ' ')
    .trim();
}

function inferQuestionType(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(code|algorithm|implement|program|write a function)\b/.test(lower)) return 'Code/Algorithm';
  if (/\b(prove|proof|derive|derivation)\b/.test(lower)) return 'Long Proof';
  if (/\b(calculate|compute|solve|find the value|numerical)\b/.test(lower)) return 'Numerical';
  return 'Subjective';
}

// ─── Near-Duplicate Detection ────────────────────────────────────────────────────

/**
 * Tokenise text for comparison: lowercase, remove punctuation, split to words.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
}

/**
 * Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove near-duplicate questions. Returns deduplicated list.
 * When duplicates found, keeps the one with more metadata (marks, longer text).
 */
export function deduplicateQuestions(questions: ExtractedQuestion[], threshold = 0.75): ExtractedQuestion[] {
  const tokenized = questions.map((q) => tokenize(q.questionText));
  const keep = new Array(questions.length).fill(true);

  for (let i = 0; i < questions.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < questions.length; j++) {
      if (!keep[j]) continue;
      const sim = jaccardSimilarity(tokenized[i], tokenized[j]);
      if (sim >= threshold) {
        // Keep the one with more info
        const scoreI = (questions[i].marks ? 1 : 0) + questions[i].questionText.length;
        const scoreJ = (questions[j].marks ? 1 : 0) + questions[j].questionText.length;
        if (scoreI >= scoreJ) {
          keep[j] = false;
        } else {
          keep[i] = false;
          break;
        }
      }
    }
  }

  return questions.filter((_, i) => keep[i]);
}

// ─── Deterministic Topic Mapping ─────────────────────────────────────────────────

export interface TopicMapping {
  topicName: string | null;
  confidence: number;
}

/**
 * Map a question to the best-matching topic using keyword overlap.
 * Returns null topic if confidence is below threshold (unmatched).
 */
export function mapQuestionToTopic(
  questionText: string,
  topicNames: string[],
  threshold = 0.08,
): TopicMapping {
  if (topicNames.length === 0) return { topicName: null, confidence: 0 };

  const qTokens = tokenize(questionText);
  if (qTokens.length === 0) return { topicName: null, confidence: 0 };

  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const topic of topicNames) {
    const topicTokens = tokenize(topic);
    if (topicTokens.length === 0) continue;

    // Count how many topic tokens appear in the question
    let matchCount = 0;
    for (const tt of topicTokens) {
      // Also check partial/substring match for compound terms, but only if length > 3
      if (qTokens.some((qt) => qt === tt || (tt.length > 3 && (qt.includes(tt) || tt.includes(qt))))) {
        matchCount++;
      }
    }
    // Score: fraction of topic tokens found in question, weighted by question relevance
    const score = matchCount / topicTokens.length;

    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  if (bestScore < threshold) {
    return { topicName: null, confidence: bestScore };
  }

  return { topicName: bestTopic, confidence: bestScore };
}

// ─── Priority Calculation ────────────────────────────────────────────────────────

export interface TopicPriority {
  topicName: string;
  topicId: string;
  priorityScore: number;       // 1-10
  frequencyCount: number;
  totalMarks: number;
  avgMarks: number;
  inSyllabus: boolean;
  evidence: string;            // human-readable explanation
}

export interface PriorityInput {
  topicId: string;
  topicName: string;
  source: string;              // 'extracted' from syllabus, etc.
  questionCount: number;
  totalMarks: number;
}

/**
 * Calculate evidence-based topic priorities.
 *
 * Formula:
 *  - frequencyScore   = min(5, questionCount) → normalised 0-5
 *  - marksScore       = min(3, avgMarks / 4)  → normalised 0-3
 *  - syllabusBonus    = inSyllabus ? 2 : 0
 *  - priorityScore    = clamp(1, 10, frequencyScore + marksScore + syllabusBonus)
 */
export function calculateTopicPriorities(inputs: PriorityInput[]): TopicPriority[] {
  return inputs.map((input) => {
    const avgMarks = input.questionCount > 0 ? input.totalMarks / input.questionCount : 0;
    const frequencyScore = Math.min(5, input.questionCount);
    const marksScore = Math.min(3, avgMarks / 4);
    const inSyllabus = input.source === 'syllabus' || input.source === 'extracted';
    const syllabusBonus = inSyllabus ? 2 : 0;
    const raw = frequencyScore + marksScore + syllabusBonus;
    const priorityScore = Math.max(1, Math.min(10, Math.round(raw)));

    // Build human-readable evidence
    const parts: string[] = [];
    if (input.questionCount > 0) {
      parts.push(`appeared in ${input.questionCount} PYQ question${input.questionCount > 1 ? 's' : ''}`);
    }
    if (avgMarks > 0) {
      parts.push(`avg ${avgMarks.toFixed(1)} marks per question`);
    }
    if (input.questionCount === 0 && inSyllabus) {
      parts.push('listed in syllabus but no PYQ questions found yet');
    }
    if (inSyllabus) {
      parts.push('present in course syllabus');
    }

    const levelWord = priorityScore >= 8 ? 'High' : priorityScore >= 5 ? 'Medium' : 'Low';
    const evidence = parts.length > 0
      ? `${levelWord} priority: ${parts.join('; ')}.`
      : `${levelWord} priority: baseline score assigned.`;

    return {
      topicName: input.topicName,
      topicId: input.topicId,
      priorityScore,
      frequencyCount: input.questionCount,
      totalMarks: input.totalMarks,
      avgMarks: Math.round(avgMarks * 10) / 10,
      inSyllabus,
      evidence,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || b.frequencyCount - a.frequencyCount);
}
