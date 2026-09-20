import React, { useState, useEffect } from 'react';
import { ScheduleBlock, AnalyticsSnapshot, AdaptiveProposal, ScheduleChange, StudyStreak } from '../types';
import { safeNumber, formatDateStr } from '../utils/formatters';
import { Sparkles, Brain, CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle, BellOff, ShieldAlert } from 'lucide-react';

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
  const [proposal, setProposal] = useState<AdaptiveProposal | null>(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-6">
        <div>
          <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold bg-[#F8F7F2] mb-2">
            Adaptive Engine &bull; AI Insights
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            Adaptive Re-planner &amp; Audit
          </h1>
          <p className="text-xs text-black/60 font-sans mt-1">
            Request AI schedule adaptations based on learning friction and track change history.
          </p>
        </div>
        <button
          onClick={fetchInsightsData}
          className="p-2 border border-black bg-white hover:bg-black hover:text-white transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Study Streak Card */}
      <div className="bg-[#FDFDFC] border border-black p-6 flex items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">Study Streak</div>
          <h2 className="font-serif text-3xl italic text-black flex items-center gap-2">
            <span role="img" aria-label="flame">🔥</span>
            <span>{streak ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : '—'}</span>
          </h2>
          <p className="text-xs text-black/60 font-sans">
            {streak && streak.current > 0
              ? streak.current === 1
                ? 'One day strong — keep the chain alive.'
                : 'Consecutive days with a completed study session.'
              : 'No active streak yet — complete a session today to start one.'}
          </p>
        </div>
        <div className="text-right border-l border-black/20 pl-6">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-1">Longest</div>
          <div className="font-serif text-3xl italic text-black">
            {streak ? `${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}` : '—'}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Adaptive Engine + Notification Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Adaptive Proposal Engine (2 cols) */}
        <div className="lg:col-span-2 bg-[#FDFDFC] border border-black p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-black pb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">Adaptive Re-planner</div>
              <h2 className="font-serif text-3xl italic text-black">Request Adaptation Proposal</h2>
            </div>
            <Sparkles className="w-5 h-5 text-violet-700" />
          </div>

          {actionMessage && (
            <div
              className={`p-3 border text-xs font-mono ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                  : 'bg-red-50 border-red-400 text-red-900'
              }`}
            >
              <span>{actionMessage.text}</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60 mb-2">
                Select Schedule Block to Adapt
              </label>
              <select
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="w-full p-3 text-xs bg-[#F8F7F2] border border-black focus:outline-none focus:ring-1 focus:ring-black font-sans"
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
              <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60 mb-2">
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
                    className={`py-2 px-3 text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      reason === r.id
                        ? 'border-black bg-black text-white'
                        : 'border-black/30 bg-[#F8F7F2] text-black hover:border-black'
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
              className="w-full border border-black bg-black text-white hover:bg-white hover:text-black py-3 px-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-violet-400" />}
              <span>Generate Adaptive Proposal</span>
            </button>
          </div>

          {/* Proposal Preview Box */}
          {proposal && (
            <div className="mt-6 p-6 border border-black bg-[#F8F7F2] space-y-4">
              <div className="flex items-center justify-between border-b border-black/20 pb-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-black text-white px-2 py-0.5">
                  Proposed Revision Block
                </span>
                <span className="text-[10px] font-mono text-black/60">Reason: {proposal.reason}</span>
              </div>
              <div>
                <h3 className="font-serif text-2xl italic text-black">{proposal.title}</h3>
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-black/70 mt-1">
                  <span>Date: {proposal.date}</span>
                  <span>Time: {proposal.startTime}</span>
                  <span>Duration: {proposal.durationMinutes} mins</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleAcceptProposal}
                  className="flex-1 py-2.5 bg-black text-white border border-black hover:bg-white hover:text-black text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept &amp; Schedule
                </button>
                <button
                  onClick={handleRejectProposal}
                  className="flex-1 py-2.5 bg-white text-black border border-black hover:bg-black hover:text-white text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-1"
                >
                  <XCircle className="w-4 h-4" /> Reject Proposal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notification Status (1 col) */}
        <div className="bg-[#FDFDFC] border border-black p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-black pb-3">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40">Notifications</span>
              <BellOff className="w-4 h-4 text-black/40" />
            </div>

            <div className="p-4 bg-[#F8F7F2] border border-black/30 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-black" />
                Infrastructure Status
              </div>
              <p className="text-xs text-black/70 leading-relaxed">
                Automated email reminders and push notifications are currently disabled on the backend engine.
              </p>
            </div>
          </div>

          <div className="p-3 bg-white border border-black/20 text-[10px] font-mono text-black/60 space-y-1">
            <div className="font-bold text-black uppercase">Blocked Endpoint:</div>
            <div>POST /api/notifications/preferences</div>
          </div>
        </div>
      </div>

      {/* Schedule Change Audit Log */}
      <div className="bg-[#FDFDFC] border border-black p-8 space-y-4">
        <h2 className="font-serif text-3xl italic text-black flex items-center gap-2">
          <Clock className="w-5 h-5 text-black" />
          Schedule Adaptations Audit Log
        </h2>
        {scheduleChanges.length === 0 ? (
          <div className="p-8 text-center text-xs font-serif italic text-black/50 bg-[#F8F7F2] border border-black/20">
            No schedule adaptations recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-black/10 border-t border-b border-black">
            {scheduleChanges.map((change) => (
              <div key={change.id} className="py-3 flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-black">
                    <span className="px-2 py-0.5 border border-black text-[9px] uppercase tracking-wider font-mono bg-white">
                      {change.field}
                    </span>
                    <span>Reason: {change.reason || 'Manual'}</span>
                  </div>
                  <div className="text-[10px] font-mono text-black/50">Block ID: {change.blockId}</div>
                </div>
                <div className="text-[10px] text-black/50 font-mono">
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
