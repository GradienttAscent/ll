import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { initDatabase, getDatabase, DEFAULT_COURSE_ID, DatabaseWrapper } from './db';

dotenv.config({ path: fs.existsSync('.env.local') ? '.env.local' : '.env' });

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Global db instance - will be initialized before server starts
let db: DatabaseWrapper;

type TopicInput = {
  name: string;
  priority?: number;
  weightage?: number;
  source?: string;
  courseId?: string;
};

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

function topicRows() {
  return db.prepare(`
    SELECT id, course_id AS courseId, name, priority, weightage, source, created_at AS createdAt
    FROM topics ORDER BY created_at DESC
  `).all();
}

function saveTopics(topics: TopicInput[]) {
  const insert = db.prepare(`
    INSERT INTO topics (id, course_id, name, priority, weightage, source, created_at)
    VALUES (@id, @courseId, @name, @priority, @weightage, @source, @createdAt)
    ON CONFLICT(course_id, name) DO UPDATE SET
      priority = excluded.priority,
      weightage = excluded.weightage,
      source = excluded.source
  `);
  const saveAll = db.transaction((items: TopicInput[]) => {
    for (const topic of items) {
      if (!topic.name?.trim()) continue;
      insert.run({
        id: createId('topic'),
        courseId: topic.courseId || DEFAULT_COURSE_ID,
        name: topic.name.trim(),
        priority: Math.max(1, Math.min(10, Number(topic.priority) || 5)),
        weightage: Math.max(1, Number(topic.weightage) || 10),
        source: topic.source || 'extracted',
        createdAt: now(),
      });
    }
  });
  saveAll(topics);
  return topicRows();
}

function scheduleBlockRows() {
  return db.prepare(`
    SELECT b.id, b.topic_id AS topicId, t.name AS topicName, b.title, b.date,
      b.start_time AS startTime, b.duration_minutes AS durationMinutes,
      CAST(b.completed AS INTEGER) AS completed, b.created_at AS createdAt
    FROM schedule_blocks b
    JOIN topics t ON t.id = b.topic_id
    ORDER BY b.date ASC, b.start_time ASC
  `).all();
}

function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function localAcademicAnalysis(content: string, documentName: string) {
  const topicPatterns: Array<[string, RegExp]> = [
    ['Graphs and Traversal', /\b(graph|bfs|dfs|traversal|dijkstra)\b/gi],
    ['Trees and AVL Rotations', /\b(tree|avl|binary search tree|rotation)\b/gi],
    ['Linked Lists', /\b(linked[ -]?list|insertion|deletion)\b/gi],
    ['Stacks and Queues', /\b(stack|queue)\b/gi],
    ['Arrays', /\b(array|arrays)\b/gi],
    ['Dynamic Programming', /\b(dynamic programming|knapsack|memoization)\b/gi],
    ['Algorithm Complexity', /\b(big o|complexity|master theorem)\b/gi],
  ];
  const matched: Array<{ name: string; count: number }> = topicPatterns.map(([name, pattern]) => ({
    name,
    count: (content.match(pattern as RegExp) || []).length,
  })).filter((topic) => topic.count > 0);
  const headings = content.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
    .filter((line) => line.length > 2 && line.length < 70 && /:$/.test(line))
    .map((line) => ({ name: line.replace(/:$/, ''), count: 1 }));
  const candidates = matched.length > 0 ? matched : headings.length > 0 ? headings : [{ name: 'Academic Material Review', count: 1 }];
  const total = candidates.reduce((sum, topic) => sum + topic.count, 0);
  const topics = candidates.slice(0, 6).map((topic) => ({
    name: topic.name,
    priority: Math.min(10, 4 + topic.count * 2),
    weightage: Math.max(5, Math.round((topic.count / total) * 100)),
    source: 'extracted',
  }));
  const questionLines = content.split(/\r?\n/)
    .filter((line) => /^\s*(?:q(?:uestion)?\s*)?\d+[.)]/i.test(line))
    .slice(0, 8);
  const questions = questionLines.map((line, index) => ({
    id: `local-q-${index + 1}`,
    topic: topics.find((topic) => new RegExp(topic.name.split(' ')[0], 'i').test(line))?.name || topics[0].name,
    question: line.replace(/^\s*(?:q(?:uestion)?\s*)?\d+[.)]\s*/i, ''),
    marks: Number((line.match(/\[(\d+)\s*marks?\]/i) || [])[1]) || 10,
    type: 'Subjective',
    suggestedTimeMinutes: 15,
  }));
  return {
    title: documentName || 'Academic Topic Extraction',
    summary: `Extracted ${topics.length} topic${topics.length === 1 ? '' : 's'} from the supplied academic text.`,
    topics,
    extractedQuestions: questions,
  };
}

