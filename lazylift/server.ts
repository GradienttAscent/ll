import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

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

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// AI Document Analysis: Syllabus / Past Paper Extraction
app.post('/api/gemini/analyze-document', async (req, res) => {
  try {
    const { documentName, documentType, content } = req.body;
    const ai = getAIClient();

    if (!ai) {
      // Fallback fallback response when key is not provided
      return res.json({
        success: true,
        source: 'simulated',
        data: {
          title: documentName || 'Extracted Exam Topics',
          summary: `Extracted key topics and weightage from ${documentName || 'uploaded document'}.`,
          topics: [
            { name: 'Graph Algorithms & Dijkstra', weightage: 28, frequencyCount: 14, difficulty: 'Hard', highYield: true },
            { name: 'Dynamic Programming & Memoization', weightage: 24, frequencyCount: 12, difficulty: 'Hard', highYield: true },
            { name: 'Big O Time Complexity Analysis', weightage: 18, frequencyCount: 9, difficulty: 'Medium', highYield: false },
            { name: 'Binary Search Trees & AVL', weightage: 16, frequencyCount: 8, difficulty: 'Medium', highYield: false },
            { name: 'Sorting & Hash Tables', weightage: 14, frequencyCount: 7, difficulty: 'Easy', highYield: false },
          ],
          extractedQuestions: [
            {
              id: 'q1',
              topic: 'Graph Algorithms',
              question: 'Explain Dijkstra\'s algorithm for single-source shortest paths. What is the time complexity when using a Binary Heap vs Priority Queue?',
              marks: 10,
              type: 'Subjective',
              suggestedTimeMinutes: 15,
            },
            {
              id: 'q2',
              topic: 'Dynamic Programming',
              question: 'Solve the Longest Common Subsequence problem for strings X = "ABCBDAB" and Y = "BDCABA". Provide the DP transition state table.',
              marks: 12,
              type: 'Subjective',
              suggestedTimeMinutes: 20,
            },
            {
              id: 'q3',
              topic: 'Big O Time Complexity',
              question: 'Analyze the recurrences: (a) T(n) = 2T(n/2) + n, (b) T(n) = T(n-1) + 1 using the Master Theorem or Recursion Tree method.',
              marks: 8,
              type: 'Subjective',
              suggestedTimeMinutes: 10,
            }
          ]
        }
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
    return res.json({ success: true, source: 'gemini', data: parsed });
  } catch (err: any) {
    console.error('Gemini error analyzing document:', err);
    return res.status(500).json({ error: err.message || 'Failed to analyze document' });
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
    console.log(`LazyLift server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
