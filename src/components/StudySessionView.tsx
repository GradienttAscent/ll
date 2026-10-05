import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ActiveSessionState, ScheduleBlock } from '../types';
import { Play, Pause, Square, CheckCircle2, Clock, AlertTriangle, Timer } from 'lucide-react';

interface StudySessionViewProps {
  session: ActiveSessionState;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onAbandon: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

export const StudySessionView: React.FC<StudySessionViewProps> = ({
  session,
  onPause,
  onResume,
  onComplete,
  onAbandon,
}) => {
  const [elapsed, setElapsed] = useState(0); // current displayed elapsed ms
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const frameRef = useRef<number>(0);

  // Compute elapsed time based on accumulated + live delta
  const computeElapsed = useCallback(() => {
    if (session.phase === 'active') {
      return session.accumulatedMs + (Date.now() - session.startedAt);
    }
    return session.accumulatedMs;
  }, [session.phase, session.accumulatedMs, session.startedAt]);

  useEffect(() => {
    if (session.phase === 'active') {
      const tick = () => {
        setElapsed(computeElapsed());
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frameRef.current);
    } else {
      setElapsed(computeElapsed());
    }
  }, [session.phase, computeElapsed]);

  const plannedMs = session.block.durationMinutes * 60 * 1000;
  const progress = Math.min(100, (elapsed / plannedMs) * 100);
  const isOvertime = elapsed > plannedMs;
  const isActive = session.phase === 'active';
  const isPaused = session.phase === 'paused';

  return (
    <div className="max-w-3xl mx-auto py-12 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      {/* Session Header */}
      <div className="text-center space-y-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-lg bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E344A] text-[10px] uppercase tracking-[0.2em] font-medium text-[#6D28D9] dark:text-[#A78BFA]">
          <Timer className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
          <span>Study Session {isPaused ? '· Paused' : '· In Progress'}</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">{session.block.title}</h1>
        <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">{session.block.topicName}</p>
      </div>

      {/* Timer Display */}
      <div className="text-center space-y-6">
        {/* Elapsed time (primary) */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#7A7480]">Actual Elapsed Time</div>
          <div className={`font-mono text-7xl sm:text-8xl font-bold tracking-tight ${isOvertime ? 'text-amber-600 dark:text-amber-400' : 'text-[#17151A] dark:text-[#F5F3F7]'} ${isActive ? '' : 'opacity-70'}`}>
            {formatDuration(elapsed)}
          </div>
          {isOvertime && (
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wider font-mono">
              Over planned duration by {formatDuration(elapsed - plannedMs)}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex justify-between text-[10px] uppercase tracking-[0.15em] font-bold text-[#7B7484] dark:text-[#7A7480]">
            <span>Progress</span>
            <span className="text-[#6D28D9] dark:text-[#A78BFA] font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-[#EDE7F6] dark:bg-[#251E30] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isOvertime ? 'bg-amber-600 dark:bg-amber-500' : 'bg-[#6D28D9] dark:bg-[#8B5CF6]'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Planned vs Actual comparison */}
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-5 text-center shadow-2xs">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#7A7480] mb-1">Planned Duration</div>
            <div className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">{formatMinutes(session.block.durationMinutes)}</div>
          </div>
          <div className={`rounded-2xl border p-5 text-center shadow-2xs ${isOvertime ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' : 'bg-white dark:bg-[#17151A] border-[#EDE7F3] dark:border-[#302B35]'}`}>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#7A7480] mb-1">Actual Study Time</div>
            <div className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">{formatDuration(elapsed)}</div>
          </div>
        </div>
      </div>

      {/* Pulsing indicator when active */}
      {isActive && (
        <div className="flex items-center justify-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6D28D9] dark:bg-[#8B5CF6] animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider font-medium text-[#6D28D9] dark:text-[#A78BFA]">Session active — timer is running</span>
        </div>
      )}
      {isPaused && (
        <div className="flex items-center justify-center space-x-2">
          <Pause className="w-4 h-4 text-[#7B7484] dark:text-[#7A7480]" />
          <span className="text-[10px] uppercase tracking-wider font-medium text-[#7B7484] dark:text-[#7A7480]">Session paused</span>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        {isActive && (
          <button
            onClick={onPause}
            className="flex items-center space-x-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] text-[#17151A] dark:text-[#F5F3F7] px-6 py-2.5 text-xs font-medium tracking-wider hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] transition-colors shadow-2xs"
            aria-label="Pause study session"
          >
            <Pause className="w-4 h-4 text-[#7B7484] dark:text-[#7A7480]" />
            <span>Pause</span>
          </button>
        )}

        {isPaused && (
          <button
            onClick={onResume}
            className="flex items-center space-x-2 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-6 py-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs"
            aria-label="Resume study session"
          >
            <Play className="w-4 h-4 text-white" />
            <span>Resume</span>
          </button>
        )}

        <button
          onClick={onComplete}
          className="flex items-center space-x-2 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-6 py-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs"
          aria-label="Complete study session"
        >
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>Complete Session</span>
        </button>

        {!showAbandonConfirm ? (
          <button
            onClick={() => setShowAbandonConfirm(true)}
            className="flex items-center space-x-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] text-[#7B7484] dark:text-[#7A7480] px-5 py-2.5 text-xs font-medium tracking-wider hover:border-red-200 hover:text-red-600 dark:hover:border-red-900/50 dark:hover:text-red-400 transition-colors"
            aria-label="Abandon study session"
          >
            <Square className="w-4 h-4" />
            <span>Abandon</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={onAbandon}
              className="flex items-center space-x-2 rounded-lg border border-red-600 bg-red-600 text-white px-5 py-2.5 text-xs font-medium tracking-wider hover:bg-red-700 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Abandon</span>
            </button>
            <button
              onClick={() => setShowAbandonConfirm(false)}
              className="rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] px-4 py-2.5 text-xs font-medium text-[#55524E] dark:text-[#A9A3AE] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Session info */}
      <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-3 max-w-md mx-auto shadow-2xs">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#7A7480]">Session Details</div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#7B7484] dark:text-[#7A7480]">Block Date</span>
            <span className="font-mono text-[#17151A] dark:text-[#F5F3F7]">{session.block.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7B7484] dark:text-[#7A7480]">Scheduled Start</span>
            <span className="font-mono text-[#17151A] dark:text-[#F5F3F7]">{session.block.startTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7B7484] dark:text-[#7A7480]">Session ID</span>
            <span className="font-mono text-[#7B7484] dark:text-[#7A7480]">{session.sessionId.slice(0, 16)}…</span>
          </div>
        </div>
      </div>
    </div>
  );
};