function normalizeAnalysis(raw: any, content: string, documentName: string) {
  const fallback = localAcademicAnalysis(content, documentName);
  if (!Array.isArray(raw?.topics) || raw.topics.length === 0) return fallback;
  const topics = raw.topics.slice(0, 8).map((topic: any, index: number) => ({
    name: String(topic.name || `Topic ${index + 1}`).trim(),
    priority: Math.max(1, Math.min(10, Number(topic.priority) || (topic.highYield ? 9 : 6))),
    weightage: Math.max(1, Number(topic.weightage) || Math.round(100 / raw.topics.length)),
    source: 'extracted',
  })).filter((topic: TopicInput) => topic.name);
  return {
    title: raw.title || fallback.title,
    summary: raw.summary || fallback.summary,
    topics,
    extractedQuestions: Array.isArray(raw.extractedQuestions) ? raw.extractedQuestions : fallback.extractedQuestions,
  };
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.get('/api/topics', (_req, res) => {
  res.json({ topics: topicRows() });
});

app.post('/api/topics', (req, res) => {
  const topic = req.body as TopicInput;
  if (!topic.name?.trim()) return res.status(400).json({ error: 'Topic name is required.' });
  const topics = saveTopics([topic]);
  return res.status(201).json({ topics });
});

app.post('/api/topics/bulk', (req, res) => {
  const topics = req.body?.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    return res.status(400).json({ error: 'A non-empty topics array is required.' });
  }
  return res.status(201).json({ topics: saveTopics(topics) });
});

app.get('/api/schedule-blocks', (_req, res) => {
  res.json({ scheduleBlocks: scheduleBlockRows() });
});

