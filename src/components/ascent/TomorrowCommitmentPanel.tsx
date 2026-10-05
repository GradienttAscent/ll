import React, { useState } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';
import { TomorrowCommitmentSummary } from '../../types';

interface TomorrowCommitmentPanelProps {
  tomorrowCommitment?: TomorrowCommitmentSummary | null;
  onCommitTomorrow: (input: { title: string; startTime: string; durationMinutes: number }) => Promise<void>;
}

function formatTimeRange(startTime: string, durationMinutes: number): string {
  const [h, m] = (startTime || '19:00').split(':').map(Number);
  const startTotal = (h || 0) * 60 + (m || 0);
  const endTotal = startTotal + durationMinutes;

  const fmt = (totalMin: number) => {
    const hours24 = Math.floor(totalMin / 60) % 24;
    const mins = totalMin % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const displayH = hours24 % 12 || 12;
    return `${displayH}:${String(mins).padStart(2, '0')} ${period}`;
  };

  return `${fmt(startTotal)} – ${fmt(endTotal)}`;
}

export const TomorrowCommitmentPanel: React.FC<TomorrowCommitmentPanelProps> = ({
  tomorrowCommitment,
  onCommitTomorrow,
}) => {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFormOverride, setShowFormOverride] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCommitTomorrow({
        title: cleanTitle,
        startTime,
        durationMinutes,
      });
      setTitle('');
      setShowFormOverride(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickPreset = (presetTitle: string, presetTime: string, presetDuration: number) => {
    setTitle(presetTitle);
    setStartTime(presetTime);
    setDurationMinutes(presetDuration);
  };

  return (
    <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-2.5">
          <div>
            <h2 className="font-serif text-2xl italic font-normal text-[#1C1B1F] dark:text-[#F5F3F7]">
              Tomorrow&apos;s Commitment
            </h2>
          </div>
        </div>

        {/* Case A: User already has a commitment locked for tomorrow */}
        {tomorrowCommitment && !showFormOverride ? (
          <div className="p-3.5 rounded-xl border border-[#D8CCE8] dark:border-[#3A3342] bg-gradient-to-br from-[#FAF8FC] dark:from-[#1D1A21] to-[#F5EFFC] dark:to-[#241D2E] space-y-2.5 shadow-2xs animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-[#EDE7F6] dark:bg-[#2A2238] text-[#461599] dark:text-[#A78BFA]">
                <MapPin className="w-3 h-3 text-[#5E35B1] dark:text-[#8B5CF6]" /> Destination Locked
              </span>
              <span className="text-[11px] font-mono text-[#5E35B1] dark:text-[#8B5CF6] font-semibold">
                {formatTimeRange(tomorrowCommitment.startTime, tomorrowCommitment.durationMinutes)}
              </span>
            </div>

            <div className="font-medium text-xs text-[#1C1B1F] dark:text-[#F5F3F7]">
              {tomorrowCommitment.title}
            </div>

            <div className="pt-2 border-t border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-between text-[10.5px] text-[#7B7484] dark:text-[#A9A3AE]">
              <span>Waypoint set on ridge</span>
              <button
                onClick={() => setShowFormOverride(true)}
                className="text-[#5E35B1] dark:text-[#8B5CF6] hover:underline font-semibold"
              >
                + Change
              </button>
            </div>
          </div>
        ) : (
          /* Case B: Commitment Form */
          <form onSubmit={handleSubmit} className="space-y-3 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#A9A3AE] block">
                Target Commitment
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Complete 2 LeetCode problems"
                className="w-full text-xs px-3 py-2 rounded-xl border border-[#D8CCE8] dark:border-[#3A3342] bg-white dark:bg-[#1D1A21] text-[#1C1B1F] dark:text-[#F5F3F7] placeholder:text-[#9E94AB] focus:outline-none focus:border-[#5E35B1] dark:focus:border-[#8B5CF6] shadow-2xs"
              />
            </div>

            {/* Time and Duration selection */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[9px] font-medium text-[#7B7484] dark:text-[#A9A3AE] block mb-0.5">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full text-xs py-1.5 px-2 rounded-lg border border-[#D8CCE8] dark:border-[#3A3342] bg-white dark:bg-[#1D1A21] text-[#1C1B1F] dark:text-[#F5F3F7]"
                />
              </div>

              <div>
                <label className="text-[9px] font-medium text-[#7B7484] dark:text-[#A9A3AE] block mb-0.5">
                  Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full text-xs py-1.5 px-2 rounded-lg border border-[#D8CCE8] dark:border-[#3A3342] bg-white dark:bg-[#1D1A21] text-[#1C1B1F] dark:text-[#F5F3F7]"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>120 min</option>
                </select>
              </div>
            </div>

            {/* Quick curated presets */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => handlePickPreset('Complete 2 LeetCode problems', '19:00', 60)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] hover:border-[#D8CCE8] dark:hover:border-[#4A4254] text-[#55524E] dark:text-[#A9A3AE] hover:text-[#1C1B1F] dark:hover:text-[#F5F3F7] transition"
              >
                LeetCode problems (1 hr)
              </button>
              <button
                type="button"
                onClick={() => handlePickPreset('Revise dynamic programming', '20:00', 45)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] hover:border-[#D8CCE8] dark:hover:border-[#4A4254] text-[#55524E] dark:text-[#A9A3AE] hover:text-[#1C1B1F] dark:hover:text-[#F5F3F7] transition"
              >
                Dynamic programming (45m)
              </button>
            </div>

            {/* Action Button: Commit */}
            <div className="pt-1 flex items-center justify-between gap-2.5">
              {showFormOverride && (
                <button
                  type="button"
                  onClick={() => setShowFormOverride(false)}
                  className="text-xs text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#1C1B1F] dark:hover:text-[#F5F3F7]"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                className="flex-1 bg-[#1C1B1F] dark:bg-[#8B5CF6] hover:bg-[#343238] dark:hover:bg-[#7C3AED] text-white py-2 px-3.5 rounded-xl text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-2xs disabled:opacity-40"
              >
                <span>{isSubmitting ? 'Locking in...' : 'Commit'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
