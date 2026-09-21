import React, { useEffect, useMemo, useState } from 'react';
import { ScheduleBlock } from '../types';
import { ChevronLeft, ChevronRight, Clock, Play, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';

interface CalendarViewProps {
  onStartStudy: (block: ScheduleBlock) => Promise<void>;
  refreshKey: number;
}

const MIN_VISIBLE_HOURS = 8;
const MIN_CALENDAR_HOUR = 6;
const MAX_CALENDAR_HOUR = 24;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;
const HOUR_HEIGHT = 46;

const dateKey = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const dayLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const formatStudyTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
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
      const response = await fetch('/api/schedule-blocks');
      if (!response.ok) throw new Error('Unable to load schedule.');
      const data = await response.json();
      setBlocks(data.scheduleBlocks || []);
    } catch (fetchError: any) {
      setError(fetchError.message || 'Failed to load schedule.');
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
  const weekLabel = `${dayLabel(days[0])} – ${dayLabel(days[6])}`;

  const weekBlocks = useMemo(
    () => blocks.filter((block) => dayKeys.includes(block.date)),
    [blocks, dayKeys],
  );

  const blocksByDay = useMemo(() => {
    const grouped: Record<string, ScheduleBlock[]> = {};
    for (const day of dayKeys) grouped[day] = [];
    for (const block of weekBlocks) grouped[block.date].push(block);
    for (const dayBlocks of Object.values(grouped)) {
      dayBlocks.sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime));
    }
    return grouped;
  }, [dayKeys, weekBlocks]);

  const { startHour, endHour } = useMemo(() => {
    if (weekBlocks.length === 0) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }

    const earliest = Math.min(...weekBlocks.map((block) => minutesOfDay(block.startTime)));
    const latest = Math.max(...weekBlocks.map((block) => minutesOfDay(block.startTime) + block.durationMinutes));
    let rangeStart = Math.max(MIN_CALENDAR_HOUR, Math.floor(earliest / 60) - 1);
    let rangeEnd = Math.min(MAX_CALENDAR_HOUR, Math.ceil(latest / 60) + 1);

    if (rangeEnd - rangeStart < MIN_VISIBLE_HOURS) {
      if (rangeStart + MIN_VISIBLE_HOURS <= MAX_CALENDAR_HOUR) {
        rangeEnd = rangeStart + MIN_VISIBLE_HOURS;
      } else {
        rangeStart = Math.max(MIN_CALENDAR_HOUR, rangeEnd - MIN_VISIBLE_HOURS);
      }
    }
    return { startHour: rangeStart, endHour: rangeEnd };
  }, [weekBlocks]);

  const visibleHours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, index) => startHour + index),
    [endHour, startHour],
  );

  const completedBlocks = weekBlocks.filter((block) => block.completed);
  const plannedMinutes = weekBlocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  const completedMinutes = completedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  const remainingMinutes = Math.max(0, plannedMinutes - completedMinutes);
  const completion = plannedMinutes === 0 ? 0 : Math.round((completedMinutes / plannedMinutes) * 100);

  const handleStartStudy = async (block: ScheduleBlock) => {
    setActionError('');
    try {
      await onStartStudy(block);
      setSelectedBlock(null);
    } catch (startError: any) {
      setActionError(startError.message || 'Failed to start study session.');
    }
  };

  const blockStyle = (block: ScheduleBlock) => {
    const top = Math.max(0, ((minutesOfDay(block.startTime) - startHour * 60) / 60) * HOUR_HEIGHT);
    const height = Math.max(30, (block.durationMinutes / 60) * HOUR_HEIGHT);
    return { top, height };
  };

  const blockClass = (block: ScheduleBlock) => {
    if (block.completed) return 'border-black/15 border-l-black/30 bg-black/[0.045] text-black/50 hover:bg-black/[0.08]';
    if (block.date < todayStr) return 'border-red-200 border-l-red-500 bg-red-50 text-red-900 hover:bg-red-100';
    if (block.blockType === 'revision') return 'border-black/45 border-l-black bg-[#F8F7F2] text-black hover:border-black hover:bg-white';
    return 'border-black/30 border-l-black bg-white text-black hover:border-black hover:shadow-sm';
  };

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 sm:px-6 animate-fade-in">
      <div className="border border-black bg-white">
        <header className="bg-[#F8F7F2] border-b border-black px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-black/60">
                <Clock className="w-3.5 h-3.5" />
                <span>Study Calendar</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl italic leading-none mt-2">Weekly Schedule</h1>
              <p className="text-xs text-black/60 mt-2">A focused view of your planned study time and progress.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                onClick={() => setWeekOffset(0)}
                className="border border-black bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
              >
                Today
              </button>
              <div className="flex items-center border border-black bg-white">
                <button onClick={() => setWeekOffset((offset) => offset - 1)} className="p-2 hover:bg-black hover:text-white transition-colors" aria-label="Previous week">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-center min-w-[172px]">{weekLabel}</span>
                <button onClick={() => setWeekOffset((offset) => offset + 1)} className="p-2 border-l border-black hover:bg-black hover:text-white transition-colors" aria-label="Next week">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-black/50">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider">Loading schedule</span>
          </div>
        )}

        {error && (
          <div className="m-5 border border-red-300 bg-red-50 px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-xs text-red-800">{error}</span>
          </div>
        )}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-[0.8fr_0.9fr_1fr_1.55fr] border-b border-black" aria-label="Weekly study summary">
              <div className="px-4 py-3 border-b lg:border-b-0 border-r border-black/15">
                <div className="text-[9px] uppercase tracking-[0.16em] font-bold text-black/50">Sessions</div>
                <div className="font-serif text-2xl italic leading-none mt-1">{weekBlocks.length}</div>
              </div>
              <div className="px-4 py-3 border-b lg:border-b-0 lg:border-r border-black/15">
                <div className="text-[9px] uppercase tracking-[0.16em] font-bold text-black/50">Completed</div>
                <div className="font-serif text-2xl italic leading-none mt-1">{completedBlocks.length}<span className="text-sm text-black/40">/{weekBlocks.length}</span></div>
              </div>
              <div className="px-4 py-3 border-r border-black/15">
                <div className="text-[9px] uppercase tracking-[0.16em] font-bold text-black/50">Remaining</div>
                <div className="font-serif text-2xl italic leading-none mt-1">{formatStudyTime(remainingMinutes)}</div>
              </div>
              <div className="col-span-2 lg:col-span-1 px-4 py-3 flex flex-col justify-center gap-2">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] font-bold text-black/50">
                  <span>Weekly completion</span>
                  <span className="text-black">{completion}%</span>
                </div>
                <div className="h-1.5 bg-black/10 overflow-hidden" aria-label={`${completion}% of planned study time completed`}>
                  <div className="h-full bg-black transition-all" style={{ width: `${completion}%` }} />
                </div>
                <div className="text-[10px] text-black/55">{formatStudyTime(completedMinutes)} of {formatStudyTime(plannedMinutes)} planned</div>
              </div>
            </section>

            {weekBlocks.length === 0 ? (
              <div className="text-center px-6 py-12 sm:py-14">
                <Clock className="w-7 h-7 mx-auto text-black/25" />
                <p className="font-serif text-2xl italic mt-3">Nothing scheduled this week</p>
                <p className="text-xs text-black/55 mt-2 max-w-sm mx-auto">Generate a plan from the Planner page after analyzing your academic material.</p>
              </div>
            ) : (
              <section className="overflow-x-auto" aria-label="Weekly time grid">
                <div className="min-w-[800px]">
                  <div className="grid grid-cols-[52px_repeat(7,minmax(104px,1fr))] border-b border-black">
                    <div className="bg-[#F8F7F2]" />
                    {days.map((day) => {
                      const isToday = dateKey(day) === todayStr;
                      return (
                        <div key={dateKey(day)} className={`relative border-l border-black/20 px-2 py-2.5 text-center ${isToday ? 'bg-black/[0.035]' : 'bg-[#F8F7F2]'}`}>
                          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/55">{day.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                          <div className="font-serif text-xl italic leading-none mt-1">{day.getDate()}</div>
                          {isToday && <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-black" />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-[52px_repeat(7,minmax(104px,1fr))] relative">
                    <div className="bg-[#F8F7F2]">
                      {visibleHours.map((hour, index) => (
                        <div key={hour} className={`border-b border-black/15 pr-2 pt-1 text-right ${index % 2 === 0 ? 'bg-black/[0.015]' : ''}`} style={{ height: HOUR_HEIGHT }}>
                          <span className="font-mono text-[9px] text-black/45">{hourLabel(hour)}</span>
                        </div>
                      ))}
                    </div>

                    {dayKeys.map((dayKey) => {
                      const isToday = dayKey === todayStr;
                      return (
                        <div key={dayKey} className={`relative border-l border-black/20 ${isToday ? 'bg-black/[0.025]' : ''}`}>
                          {visibleHours.map((hour, index) => (
                            <div key={hour} className={`border-b border-black/15 ${index % 2 === 0 ? 'bg-black/[0.015]' : ''}`} style={{ height: HOUR_HEIGHT }} />
                          ))}

                          {(blocksByDay[dayKey] || []).map((block) => {
                            const compact = block.durationMinutes < 45;
                            return (
                              <button
                                key={block.id}
                                onClick={() => { setSelectedBlock(block); setActionError(''); }}
                                className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-md border border-l-[3px] px-2 py-1.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.05)] transition-all focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1 ${blockClass(block)}`}
                                style={blockStyle(block)}
                                aria-label={`${block.title} at ${block.startTime}, ${block.durationMinutes} minutes${block.completed ? ', completed' : ''}`}
                              >
                                <div className={`text-[10px] font-bold leading-tight ${block.completed ? 'line-through' : ''}`}>{block.topicName || block.title}</div>
                                {!compact && (
                                  <div className="mt-0.5 flex items-center gap-1 text-[9px] leading-tight opacity-65">
                                    <span>{block.startTime} · {block.durationMinutes}m</span>
                                    {block.blockType === 'revision' && <span className="font-bold uppercase tracking-wide">Review</span>}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSelectedBlock(null)}>
          <div
            className="bg-white border border-black max-w-md w-full mx-4 p-6 sm:p-8 space-y-6 animate-slide-up"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Study block details"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-1">Study block details</div>
                <h3 className="font-serif text-2xl italic text-black">{selectedBlock.title}</h3>
              </div>
              <button onClick={() => setSelectedBlock(null)} className="p-1 hover:bg-black/5 transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-black/10 pb-2"><span className="text-black/60">Topic</span><span className="font-bold text-right">{selectedBlock.topicName}</span></div>
              <div className="flex justify-between gap-4 border-b border-black/10 pb-2"><span className="text-black/60">Date</span><span className="font-bold text-right">{new Date(`${selectedBlock.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
              <div className="flex justify-between border-b border-black/10 pb-2"><span className="text-black/60">Time</span><span className="font-bold font-mono">{selectedBlock.startTime}</span></div>
              <div className="flex justify-between border-b border-black/10 pb-2"><span className="text-black/60">Planned duration</span><span className="font-bold">{selectedBlock.durationMinutes} minutes</span></div>
              {selectedBlock.blockType === 'revision' && <div className="flex justify-between border-b border-black/10 pb-2"><span className="text-black/60">Purpose</span><span className="font-bold uppercase text-[10px] tracking-wider">Memory refresh</span></div>}
              <div className="flex justify-between"><span className="text-black/60">Status</span><span className={`font-bold uppercase text-[10px] tracking-wider px-2 py-1 ${selectedBlock.completed ? 'bg-black text-white' : selectedBlock.date < todayStr ? 'bg-red-100 text-red-800 border border-red-300' : 'border border-black'}`}>{selectedBlock.completed ? 'Completed' : selectedBlock.date < todayStr ? 'Missed' : 'Planned'}</span></div>
            </div>

            {actionError && <div className="border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800">{actionError}</div>}

            {!selectedBlock.completed ? (
              <button
                onClick={() => void handleStartStudy(selectedBlock)}
                className="w-full bg-black text-white border border-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Start Study Session</span>
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 text-black/40 py-2">
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