app.post('/api/schedule-blocks', (req, res) => {
  const block = req.body;
  if (!block.topicId || !block.title || !block.date || !block.startTime || !block.durationMinutes) {
    return res.status(400).json({ error: 'topicId, title, date, startTime, and durationMinutes are required.' });
  }
  const topic = db.prepare('SELECT id FROM topics WHERE id = ?').get(block.topicId);
  if (!topic) return res.status(400).json({ error: 'The selected topic does not exist.' });
  db.prepare(`INSERT INTO schedule_blocks
    (id, topic_id, title, date, start_time, duration_minutes, completed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(createId('block'), block.topicId, block.title, block.date, block.startTime,
      Math.max(1, Number(block.durationMinutes)), block.completed ? 1 : 0, now());
  return res.status(201).json({ scheduleBlocks: scheduleBlockRows() });
});

app.post('/api/schedule-blocks/bulk', (req, res) => {
  const blocks = req.body?.scheduleBlocks;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: 'A non-empty scheduleBlocks array is required.' });
  }
  const insert = db.prepare(`INSERT INTO schedule_blocks
    (id, topic_id, title, date, start_time, duration_minutes, completed, created_at)
    VALUES (@id, @topicId, @title, @date, @startTime, @durationMinutes, @completed, @createdAt)`);
  const saveAll = db.transaction((items: any[]) => {
    for (const block of items) {
      if (!block.topicId || !block.title || !block.date || !block.startTime || !block.durationMinutes) {
        throw new Error('Each schedule block requires topicId, title, date, startTime, and durationMinutes.');
      }
      if (!db.prepare('SELECT id FROM topics WHERE id = ?').get(block.topicId)) {
        throw new Error(`Topic ${block.topicId} does not exist.`);
      }
      insert.run({
        id: createId('block'), topicId: block.topicId, title: block.title, date: block.date,
        startTime: block.startTime, durationMinutes: Math.max(1, Number(block.durationMinutes)),
        completed: block.completed ? 1 : 0, createdAt: now(),
      });
    }
  });
  try {
    saveAll(blocks);
    return res.status(201).json({ scheduleBlocks: scheduleBlockRows() });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Unable to save schedule blocks.' });
  }
});

app.patch('/api/schedule-blocks/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM schedule_blocks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Schedule block not found.' });
  if (typeof req.body.completed === 'boolean') {
    db.prepare('UPDATE schedule_blocks SET completed = ? WHERE id = ?').run(req.body.completed ? 1 : 0, req.params.id);
  }
  return res.json({ scheduleBlocks: scheduleBlockRows() });
});

app.post('/api/study-sessions', (req, res) => {
  const { scheduleBlockId, durationMinutes } = req.body || {};
  if (!scheduleBlockId) return res.status(400).json({ error: 'scheduleBlockId is required.' });
  const block = db.prepare('SELECT id, duration_minutes FROM schedule_blocks WHERE id = ?').get(scheduleBlockId) as any;
  if (!block) return res.status(400).json({ error: 'Schedule block not found.' });
  const session = {
    id: createId('session'), scheduleBlockId, startedAt: now(),
    durationMinutes: Math.max(1, Number(durationMinutes) || block.duration_minutes), status: 'active',
  };
  db.prepare(`INSERT INTO study_sessions (id, schedule_block_id, started_at, duration_minutes, status)
    VALUES (@id, @scheduleBlockId, @startedAt, @durationMinutes, @status)`).run(session);
  return res.status(201).json({ studySession: session });
});

app.patch('/api/study-sessions/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM study_sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Study session not found.' });
  const status = req.body?.status;
  if (!['active', 'paused', 'completed', 'stopped'].includes(status)) {
    return res.status(400).json({ error: 'A valid session status is required.' });
  }
  db.prepare('UPDATE study_sessions SET status = ? WHERE id = ?').run(status, req.params.id);
  return res.json({ studySession: { id: req.params.id, status } });
});

// AI Document Analysis: Syllabus / Past Paper Extraction
app.post('/api/gemini/analyze-document', async (req, res) => {
  try {
    const { documentName, documentType, content } = req.body;
    const ai = getAIClient();
    const suppliedText = String(content || '');

    if (!ai) {
      return res.json({
        success: true,
        source: 'local-fallback',
        data: localAcademicAnalysis(suppliedText, documentName),
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Analyze the following academic document (${documentType}: ${documentName}) content and extract topic weightages, frequency counts, difficulty levels, and representative exam questions.
Content:
${content ? content.substring(0, 4000) : 'Sample university past question paper for Data Structures & Algorithms'}`,
      config: {
        systemInstruction: 'You are an expert university professor analyzing past papers and syllabi for exam preparation.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
          topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  priority: { type: Type.NUMBER },
                  weightage: { type: Type.NUMBER },
                  frequencyCount: { type: Type.NUMBER },
                  difficulty: { type: Type.STRING },
                  highYield: { type: Type.BOOLEAN },
                },
              },
            },
            extractedQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  question: { type: Type.STRING },
                  marks: { type: Type.NUMBER },
                  type: { type: Type.STRING },
                  suggestedTimeMinutes: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, source: 'gemini', data: normalizeAnalysis(parsed, suppliedText, documentName) });
  } catch (err: any) {
    console.error('Gemini error analyzing document:', err);
    return res.json({
      success: true,
      source: 'local-fallback',
      data: localAcademicAnalysis(String(req.body?.content || ''), req.body?.documentName),
    });
  }
});

