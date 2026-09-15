import React, { useEffect, useState, useMemo } from 'react';
import { ScheduleBlock } from '../types';
import { ChevronLeft, ChevronRight, Clock, Play, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';

interface CalendarViewProps {
  onStartStudy: (block: ScheduleBlock) => Promise<void>;
  refreshKey: number;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00–22:00

const dateKey = (d: Date): string => {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

const dayLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onStartStudy, refreshKey }) => {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null);
  const [actionError, setActionError] = useState('');

  const fetchBlocks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/schedule-blocks');
      if (!res.ok) throw new Error('Unable to load schedule.');
      const data = await res.json();
      setBlocks(data.scheduleBlocks || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchBlocks(); }, [refreshKey]);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => dateKey(today), [today]);

  const weekStart = useMemo(() => {
    const base = startOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [today, weekOffset]);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const dayKeys = useMemo(() => days.map(dateKey), [days]);

  const blocksByDay = useMemo(() => {
    const map: Record<string, ScheduleBlock[]> = {};
    for (const dk of dayKeys) map[dk] = [];
    for (const b of blocks) {
      if (map[b.date]) map[b.date].push(b);
    }
    return map;
  }, [blocks, dayKeys]);

  const weekLabel = `${dayLabel(days[0])} – ${dayLabel(days[6])}`;

  const handleStartStudy = async (block: ScheduleBlock) => {
    setActionError('');
    try {
      await onStartStudy(block);
      setSelectedBlock(null);
    } catch (e: any) {
      setActionError(e.message || 'Failed to start study session.');
    }
  };

  // Calculate position and height for a block on the grid
  const blockStyle = (block: ScheduleBlock) => {
    const startMin = minutesOfDay(block.startTime);
    const top = ((startMin - 8 * 60) / 60) * 64; // 64px per hour
    const height = Math.max(16, (block.durationMinutes / 60) * 64);
    return { top: `${top}px`, height: `${height}px` };
  };

  const blockColor = (block: ScheduleBlock) => {
    if (block.completed) return 'bg-black/10 border-black/20 text-black/60';
    if (block.date < todayStr) return 'bg-red-50 border-red-300 text-red-800'; // missed
    return 'bg-[#F8F7F2] border-black text-black hover:bg-black hover:text-white';
  };

  return (
    <div className="max-w-[1400px] mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Study Calendar</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">Weekly Schedule</h1>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setWeekOffset(0)}
            className="border border-black px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
            aria-label="Jump to current week"
          >
            Today
          </button>
          <button onClick={() => setWeekOffset((w) => w - 1)} className="p-2 border border-black hover:bg-black hover:text-white transition-colors" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wider min-w-[200px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="p-2 border border-black hover:bg-black hover:text-white transition-colors" aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="flex items-center justify-center py-20 space-x-3 text-black/50">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-wider">Loading schedule…</span>
        </div>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 px-5 py-4 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          {/* Day header row */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-black">
            <div className="p-2" />
            {days.map((d, i) => (
              <div
                key={i}
                className={`p-3 text-center border-l border-black/10 ${dateKey(d) === todayStr ? 'bg-black text-white' : ''}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div className="text-lg font-serif italic">{d.getDate()}</div>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
            {/* Hour labels */}
            <div>
              {HOURS.map((h) => (
                <div key={h} className="h-16 border-b border-black/5 pr-2 text-right">
                  <span className="text-[10px] font-mono text-black/40 relative -top-2">
                    {String(h).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {dayKeys.map((dk, colIdx) => (
              <div key={dk} className="relative border-l border-black/10">
                {/* Grid lines */}
                {HOURS.map((h) => (
                  <div key={h} className="h-16 border-b border-black/5" />
                ))}

                {/* Blocks positioned absolutely */}
                {(blocksByDay[dk] || []).map((block) => {
                  const style = blockStyle(block);
                  return (
                    <button
                      key={block.id}
                      onClick={() => { setSelectedBlock(block); setActionError(''); }}
                      className={`absolute left-1 right-1 rounded-sm border px-1.5 py-1 text-left overflow-hidden cursor-pointer transition-colors ${blockColor(block)}`}
                      style={style}
                      aria-label={`${block.title} at ${block.startTime}, ${block.durationMinutes} minutes${block.completed ? ', completed' : ''}`}
                    >
                      <div className="text-[10px] font-bold truncate leading-tight">{block.title}</div>
                      {block.durationMinutes >= 30 && (
                        <div className="text-[9px] opacity-70 truncate">{block.startTime} · {block.durationMinutes}m</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Empty state */}
          {blocks.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <Clock className="w-10 h-10 mx-auto text-black/20" />
              <p className="text-sm text-black/50">No study blocks scheduled yet.</p>
              <p className="text-xs text-black/40">Generate a schedule from the Planner page after analyzing your academic material.</p>
            </div>
          )}
        </div>
      )}

      {/* Block Detail Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSelectedBlock(null)}>
          <div
            className="bg-white border border-black max-w-md w-full mx-4 p-8 space-y-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Study block details"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-1">Study Block Details</div>
                <h3 className="font-serif text-2xl italic text-black">{selectedBlock.title}</h3>
              </div>
              <button onClick={() => setSelectedBlock(null)} className="p-1 hover:bg-black/5 transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-black/10 pb-2">
                <span className="text-black/60">Topic</span>
                <span className="font-bold">{selectedBlock.topicName}</span>
              </div>
              <div className="flex justify-between border-b border-black/10 pb-2">
                <span className="text-black/60">Date</span>
                <span className="font-bold">{new Date(`${selectedBlock.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between border-b border-black/10 pb-2">
                <span className="text-black/60">Time</span>
                <span className="font-bold font-mono">{selectedBlock.startTime}</span>
              </div>
              <div className="flex justify-between border-b border-black/10 pb-2">
                <span className="text-black/60">Planned Duration</span>
                <span className="font-bold">{selectedBlock.durationMinutes} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/60">Status</span>
                <span className={`font-bold uppercase text-[10px] tracking-wider px-2 py-1 ${selectedBlock.completed ? 'bg-black text-white' : selectedBlock.date < todayStr ? 'bg-red-100 text-red-800 border border-red-300' : 'border border-black'}`}>
                  {selectedBlock.completed ? 'Completed' : selectedBlock.date < todayStr ? 'Missed' : 'Planned'}
                </span>
              </div>
            </div>

            {actionError && (
              <div className="border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800">{actionError}</div>
            )}

            {!selectedBlock.completed && (
              <button
                onClick={() => void handleStartStudy(selectedBlock)}
                className="w-full bg-black text-white border border-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors flex items-center justify-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Start Study Session</span>
              </button>
            )}

            {selectedBlock.completed && (
              <div className="flex items-center justify-center space-x-2 text-black/40 py-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">This block has been completed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
