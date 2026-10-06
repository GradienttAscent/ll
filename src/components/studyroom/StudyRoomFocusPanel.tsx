import React, { useState } from 'react';
import { Coffee, Play, Timer, Users } from 'lucide-react';
import type { FocusSession, StudyRoom } from '../../types';
import { formatCountdown, useFocusCountdown } from './studyRoomFormat';

const inputClass =
  'w-full rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-2.5 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#7A7480] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors';
const primaryButtonClass =
  'bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-4 py-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2';
const secondaryButtonClass =
  'rounded-lg border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] px-4 py-2.5 text-xs font-medium tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2';

const DURATION_PRESETS = [
  { label: '25 min', minutes: 25 },
  { label: '50 min', minutes: 50 },
];

interface Props {
  room: StudyRoom;
  session: FocusSession | null;
  busy: boolean;
  onStart: (input: { durationSeconds: number; phase: FocusSession['phase'] }) => Promise<void>;
  onJoin: () => Promise<void>;
  onLeave: () => Promise<void>;
}

/**
 * The focus tab is the calm centre of the room: one timer, the current phase, how many people are
 * in it, and the smallest set of controls that can move the session forward.
 */
export const StudyRoomFocusPanel: React.FC<Props> = ({ room, session, busy, onStart, onJoin, onLeave }) => {
  const [preset, setPreset] = useState<string>('25');
  const [customMinutes, setCustomMinutes] = useState('40');
  const [phase, setPhase] = useState<FocusSession['phase']>('FOCUS');
  const remainingSeconds = useFocusCountdown(session);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = preset === 'custom' ? Number(customMinutes) : Number(preset);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 120) return;
    await onStart({ durationSeconds: Math.round(minutes * 60), phase });
  };

  if (room.status === 'CLOSED') {
    return (
      <div className="py-16 text-center space-y-2">
        <Coffee className="w-7 h-7 text-[#7B7484]/50 dark:text-[#7A7480]/50 mx-auto" />
        <p className="text-sm font-sans text-[#17151A] dark:text-[#F5F3F7]">This room is closed</p>
        <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">The host has ended the session. Doubts stay available to read.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <form onSubmit={start} className="space-y-5 max-w-md">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">Focus session</p>
          <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">No active focus session</h3>
          <p className="text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">Start one and anyone in the room can join it.</p>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">Phase</span>
          <div className="flex gap-2">
            {(['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPhase(option)}
                className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium tracking-wider uppercase transition-colors border ${
                  phase === option
                    ? 'border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA]'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#7A7480] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
                }`}
              >
                {option === 'FOCUS' ? 'Focus' : option === 'SHORT_BREAK' ? 'Short break' : 'Long break'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">Duration</span>
          <div className="flex gap-2">
            {DURATION_PRESETS.map((option) => (
              <button
                key={option.minutes}
                type="button"
                onClick={() => setPreset(String(option.minutes))}
                className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium tracking-wider transition-colors border ${
                  preset === String(option.minutes)
                    ? 'border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA]'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#7A7480] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPreset('custom')}
              className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium tracking-wider transition-colors border ${
                preset === 'custom'
                  ? 'border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA]'
                  : 'border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#7A7480] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
              }`}
            >
              Custom
            </button>
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={120}
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                aria-label="Custom duration in minutes"
                className={inputClass}
              />
              <span className="text-xs text-[#7B7484] dark:text-[#7A7480] whitespace-nowrap">minutes (5-120)</span>
            </div>
          )}
        </div>

        <button type="submit" disabled={busy} className={primaryButtonClass}>
          <Play className="w-3.5 h-3.5" />{busy ? 'Starting...' : 'Start focus session'}
        </button>
      </form>
    );
  }

  const isBreak = session.phase !== 'FOCUS';
  const finished = remainingSeconds === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">
            {isBreak ? 'Break' : 'Focus session'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${finished ? 'bg-amber-400' : isBreak ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`} />
            <span className="text-[9px] font-mono font-medium text-[#7B7484] dark:text-[#A9A3AE]">
              {finished ? 'TIME UP' : isBreak ? 'ON BREAK' : 'LIVE'}
            </span>
          </span>
        </div>

        <div className="font-mono text-5xl sm:text-6xl font-bold tracking-tight text-[#17151A] dark:text-[#F5F3F7] tabular-nums">
          {formatCountdown(remainingSeconds)}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#7B7484] dark:text-[#7A7480] font-sans">
          <span className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5" />
            {Math.round(session.durationSeconds / 60)} min {isBreak ? 'break' : 'focus'}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {isBreak ? `${session.onBreakCount} on break` : `${session.focusingCount} focusing`}
            {session.currentParticipantCount - (isBreak ? session.onBreakCount : session.focusingCount) > 0 &&
              ` · ${session.currentParticipantCount} in session`}
          </span>
          <span>Started by {session.startedByName}</span>
        </div>

        {finished ? (
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">
            This session has run out. Start the next one when you are ready.
          </p>
        ) : session.isParticipant ? (
          <button type="button" disabled={busy} onClick={() => void onLeave()} className={secondaryButtonClass}>
            Leave session
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void onJoin()} className={primaryButtonClass}>
            <Play className="w-3.5 h-3.5 fill-current" />{busy ? 'Joining...' : 'Join session'}
          </button>
        )}
      </div>

      {session.participants.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">
            {isBreak ? 'On break now' : 'Focusing now'}
          </p>
          <div className="flex flex-wrap gap-2">
            {session.participants.map((participant) => (
              <span
                key={participant.userId}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] px-2.5 py-1 text-[10px] text-[#17151A] dark:text-[#F5F3F7]"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${participant.state === 'FOCUSING' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                {participant.displayName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};