// AI Evaluation of Practice Answers
app.post('/api/gemini/evaluate-answer', async (req, res) => {
  try {
    const { question, studentAnswer, maxMarks } = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.json({
        success: true,
        source: 'simulated',
        data: {
          score: Math.min(maxMarks || 10, 8.5),
          maxMarks: maxMarks || 10,
          strengths: ['Accurately identified core base cases', 'Correct algorithm initialization parameters'],
          improvements: ['Could elaborate on edge cases with negative cycle detection', 'Time complexity analysis was slightly vague'],
          feedbackText: 'Great attempt! Your structure demonstrates solid understanding of graph relaxation. To score full marks on a final exam, explicitly state array initialization boundary constraints.',
          modelAnswerSnippet: 'Initialize dist[] with infinity, set dist[src] = 0. Extract minimum vertex u from Priority Queue, iterate over neighbors v, and if dist[u] + weight(u,v) < dist[v], update dist[v] and decrease key in O((V + E) log V).'
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Question (Max marks: ${maxMarks || 10}): "${question}"
Student's Submitted Answer: "${studentAnswer}"

Provide detailed evaluation, numerical score out of ${maxMarks || 10}, strengths, areas for improvement, constructive feedback, and a concise model answer snippet.`,
      config: {
        systemInstruction: 'You are an empathetic, rigorous academic exam grader.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            maxMarks: { type: Type.NUMBER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            feedbackText: { type: Type.STRING },
            modelAnswerSnippet: { type: Type.STRING },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, source: 'gemini', data: parsed });
  } catch (err: any) {
    console.error('Gemini evaluation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to evaluate answer' });
  }
});

// AI Study Plan Generator
app.post('/api/gemini/generate-plan', async (req, res) => {
  try {
    const { examName, examDate, dailyStudyHours, topics } = req.body;
    const ai = getAIClient();

    if (!ai) {
      return res.json({
        success: true,
        source: 'simulated',
        data: {
          title: `Personalized Revision Blueprint for ${examName || 'Algorithms'}`,
          totalDays: 21,
          dailySchedule: [
            { day: 1, date: 'Today', topic: 'Graph Algorithms & Priority Queues', hours: dailyStudyHours || 4, focus: 'Dijkstra Implementation & Proofs', status: 'In Progress' },
            { day: 2, date: 'Tomorrow', topic: 'Bellman-Ford & All-Pairs Shortest Path', hours: dailyStudyHours || 4, focus: 'Floyd-Warshall DP Transition Matrix', status: 'Upcoming' },
            { day: 3, date: 'Day 3', topic: 'Dynamic Programming Core', hours: dailyStudyHours || 4, focus: 'Knapsack 0/1 & Memoization Trees', status: 'Upcoming' },
            { day: 4, date: 'Day 4', topic: 'Big O Notation & Master Theorem', hours: dailyStudyHours || 3, focus: 'Asymptotic Bounds & Recurrence Solving', status: 'Upcoming' },
            { day: 5, date: 'Day 5', topic: 'Timed Mock Exam #1 & AI Review', hours: 3.5, focus: 'Simulated 3-hour Paper + Feedback Analysis', status: 'Upcoming' },
          ]
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Create a day-by-day revision study schedule for target exam "${examName}" on ${examDate}.
Daily available hours: ${dailyStudyHours || 4}.
Topics to cover: ${JSON.stringify(topics || ['Graph Algorithms', 'Dynamic Programming', 'Complexity'])}.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            totalDays: { type: Type.NUMBER },
            dailySchedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.NUMBER },
                  date: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  hours: { type: Type.NUMBER },
                  focus: { type: Type.STRING },
                  status: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, source: 'gemini', data: parsed });
  } catch (err: any) {
    console.error('Gemini plan error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate study plan' });
  }
});

// Start Express server and Vite middleware
async function startServer() {
  // Initialize database
  await initDatabase();
  db = await getDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LazyLift server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
