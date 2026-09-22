import React, { useState, useEffect } from 'react';
import { StudySession, FeedbackEntry, MockExamRecord } from '../types';
import { safeNumber } from '../utils/formatters';
import { History, Clock, Star, MessageSquare, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Award } from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [mockExams, setMockExams] = useState<MockExamRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, feedbackRes, mockRes] = await Promise.all([
        fetch('/api/study-sessions'),
        fetch('/api/feedback'),
        fetch('/api/mock-exams')
      ]);

      if (!sessionsRes.ok) throw new Error('Failed to fetch study sessions');
      if (!feedbackRes.ok) throw new Error('Failed to fetch feedback history');
      if (!mockRes.ok) throw new Error('Failed to fetch mock exam history');

      const sessionsData = await sessionsRes.json();
      const feedbackData = await feedbackRes.json();
      const mockData = await mockRes.json();

      setSessions(sessionsData.studySessions || []);
      setFeedbackList(feedbackData.feedback || []);
      setMockExams(mockData.mockExams || []);
    } catch (err: any) {
      setError(err.message || 'Error loading session history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const feedbackBySessionId = new Map<string, FeedbackEntry>();
  feedbackList.forEach((fb) => {
    if (fb.sessionId) {
      feedbackBySessionId.set(fb.sessionId, fb);
    }
  });

  const formatDuration = (seconds: any) => {
    const sec = safeNumber(seconds, 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-8 space-y-12 animate-fade-in pb-16">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDE7F3] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
            <History className="w-3 h-3 text-[#5E35B1]" /> Focus Logs &bull; Study History
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
            Executed Sessions &amp; Feedback
          </h1>
          <p className="text-xs text-[#7B7484] font-sans mt-2">
            Complete record of your executed study blocks and post-session self-evaluations.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="p-3 rounded-xl border border-[#EDE7F3] bg-white hover:bg-[#FAF8FC] text-[#5E35B1] transition-colors shadow-2xs self-start sm:self-auto"
          title="Refresh History"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Timed Mock Exams */}
      {mockExams.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EDE7F6] text-[#5E35B1] flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Gemini-Graded Mock Exams</div>
                <h2 className="font-serif text-2xl italic font-normal text-[#1C1B1F]">Timed Mock Exam Results</h2>
              </div>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-[#7B7484] font-mono">
              {mockExams.length} attempt{mockExams.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-3">
            {mockExams.map((exam) => (
              <div key={exam.id} className="rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-serif italic text-[#1C1B1F] font-bold">{exam.examName}</div>
                    <div className="text-[9px] uppercase tracking-widest text-[#7B7484] mt-0.5 font-mono">
                      Completed: {new Date(exam.endedAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="font-serif text-3xl italic font-normal text-[#5E35B1] font-bold">
                    {exam.percentage}% <span className="text-sm font-normal text-[#7B7484]">({exam.grade})</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 bg-white rounded-lg border border-[#EDE7F3] p-3 text-xs">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Score</span>
                    <span className="font-mono font-bold text-[#1C1B1F]">{exam.totalScore}/{exam.totalMax}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Questions</span>
                    <span className="font-mono font-bold text-[#1C1B1F]">{exam.questionCount}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Time Limit</span>
                    <span className="font-mono font-bold text-[#1C1B1F]">{Math.round(exam.durationSeconds / 60)} min</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-xs font-mono text-[#7B7484] bg-white rounded-2xl border border-[#EDE7F3] shadow-2xs">
          Loading study session log...
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EDE7F3] p-12 text-center space-y-3 shadow-2xs">
          <Clock className="w-10 h-10 text-[#7B7484]/40 mx-auto" />
          <h3 className="font-serif text-2xl italic text-[#1C1B1F]">No Study Sessions Logged Yet</h3>
          <p className="text-xs text-[#7B7484] max-w-md mx-auto">
            Start a study block from your Calendar or Schedule to track focus time and record session feedback.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sessions.map((session) => {
            const fb = feedbackBySessionId.get(session.id);
            const isCompleted = session.status === 'completed';

            return (
              <div
                key={session.id}
                className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-4 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EDE7F3] pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block border text-[9px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg ${
                        isCompleted
                          ? 'bg-[#EDE7F6] text-[#461599] border-[#D8CCE8]'
                          : 'bg-[#FAF8FC] text-[#7B7484] border-[#EDE7F3]'
                      }`}
                    >
                      {session.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-[#7B7484] font-mono">
                      Session #{session.id.slice(0, 8)}
                    </span>
                  </div>

                  <div className="text-[10px] text-[#7B7484] font-mono">
                    Started: {new Date(session.startedAt).toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-4 text-xs">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Target Duration</span>
                    <span className="font-mono font-bold text-[#1C1B1F]">{session.durationMinutes} mins</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Actual Duration</span>
                    <span className="font-mono font-bold text-[#5E35B1]">
                      {formatDuration(session.actualDurationSeconds || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Ended At</span>
                    <span className="font-mono font-bold text-[#1C1B1F]">
                      {session.endedAt ? new Date(session.endedAt).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[#7B7484] block mb-0.5">Feedback Status</span>
                    <span className={`font-mono font-bold ${fb ? 'text-[#5E35B1]' : 'text-[#7B7484]'}`}>
                      {fb ? 'Submitted' : 'None'}
                    </span>
                  </div>
                </div>

                {/* Feedback Detail Card if available */}
                {fb && (
                  <div className="p-4 rounded-xl border border-[#D8CCE8] bg-[#FAF8FC] space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#1C1B1F] border-b border-[#EDE7F3] pb-2">
                      <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-[#461599]">
                        <MessageSquare className="w-3.5 h-3.5 text-[#5E35B1]" />
                        Session Reflection Log
                      </span>
                      <span className="text-[10px] font-mono text-[#7B7484]">
                        Focus: {fb.focus || 'N/A'}/5 &bull; Difficulty: {fb.difficulty || 'N/A'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1 font-mono text-[11px]">
                      <div>
                        <span className="text-[#7B7484]">Progress:</span>{' '}
                        <span className="font-bold text-[#1C1B1F]">
                          {fb.perceivedProgress ? `${fb.perceivedProgress * 20}%` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7B7484]">Score:</span>{' '}
                        <span className="font-bold text-[#5E35B1]">{fb.score}/100</span>
                      </div>
                    </div>

                    {fb.notes && (
                      <div className="pt-2 border-t border-[#EDE7F3] italic font-serif text-[#55524E]">
                        "{fb.notes}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
