import React, { useState } from 'react';
import { StudySessionItem } from '../types';
import { Calendar, Sparkles, CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface PlannerViewProps {
  schedule: StudySessionItem[];
  onToggleComplete: (id: string) => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({ schedule, onToggleComplete }) => {
  const [examName, setExamName] = useState('Algorithms (CS301) Finals');
  const [examDate, setExamDate] = useState('2026-08-24');
  const [dailyHours, setDailyHours] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localSchedule, setLocalSchedule] = useState<StudySessionItem[]>(schedule);

  const handleRecalculatePlan = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/gemini/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName,
          examDate,
          dailyStudyHours: dailyHours,
          topics: ['Graph Algorithms', 'Dynamic Programming', 'Big O Analysis', 'Heap Sort', 'AVL Trees'],
        }),
      });

      const json = await res.json();
      if (json.success && json.data && json.data.dailySchedule) {
        const newItems: StudySessionItem[] = json.data.dailySchedule.map((ds: any, idx: number) => ({
          id: `plan-${Date.now()}-${idx}`,
          day: ds.day || idx + 1,
          dateStr: ds.date || `Day ${idx + 1}`,
          topic: ds.topic || 'Revision',
          hours: ds.hours || dailyHours,
          focusDetail: ds.focus || 'Practice problem set',
          completed: false,
          isPriority: idx === 0 || idx === 4,
        }));
        setLocalSchedule(newItems);
      }
    } catch (err) {
      console.error('Failed to generate AI study plan:', err);
      alert('Error generating study schedule.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>Time-Aware Smart Calendar</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            Day-Wise Personal Study Planner
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
            Gemini balances topic weightage, remaining study days, and daily available hours to prevent last-minute cramming.
          </p>
        </div>

        {/* AI Recalculate Button */}
        <button
          onClick={handleRecalculatePlan}
          disabled={isGenerating}
          className="border border-black bg-black text-white hover:bg-white hover:text-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors self-start md:self-auto disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
              <span>Optimizing Schedule...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 inline mr-2" />
              <span>AI Re-Calculate Plan</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Calendar Settings & Target Exam Info (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-5">
            <h3 className="font-serif text-2xl italic font-normal text-black">
              Target Exam Parameters
            </h3>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Course / Examination</label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                className="w-full bg-white border border-black/30 px-3 py-2 text-xs text-black focus:outline-none focus:border-black font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Final Exam Date</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full bg-white border border-black/30 px-3 py-2 text-xs text-black focus:outline-none focus:border-black font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Daily Available Hours</label>
                <span className="font-bold text-black font-mono">{dailyHours} hours/day</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value))}
                className="w-full accent-black"
              />
            </div>

            {/* Countdown Badge Widget */}
            <div className="bg-black text-white border border-black p-5 text-center space-y-1">
              <div className="text-[9px] uppercase font-bold tracking-[0.2em] opacity-70">Remaining Prep Time</div>
              <div className="font-serif text-4xl italic font-normal">21 Days</div>
              <div className="text-[10px] font-mono opacity-80 pt-1">Target completion: Aug 24, 2026</div>
            </div>
          </div>

          {/* August Calendar Mini Grid */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-black uppercase tracking-wider">
              <span>August 2026</span>
              <span className="text-[9px] opacity-60">Finals Month</span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono">
              <div className="text-black/40 py-1">S</div>
              <div className="text-black/40 py-1">M</div>
              <div className="text-black/40 py-1">T</div>
              <div className="text-black/40 py-1">W</div>
              <div className="text-black/40 py-1">T</div>
              <div className="text-black/40 py-1">F</div>
              <div className="text-black/40 py-1">S</div>

              {/* Sample calendar days */}
              {Array.from({ length: 31 }, (_, i) => {
                const dayNum = i + 1;
                const isToday = dayNum === 3;
                const isExamDay = dayNum === 24;
                return (
                  <div
                    key={dayNum}
                    className={`py-1 text-xs border ${
                      isToday
                        ? 'bg-black text-white border-black font-bold'
                        : isExamDay
                        ? 'bg-black text-white border-black font-bold underline'
                        : dayNum <= 6
                        ? 'bg-black/10 text-black border-black/20 font-bold'
                        : 'bg-white text-black/60 border-black/10'
                    }`}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Day-Wise Study Schedule List (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-black pb-4">
              <h3 className="font-serif text-3xl italic font-normal text-black">
                Day-by-Day Study Routine
              </h3>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black/60">
                {localSchedule.filter((s) => s.completed).length}/{localSchedule.length} Completed
              </span>
            </div>

            <div className="space-y-4">
              {localSchedule.map((item) => (
                <div
                  key={item.id}
                  className={`p-5 border transition-all flex items-start space-x-4 ${
                    item.completed
                      ? 'bg-white/50 border-black/20 opacity-60'
                      : item.isPriority
                      ? 'bg-white border-black'
                      : 'bg-white border-black/40'
                  }`}
                >
                  {/* Completion Checkbox */}
                  <button
                    onClick={() => {
                      setLocalSchedule((prev) =>
                        prev.map((s) => (s.id === item.id ? { ...s, completed: !s.completed } : s))
                      );
                      onToggleComplete(item.id);
                    }}
                    className="mt-0.5 text-black hover:scale-105 transition-transform"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-black" />
                    ) : (
                      <Circle className="w-5 h-5 text-black/40" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-black">{item.dateStr}</span>
                        {item.isPriority && (
                          <span className="text-[8px] bg-black text-white px-2 py-0.5 font-bold uppercase tracking-widest">
                            High Yield
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-black/60 font-mono">{item.hours} Hours</span>
                    </div>

                    <h4 className={`font-serif text-xl italic ${item.completed ? 'line-through text-black/40' : 'text-black'}`}>
                      {item.topic}
                    </h4>

                    <p className="text-xs text-black/70 leading-relaxed font-sans">
                      {item.focusDetail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

