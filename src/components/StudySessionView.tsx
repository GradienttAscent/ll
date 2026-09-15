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
    <div className="max-w-3xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      {/* Session Header */}
      <div className="text-center space-y-3 border-b border-black pb-8">
        <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black">
          <Timer className="w-3.5 h-3.5" />
          <span>Study Session {isPaused ? '· Paused' : '· In Progress'}</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">{session.block.title}</h1>
        <p className="text-sm text-black/60">{session.block.topicName}</p>
      </div>

      {/* Timer Display */}
      <div className="text-center space-y-6">
        {/* Elapsed time (primary) */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">Actual Elapsed Time</div>
          <div className={`font-mono text-7xl sm:text-8xl font-bold tracking-tight ${isOvertime ? 'text-red-700' : 'text-black'} ${isActive ? '' : 'opacity-70'}`}>
            {formatDuration(elapsed)}
          </div>
          {isOvertime && (
            <div className="text-xs text-red-600 font-bold uppercase tracking-wider">
              Over planned duration by {formatDuration(elapsed - plannedMs)}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex justify-between text-[10px] uppercase tracking-[0.15em] font-bold text-black/50">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isOvertime ? 'bg-red-600' : 'bg-black'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Planned vs Actual comparison */}
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <div className="bg-[#F8F7F2] border border-black/20 p-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-1">Planned Duration</div>
            <div className="font-serif text-2xl italic">{formatMinutes(session.block.durationMinutes)}</div>
          </div>
          <div className={`border p-4 text-center ${isOvertime ? 'bg-red-50 border-red-300' : 'bg-[#F8F7F2] border-black/20'}`}>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-1">Actual Study Time</div>
            <div className="font-serif text-2xl italic">{formatDuration(elapsed)}</div>
          </div>
        </div>
      </div>

      {/* Pulsing indicator when active */}
      {isActive && (
        <div className="flex items-center justify-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-black animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-black/40">Session active — timer is running</span>
        </div>
      )}
      {isPaused && (
        <div className="flex items-center justify-center space-x-2">
          <Pause className="w-4 h-4 text-black/40" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-black/40">Session paused</span>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        {isActive && (
          <button
            onClick={onPause}
            className="flex items-center space-x-2 border border-black bg-white text-black px-8 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors"
            aria-label="Pause study session"
          >
            <Pause className="w-4 h-4" />
            <span>Pause</span>
          </button>
        )}

        {isPaused && (
          <button
            onClick={onResume}
            className="flex items-center space-x-2 border border-black bg-black text-white px-8 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors"
            aria-label="Resume study session"
          >
            <Play className="w-4 h-4" />
            <span>Resume</span>
          </button>
        )}

        <button
          onClick={onComplete}
          className="flex items-center space-x-2 border border-black bg-black text-white px-8 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors"
          aria-label="Complete study session"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Complete Session</span>
        </button>

        {!showAbandonConfirm ? (
          <button
            onClick={() => setShowAbandonConfirm(true)}
            className="flex items-center space-x-2 border border-black/30 text-black/50 px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:border-red-600 hover:text-red-600 transition-colors"
            aria-label="Abandon study session"
          >
            <Square className="w-4 h-4" />
            <span>Abandon</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={onAbandon}
              className="flex items-center space-x-2 border border-red-600 bg-red-600 text-white px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-red-700 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Abandon</span>
            </button>
            <button
              onClick={() => setShowAbandonConfirm(false)}
              className="border border-black/30 px-4 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:border-black transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Session info */}
      <div className="bg-[#F8F7F2] border border-black p-6 space-y-3 max-w-md mx-auto">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">Session Details</div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-black/60">Block Date</span>
            <span className="font-mono">{session.block.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/60">Scheduled Start</span>
            <span className="font-mono">{session.block.startTime}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/60">Session ID</span>
            <span className="font-mono text-black/40">{session.sessionId.slice(0, 16)}…</span>
          </div>
        </div>
      </div>
    </div>
  );
};
