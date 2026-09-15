import React, { useState, useEffect } from 'react';
import { StudySession, FeedbackEntry } from '../types';
import { safeNumber } from '../utils/formatters';
import { History, Clock, Star, MessageSquare, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, feedbackRes] = await Promise.all([
        fetch('/api/study-sessions'),
        fetch('/api/feedback')
      ]);

      if (!sessionsRes.ok) throw new Error('Failed to fetch study sessions');
      if (!feedbackRes.ok) throw new Error('Failed to fetch feedback history');

      const sessionsData = await sessionsRes.json();
      const feedbackData = await feedbackRes.json();

      setSessions(sessionsData.studySessions || []);
      setFeedbackList(feedbackData.feedback || []);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold bg-[#F8F7F2] mb-2">
            Sanctuary Logs &bull; Study History
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            Executed Sessions &amp; Feedback
          </h1>
          <p className="text-xs text-black/60 font-sans mt-1">
            Complete record of your executed study blocks and post-session self-evaluations.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="p-2 border border-black bg-white hover:bg-black hover:text-white transition-colors"
          title="Refresh History"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-xs font-mono text-black/50 bg-[#F8F7F2] border border-black">
          Loading study session log...
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-[#FDFDFC] border border-black p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-black/20 mx-auto" />
          <h3 className="font-serif text-2xl italic text-black">No Study Sessions Logged Yet</h3>
          <p className="text-xs text-black/60 max-w-md mx-auto">
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
                className="bg-[#FDFDFC] border border-black p-6 space-y-4 shadow-none"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block border text-[9px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 ${
                        isCompleted
                          ? 'bg-black text-white border-black'
                          : 'bg-[#F8F7F2] text-black border-black'
                      }`}
                    >
                      {session.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-black/40 font-mono">
                      Session #{session.id.slice(0, 8)}
                    </span>
                  </div>

                  <div className="text-[10px] text-black/60 font-mono">
                    Started: {new Date(session.startedAt).toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#F8F7F2] border border-black/20 p-4 text-xs">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-black/40 block mb-0.5">Target Duration</span>
                    <span className="font-mono font-bold text-black">{session.durationMinutes} mins</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-black/40 block mb-0.5">Actual Duration</span>
                    <span className="font-mono font-bold text-violet-800">
                      {formatDuration(session.actualDurationSeconds || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-black/40 block mb-0.5">Ended At</span>
                    <span className="font-mono font-bold text-black">
                      {session.endedAt ? new Date(session.endedAt).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-bold text-black/40 block mb-0.5">Feedback Status</span>
                    <span className={`font-mono font-bold ${fb ? 'text-black' : 'text-black/40'}`}>
                      {fb ? 'Submitted' : 'None'}
                    </span>
                  </div>
                </div>

                {/* Feedback Detail Card if available */}
                {fb && (
                  <div className="p-4 border border-black bg-white space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-black border-b border-black/10 pb-2">
                      <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                        <MessageSquare className="w-3.5 h-3.5 text-black" />
                        Session Reflection Log
                      </span>
                      <span className="text-[10px] font-mono text-black/60">
                        Focus: {fb.focus || 'N/A'}/5 &bull; Difficulty: {fb.difficulty || 'N/A'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1 font-mono text-[11px]">
                      <div>
                        <span className="text-black/50">Progress:</span>{' '}
                        <span className="font-bold text-black">
                          {fb.perceivedProgress ? `${fb.perceivedProgress * 20}%` : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-black/50">Score:</span>{' '}
                        <span className="font-bold text-black">{fb.score}/100</span>
                      </div>
                    </div>

                    {fb.notes && (
                      <div className="pt-2 border-t border-black/10 italic font-serif text-black/80">
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
