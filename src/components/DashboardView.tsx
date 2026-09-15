import React, { useState, useEffect } from 'react';
import { ActiveTab, AnalyticsSnapshot, ScheduleBlock } from '../types';
import { safeNumber, formatHours, formatPercent, formatDateStr } from '../utils/formatters';
import { 
  Calendar, 
  ArrowRight, 
  Brain, 
  Clock, 
  CheckCircle2, 
  BookOpen, 
  RefreshCw, 
  AlertTriangle,
  Play,
  TrendingUp,
  History,
  MoreHorizontal
} from 'lucide-react';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  onStartStudy?: (block: ScheduleBlock) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  setActiveTab, 
  onStartStudy 
}) => {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [nextBlock, setNextBlock] = useState<ScheduleBlock | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, blocksRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/schedule-blocks')
      ]);

      if (!analyticsRes.ok) throw new Error('Failed to fetch analytics data');

      const analyticsData = await analyticsRes.json();
      const snapshot: AnalyticsSnapshot = analyticsData.analytics || analyticsData;
      setAnalytics(snapshot);

      if (blocksRes.ok) {
        const blocksData = await blocksRes.json();
        const blocks: ScheduleBlock[] = blocksData.scheduleBlocks || [];
        const pending = blocks.filter((b) => !b.completed);
        setNextBlock(pending.length > 0 ? pending[0] : null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const plannedMins = safeNumber(analytics?.plannedMinutes, 0);
  const completedMins = safeNumber(analytics?.completedMinutes, 0);
  const completionRate = safeNumber(analytics?.completionRate, 0);
  const upcomingWorkloadMins = safeNumber(analytics?.upcomingWorkloadMinutes, 0);
  const completedCount = safeNumber(analytics?.completedCount, 0);
  const missedCount = safeNumber(analytics?.missedCount, 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-8 space-y-12 animate-fade-in pb-16">
      
      {/* Editorial Sanctuary Header */}
      <div className="text-center space-y-3 pb-8 border-b border-black">
        <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold">
          Academic Sanctuary &bull; Journal &amp; Progress
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl font-normal italic text-black tracking-tight leading-none pt-2">
          Study Progress &amp; Analytics
        </h1>

        <p className="font-serif italic text-black/70 text-base max-w-lg mx-auto">
          &ldquo;Focus on the process, and outcomes will naturally align.&rdquo;
        </p>

        {/* Date Countdown Pill */}
        <div className="pt-2 flex justify-center items-center gap-3">
          <div className="inline-flex items-center space-x-2 border border-black bg-[#F8F7F2] text-black text-[10px] font-bold uppercase tracking-widest px-4 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-black" />
            <span>Today: {formatDateStr(analytics?.today)}</span>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 border border-black bg-white hover:bg-black hover:text-white transition-colors"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Metrics (Editorial Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Planned Study */}
        <div className="bg-[#F8F7F2] border border-black p-6 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Planned Study
          </div>
          <div className="font-serif text-4xl italic font-normal text-black">
            {formatHours(plannedMins)}
          </div>
          <div className="text-[10px] text-black/60 font-mono">
            {plannedMins} mins total
          </div>
        </div>

        {/* Completed Study */}
        <div className="bg-[#F8F7F2] border border-black p-6 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Completed Study
          </div>
          <div className="font-serif text-4xl italic font-normal text-black">
            {formatHours(completedMins)}
          </div>
          <div className="text-[10px] text-black/60 font-mono">
            {completedMins} mins logged
          </div>
        </div>

        {/* Completion Rate */}
        <div className="bg-[#F8F7F2] border border-black p-6 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Completion Rate
          </div>
          <div className="font-serif text-4xl italic font-normal text-black">
            {formatPercent(completionRate)}
          </div>
          <div className="text-[10px] text-black/60 font-mono">
            {completedCount} done / {missedCount} missed
          </div>
        </div>

        {/* Upcoming Workload */}
        <div className="bg-[#F8F7F2] border border-black p-6 text-center space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            Upcoming Workload
          </div>
          <div className="font-serif text-4xl italic font-normal text-black">
            {formatHours(upcomingWorkloadMins)}
          </div>
          <div className="text-[10px] text-black/60 font-mono">
            {upcomingWorkloadMins} mins remaining
          </div>
        </div>
      </div>

      {/* Primary Next Priority Hero Card */}
      <div className="bg-[#FDFDFC] border border-black p-8 sm:p-10 space-y-6 relative overflow-hidden">
        <div className="space-y-3 max-w-2xl relative z-10">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">
            Current High-Yield Focus
          </div>

          {nextBlock ? (
            <>
              <h2 className="font-serif text-4xl sm:text-5xl italic text-black leading-tight">
                {nextBlock.title}
              </h2>
              <p className="text-xs text-black/80 leading-relaxed font-sans">
                Topic: <strong className="text-black">{nextBlock.topicName}</strong> &bull; Scheduled for {nextBlock.date} at {nextBlock.startTime} ({nextBlock.durationMinutes} mins).
              </p>

              <div className="pt-6 border-t border-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-2 min-w-[240px]">
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.15em] font-bold text-black">
                    <span>{nextBlock.topicName}</span>
                    <span>{nextBlock.durationMinutes} mins</span>
                  </div>
                  <div className="w-full bg-black/10 h-1">
                    <div className="bg-black h-full w-[65%]"></div>
                  </div>
                </div>

                {onStartStudy && (
                  <button
                    onClick={() => onStartStudy(nextBlock)}
                    className="inline-flex items-center space-x-3 bg-black text-white hover:bg-white hover:text-black border border-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
                  >
                    <span>Start Next Session</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-serif text-4xl italic text-black leading-tight">
                All Scheduled Blocks Complete
              </h2>
              <p className="text-xs text-black/80 leading-relaxed font-sans">
                You have completed all scheduled tasks. Generate a new schedule set using the Planner or add blocks in the Calendar.
              </p>
              <div className="pt-4">
                <button
                  onClick={() => setActiveTab('planner')}
                  className="inline-flex items-center space-x-3 bg-black text-white hover:bg-white hover:text-black border border-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
                >
                  <span>Go to Planner</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Topic Progress Breakdown */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-black pb-3">
          <h3 className="font-serif text-3xl italic text-black">
            Topic &amp; Course Mastery
          </h3>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
            {analytics?.topicProgress?.length || 0} Topics Tracked
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-black/60 bg-[#F8F7F2] border border-black">
            Calculating topic analytics...
          </div>
        ) : !analytics?.topicProgress || analytics.topicProgress.length === 0 ? (
          <div className="p-8 text-center text-xs font-serif italic text-black/60 bg-[#F8F7F2] border border-black">
            No study blocks completed yet. Complete your first session to view topic mastery.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analytics.topicProgress.map((tp) => {
              const ratePct = safeNumber(tp.completionRate * 100, 0);
              const completedBlocks = safeNumber(tp.completedBlocks, 0);
              const totalBlocks = safeNumber(tp.totalBlocks, 0);

              return (
                <div key={tp.topicId} className="bg-[#F8F7F2] border border-black p-6 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-serif text-2xl italic text-black">
                        {tp.topicName}
                      </h4>
                      <div className="text-[10px] text-black/60 font-mono mt-1">
                        {completedBlocks} of {totalBlocks} study blocks completed
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider border border-black px-2 py-1 bg-white text-black">
                      {formatPercent(tp.completionRate)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-black/10 h-1">
                    <div
                      className="bg-black h-full transition-all duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, ratePct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editorial Navigation Footer Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
        <div
          onClick={() => setActiveTab('calendar')}
          className="bg-[#F8F7F2] border border-black p-6 space-y-2 cursor-pointer hover:bg-black hover:text-white transition-colors group"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold group-hover:text-white/60">
            Calendar Grid
          </div>
          <div className="font-serif text-2xl italic font-normal">
            View Time Slots &rarr;
          </div>
        </div>

        <div
          onClick={() => setActiveTab('insights')}
          className="bg-[#F8F7F2] border border-black p-6 space-y-2 cursor-pointer hover:bg-black hover:text-white transition-colors group"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold group-hover:text-white/60">
            Adaptive Engine
          </div>
          <div className="font-serif text-2xl italic font-normal">
            Request AI Re-plan &rarr;
          </div>
        </div>

        <div
          onClick={() => setActiveTab('history')}
          className="bg-[#F8F7F2] border border-black p-6 space-y-2 cursor-pointer hover:bg-black hover:text-white transition-colors group"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold group-hover:text-white/60">
            Study History
          </div>
          <div className="font-serif text-2xl italic font-normal">
            Session Log &rarr;
          </div>
        </div>
      </div>

    </div>
  );
};
