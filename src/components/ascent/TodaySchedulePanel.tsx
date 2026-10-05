import React, { useState } from 'react';
import { Check, Clock, Play, Plus, X } from 'lucide-react';
import { ScheduleBlock } from '../../types';

interface TodaySchedulePanelProps {
  todayBlocks: ScheduleBlock[];
  onStartStudy?: (block: ScheduleBlock) => void;
  onCompleteBlock: (block: ScheduleBlock, sourceRect: DOMRect) => void;
  onMissBlock: (block: ScheduleBlock) => void;
  onAddTodayBlock: (title: string, durationMinutes: number) => Promise<void>;
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m || 0).padStart(2, '0')} ${period}`;
}

export const TodaySchedulePanel: React.FC<TodaySchedulePanelProps> = ({
  todayBlocks,
  onStartStudy,
  onCompleteBlock,
  onMissBlock,
  onAddTodayBlock,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDuration, setNewDuration] = useState(45);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completedCount = todayBlocks.filter((b) => b.completed).length;
  const missedCount = todayBlocks.filter((b) => b.missed).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onAddTodayBlock(newTitle.trim(), newDuration);
      setNewTitle('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPreset = async (title: string, duration: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onAddTodayBlock(title, duration);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            Today&apos;s Scheduled Study
          </h2>
          <p className="text-[11px] text-[#55524E] dark:text-[#A9A3AE] font-sans mt-0.5">
            Actual calendar study blocks. Completing them advances your ascent; missing drops elevation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[#55524E] dark:text-[#A9A3AE]">
            {completedCount}/{todayBlocks.length} completed
          </span>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="p-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] text-[#6D28D9] dark:text-[#8B5CF6] transition-colors"
            title="Schedule study block for today"
            aria-label="Schedule study block for today"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Add Study Block Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-3.5 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] space-y-2.5 animate-fade-in">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
            Schedule Study Block for Today
          </div>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Operating Systems: Deadlock Detection, Algorithms: DP..."
            className="w-full text-xs px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] placeholder:text-[#9E94AB] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]"
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-[#55524E] dark:text-[#A9A3AE]">
              <Clock className="w-3.5 h-3.5 text-[#7B7484] dark:text-[#A9A3AE]" />
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="text-xs py-1 px-2 rounded border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7]"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2.5 py-1 text-xs text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTitle.trim() || isSubmitting}
                className="px-3 py-1 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white text-xs font-semibold disabled:opacity-50 transition"
              >
                {isSubmitting ? 'Saving...' : 'Add to Calendar'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* List of Today's Scheduled Blocks */}
      <div className="space-y-2">
        {todayBlocks.length === 0 ? (
          <div className="py-6 text-center space-y-3 rounded-xl border border-dashed border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21]">
            <p className="text-xs text-[#55524E] dark:text-[#A9A3AE]">
              No study sessions scheduled for today yet.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                onClick={() => void handleAddPreset('Focus Study Session', 45)}
                className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] px-2.5 py-1 rounded-md bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] transition"
              >
                + Focus (45m)
              </button>
              <button
                onClick={() => void handleAddPreset('Past Paper Practice', 60)}
                className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] px-2.5 py-1 rounded-md bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] transition"
              >
                + Past Paper (60m)
              </button>
              <button
                onClick={() => void handleAddPreset('Lecture Revision', 30)}
                className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] px-2.5 py-1 rounded-md bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] transition"
              >
                + Revision (30m)
              </button>
            </div>
          </div>
        ) : (
          todayBlocks.map((block) => {
            const isCompleted = block.completed;
            const isMissed = Boolean(block.missed);

            return (
              <div
                key={block.id}
                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  isCompleted
                    ? 'border-[#D8CCE8] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21]/60 opacity-80'
                    : isMissed
                    ? 'border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/20'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] hover:border-[#D8CCE8] dark:hover:border-[#4B4454]'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] font-mono font-medium text-[#7B7484] dark:text-[#A9A3AE]">
                      {formatTime(block.startTime)} · {block.durationMinutes}m
                    </span>
                    {block.topicName && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[#55524E] dark:text-[#A9A3AE]">
                        {block.topicName}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs font-medium truncate ${
                    isCompleted ? 'line-through text-[#7B7484] dark:text-[#807A87]' : isMissed ? 'text-red-700 dark:text-red-400' : 'text-[#17151A] dark:text-[#F5F3F7]'
                  }`}>
                    {block.title}
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6D28D9] dark:text-[#8B5CF6] px-2 py-0.5 rounded-full bg-[#EDE7F6] dark:bg-[#251E30]">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      Done
                    </span>
                  ) : isMissed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full bg-red-100/50 dark:bg-red-950/40">
                      <X className="w-3 h-3 stroke-[2.5]" />
                      Missed
                    </span>
                  ) : (
                    <>
                      {onStartStudy && (
                        <button
                          onClick={() => onStartStudy(block)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white text-[10px] font-semibold uppercase tracking-wider transition"
                          title="Start live focus study session"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          Start
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          onCompleteBlock(block, rect);
                        }}
                        className="p-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] text-[#6D28D9] dark:text-[#8B5CF6] transition"
                        title="Mark session completed (moves Ascent upward)"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                      </button>
                      <button
                        onClick={() => onMissBlock(block)}
                        className="p-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:bg-red-50 dark:hover:bg-red-950/30 text-[#7B7484] hover:text-red-600 dark:hover:text-red-400 transition"
                        title="Mark session missed"
                      >
                        <X className="w-3.5 h-3.5 stroke-[2.2]" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
