import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, Clock3, CircleCheck } from 'lucide-react';
import { ActiveTab, DashboardAnalytics } from '../types';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  refreshKey: number;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export const DashboardView: React.FC<DashboardViewProps> = ({ setActiveTab, refreshKey }) => {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadAnalytics = async () => {
      setError('');
      try {
        const response = await fetch('/api/analytics/dashboard');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load dashboard analytics.');
        if (!cancelled) setAnalytics(data.analytics);
      } catch (loadError: any) {
        if (!cancelled) setError(loadError.message || 'Unable to load dashboard analytics.');
      }
    };
    void loadAnalytics();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (error) return <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8"><div className="border border-black bg-[#F8F7F2] p-5 text-xs font-bold">{error}</div></div>;
  if (!analytics) return <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8 text-xs text-black/60">Loading your study analytics...</div>;

  const { summary, sevenDay, feedback, topics } = analytics;
  const hasSessionEvidence = summary.completedSessions + summary.stoppedSessions > 0 || summary.actualSeconds > 0;
  const cards = [
    { label: 'Planned study time', value: formatMinutes(summary.plannedMinutes), note: 'All saved calendar blocks' },
    { label: 'Actually studied', value: formatDuration(summary.actualSeconds), note: 'Persisted active time only' },
    { label: 'Completed sessions', value: `${summary.completedSessions} session${summary.completedSessions === 1 ? '' : 's'}`, note: `${summary.stoppedSessions} stopped` },
    { label: 'Completion rate', value: `${Math.round(summary.completionRate * 100)}%`, note: 'Completed / completed + stopped' },
  ];

  return <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
    <div className="border-b border-black pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
      <div><div className="inline-flex items-center gap-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold"><Calendar className="w-3.5 h-3.5" />Live study evidence</div><h1 className="font-serif text-5xl italic mt-3">Study Dashboard</h1><p className="text-xs text-black/60 mt-2">All-time summary from your saved calendar blocks and persisted study sessions.</p></div>
      <button onClick={() => setActiveTab('planner')} className="inline-flex items-center gap-2 bg-black text-white border border-black px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] hover:bg-white hover:text-black transition-colors">Open planner <ArrowRight className="w-3.5 h-3.5" /></button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{cards.map((card) => <div key={card.label} className="border border-black bg-[#F8F7F2] p-5"><div className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/55">{card.label}</div><div className="font-serif text-3xl italic mt-3">{card.value}</div><div className="text-[10px] text-black/60 mt-2">{card.note}</div></div>)}</div>

    {!hasSessionEvidence && <div className="border border-dashed border-black/50 p-5 text-sm">Complete a study session to start seeing your progress.</div>}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="border border-black p-6 space-y-3"><div className="flex items-center gap-2"><Clock3 className="w-4 h-4" /><h2 className="font-serif text-2xl italic">Upcoming workload</h2></div>{summary.upcomingBlocks > 0 ? <><div className="font-serif text-4xl italic">{formatMinutes(summary.upcomingMinutes)}</div><p className="text-xs text-black/60">{summary.upcomingBlocks} unfinished future session{summary.upcomingBlocks === 1 ? '' : 's'}.</p></> : <p className="text-xs text-black/60">Your schedule is clear.</p>}</section>
      <section className="border border-black p-6 space-y-3"><div className="flex items-center gap-2"><CircleCheck className="w-4 h-4" /><h2 className="font-serif text-2xl italic">Last 7 days</h2></div><p className="text-xs text-black/60">{sevenDay.startDate} to {sevenDay.endDate}</p><div className="grid grid-cols-2 gap-3 text-xs"><div><strong>{formatMinutes(sevenDay.plannedMinutes)}</strong><br /><span className="text-black/60">scheduled</span></div><div><strong>{formatDuration(sevenDay.actualSeconds)}</strong><br /><span className="text-black/60">studied</span></div><div><strong>{sevenDay.completedSessions}</strong><br /><span className="text-black/60">completed</span></div><div><strong>{Math.round(sevenDay.completionRate * 100)}%</strong><br /><span className="text-black/60">completion rate</span></div></div></section>
    </div>

    <section className="border border-black p-6 space-y-4"><h2 className="font-serif text-3xl italic">Topic progress</h2>{topics.length === 0 ? <p className="text-xs text-black/60">No topic progress yet.</p> : topics.map((topic) => <div key={topic.topicId} className="border-t border-black/20 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"><div><strong>{topic.topicName}</strong><div className="text-black/60 mt-1">{topic.completedSessions} completed · {topic.stoppedSessions} stopped</div></div><div className="sm:text-right"><strong>{formatDuration(topic.actualSeconds)} studied</strong><div className="text-black/60 mt-1">{formatMinutes(topic.plannedMinutes)} planned</div></div></div>)}</section>

    <section className="border border-black bg-[#F8F7F2] p-6"><h2 className="font-serif text-2xl italic">Session feedback</h2>{feedback.responseCount === 0 ? <p className="text-xs text-black/60 mt-3">No session feedback yet.</p> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-xs"><div><strong>{feedback.averageFocus!.toFixed(1)} / 5</strong><br /><span className="text-black/60">Average focus</span></div><div><strong>{feedback.averageDifficulty!.toFixed(1)} / 5</strong><br /><span className="text-black/60">Average difficulty</span></div><div><strong>{feedback.averageProgress!.toFixed(1)} / 5</strong><br /><span className="text-black/60">Average progress · {feedback.responseCount} response{feedback.responseCount === 1 ? '' : 's'}</span></div></div>}</section>
  </div>;
};
