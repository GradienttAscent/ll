import React, { useState, useEffect } from 'react';
import { ScheduleBlock, AnalyticsSnapshot, LegacyAdaptiveProposal, ScheduleChange, StudyStreak } from '../types';
import { safeNumber, formatDateStr } from '../utils/formatters';
import { Sliders, CalendarCheck, Brain, CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle, BellOff, ShieldAlert } from 'lucide-react';

interface InsightsViewProps {
  scheduleBlocks: ScheduleBlock[];
  onRefreshSchedule?: () => Promise<void>;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ scheduleBlocks, onRefreshSchedule }) => {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [scheduleChanges, setScheduleChanges] = useState<ScheduleChange[]>([]);
  const [streak, setStreak] = useState<StudyStreak | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Proposal state
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [reason, setReason] = useState<'low_focus' | 'low_score' | 'incomplete' | 'difficulty_hard'>('incomplete');
  const [proposal, setProposal] = useState<LegacyAdaptiveProposal | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchInsightsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, changesRes, streakRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/schedule-changes'),
        fetch(`/api/study-streak?tzOffsetMinutes=${new Date().getTimezoneOffset()}`)
      ]);

      if (!analyticsRes.ok) throw new Error('Failed to fetch analytics');
      if (!changesRes.ok) throw new Error('Failed to fetch schedule changes');
      if (!streakRes.ok) throw new Error('Failed to fetch study streak');

      const analyticsData = await analyticsRes.json();
      const changesData = await changesRes.json();
      const streakData = await streakRes.json();

      setAnalytics(analyticsData.analytics || analyticsData);
      setScheduleChanges(changesData.scheduleChanges || []);
      setStreak(streakData.streak || null);
    } catch (err: any) {
      setError(err.message || 'Error loading behavioral insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsightsData();
  }, []);

  const handleGenerateProposal = async () => {
    if (!selectedBlockId) return;
    setIsGenerating(true);
    setActionMessage(null);
    setProposal(null);

    try {
      const res = await fetch('/api/adaptive/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleBlockId: selectedBlockId, reason })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate proposal');

      setProposal(data.proposal);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptProposal = async () => {
    if (!proposal) return;
    try {
      const res = await fetch('/api/adaptive/proposals/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept proposal');

      setActionMessage({ type: 'success', text: 'Adaptive revision block added to your schedule!' });
      setProposal(null);
      if (onRefreshSchedule) await onRefreshSchedule();
      await fetchInsightsData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleRejectProposal = async () => {
    if (!proposal) return;
    try {
      await fetch('/api/adaptive/proposals/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBlockId: proposal.sourceBlockId, reason: proposal.reason })
      });
      setActionMessage({ type: 'success', text: 'Proposal rejected.' });
      setProposal(null);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const uncompletedBlocks = scheduleBlocks.filter((b) => !b.completed);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-8 space-y-12 animate-fade-in pb-16">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDE7F3] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
            <Sliders className="w-3 h-3 text-[#5E35B1]" /> Adaptive Engine &bull; Schedule Insights
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
            Adaptive Re-planner &amp; Audit
          </h1>
          <p className="text-xs text-[#7B7484] font-sans mt-2">
            Request AI schedule adaptations based on learning friction and track change history.
          </p>
        </div>
        <button
          onClick={fetchInsightsData}
          className="p-3 rounded-xl border border-[#EDE7F3] bg-white hover:bg-[#FAF8FC] text-[#5E35B1] transition-colors shadow-2xs self-start sm:self-auto"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Study Streak Card */}
      <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-7 flex items-center justify-between gap-6 shadow-2xs">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">Study Streak</div>
          <h2 className="font-serif text-3xl sm:text-4xl italic text-[#1C1B1F] flex items-center gap-2 mt-1">
            <span role="img" aria-label="flame">🔥</span>
            <span className="text-[#5E35B1] font-bold">{streak ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : '—'}</span>
          </h2>
          <p className="text-xs text-[#7B7484] font-sans mt-1">
            {streak && streak.current > 0
              ? streak.current === 1
                ? 'One day strong — keep the chain alive.'
                : 'Consecutive days with a completed study session.'
              : 'No active streak yet — complete a session today to start one.'}
          </p>
        </div>
        <div className="text-right border-l border-[#EDE7F3] pl-6 sm:pl-8">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] mb-1">Longest</div>
          <div className="font-serif text-3xl sm:text-4xl italic text-[#1C1B1F]">
            {streak ? `${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}` : '—'}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Adaptive Engine + Notification Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Adaptive Proposal Engine (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">Adaptive Re-planner</div>
              <h2 className="font-serif text-3xl italic text-[#1C1B1F] mt-1">Request Adaptation Proposal</h2>
            </div>
            <Sliders className="w-5 h-5 text-[#5E35B1]" />
          </div>

          {actionMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-mono ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{actionMessage.text}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-2">
                Select Schedule Block to Adapt
              </label>
              <select
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="w-full p-3.5 text-xs bg-white rounded-xl border border-[#EDE7F3] focus:outline-none focus:border-[#5E35B1] focus:ring-2 focus:ring-[#5E35B1]/10 font-sans text-[#1C1B1F] transition-all"
              >
                <option value="">-- Choose a Study Block --</option>
                {uncompletedBlocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.date} at {b.startTime}, {b.durationMinutes}m)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-2">
                Adaptation Reason
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'incomplete', label: 'Incomplete' },
                  { id: 'low_focus', label: 'Low Focus' },
                  { id: 'low_score', label: 'Low Quiz Score' },
                  { id: 'difficulty_hard', label: 'High Difficulty' }
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id as any)}
                    className={`py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                      reason === r.id
                        ? 'border-[#5E35B1] bg-[#EDE7F6] text-[#461599]'
                        : 'border-[#EDE7F3] bg-white text-[#7B7484] hover:border-[#D8CCE8]'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateProposal}
              disabled={!selectedBlockId || isGenerating}
              className="w-full rounded-xl bg-[#5E35B1] hover:bg-[#461599] text-white py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center space-x-2 shadow-xs hover:shadow active:scale-98 disabled:opacity-50"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin text-[#CEB8FF]" /> : <CalendarCheck className="w-4 h-4 text-white" />}
              <span>Generate Adaptive Proposal</span>
            </button>
          </div>

          {/* Proposal Preview Box */}
          {proposal && (
            <div className="mt-6 p-6 rounded-xl border border-[#D8CCE8] bg-[#FAF8FC] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-[#5E35B1] text-white px-2 py-0.5 rounded">
                  Proposed Revision Block
                </span>
                <span className="text-[10px] font-mono text-[#7B7484]">Reason: {proposal.reason}</span>
              </div>
              <div>
                <h3 className="font-serif text-2xl italic text-[#1C1B1F]">{proposal.title}</h3>
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#55524E] mt-1">
                  <span>Date: {proposal.date}</span>
                  <span>Time: {proposal.startTime}</span>
                  <span>Duration: {proposal.durationMinutes} mins</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleAcceptProposal}
                  className="flex-1 py-2.5 rounded-lg bg-[#5E35B1] hover:bg-[#461599] text-white text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept &amp; Schedule
                </button>
                <button
                  onClick={handleRejectProposal}
                  className="flex-1 py-2.5 rounded-lg bg-white text-[#7B7484] border border-[#EDE7F3] hover:border-red-200 hover:text-red-700 text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" /> Reject Proposal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notification Status (1 col) */}
        <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 flex flex-col justify-between space-y-6 shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-3">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">Notifications</span>
              <BellOff className="w-4 h-4 text-[#7B7484]" />
            </div>

            <div className="p-4 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#1C1B1F] flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-[#5E35B1]" />
                Infrastructure Status
              </div>
              <p className="text-xs text-[#7B7484] leading-relaxed">
                Automated email reminders and push notifications are currently disabled on the backend engine.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#FAF8FC] border border-[#EDE7F3] text-[10px] font-mono text-[#7B7484] space-y-1">
            <div className="font-bold text-[#1C1B1F] uppercase">Blocked Endpoint:</div>
            <div>POST /api/notifications/preferences</div>
          </div>
        </div>
      </div>

      {/* Schedule Change Audit Log */}
      <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-8 space-y-4 shadow-2xs">
        <h2 className="font-serif text-3xl italic text-[#1C1B1F] flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#5E35B1]" />
          Schedule Adaptations Audit Log
        </h2>
        {scheduleChanges.length === 0 ? (
          <div className="p-8 text-center text-xs font-serif italic text-[#7B7484] bg-[#FAF8FC] rounded-xl border border-[#EDE7F3]">
            No schedule adaptations recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-[#EDE7F3] border-t border-b border-[#EDE7F3]">
            {scheduleChanges.map((change) => (
              <div key={change.id} className="py-3.5 flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-[#1C1B1F]">
                    <span className="px-2 py-0.5 rounded border border-[#D8CCE8] text-[9px] uppercase tracking-wider font-mono bg-[#EDE7F6] text-[#461599]">
                      {change.field}
                    </span>
                    <span>Reason: {change.reason || 'Manual'}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[#7B7484]">Block ID: {change.blockId}</div>
                </div>
                <div className="text-[10px] text-[#7B7484] font-mono">
                  {new Date(change.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
