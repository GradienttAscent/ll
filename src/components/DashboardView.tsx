import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, DashboardAnalytics, ScheduleBlock, StudyStreak, UserAccount } from '../types';
import { AscentView } from './ascent/AscentView';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  refreshKey: number;
  user?: UserAccount | null;
  onStartStudy?: (block: ScheduleBlock) => Promise<void>;
  onOpenFocusMode?: () => void;
  onScheduleChanged?: () => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m || 0).padStart(2, '0')} ${period}`;
}

async function readApiJson(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The API returned HTML instead of data. Start the app with "npm run dev" so API requests reach the server.');
  }
  return response.json();
}

const DAILY_QUOTES = [
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  { text: 'Focus is a muscle. The more you practice it, the stronger it gets.', author: 'Cal Newport' },
  { text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
  { text: 'Small disciplines repeated with consistency every day lead to great achievements.', author: 'John C. Maxwell' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { text: 'Energy and persistence conquer all things.', author: 'Benjamin Franklin' },
  { text: 'Simplicity is prerequisite for reliability.', author: 'Edsger W. Dijkstra' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  refreshKey,
  user,
  onStartStudy,
  onOpenFocusMode,
  onScheduleChanged,
}) => {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [streak, setStreak] = useState<StudyStreak | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [error, setError] = useState('');
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const handleAscentRefresh = () => {
    setLocalRefreshKey((k) => k + 1);
    if (onScheduleChanged) onScheduleChanged();
  };

  useEffect(() => {
    let cancelled = false;
    const loadDashboardData = async () => {
      setError('');
      try {
        const [dashRes, streakRes, blocksRes] = await Promise.all([
          fetch('/api/analytics/dashboard'),
          fetch(`/api/study-streak?tzOffsetMinutes=${new Date().getTimezoneOffset()}`),
          fetch('/api/schedule-blocks'),
        ]);
        const [dashData, streakData, blocksData] = await Promise.all([
          readApiJson(dashRes),
          readApiJson(streakRes),
          readApiJson(blocksRes),
        ]);
        if (!dashRes.ok) throw new Error(dashData.error || 'Unable to load dashboard analytics.');
        if (!cancelled) {
          setAnalytics(dashData.analytics);
          setStreak(streakRes.ok && streakData.streak ? streakData.streak : null);
          if (blocksRes.ok && blocksData.scheduleBlocks) {
            setScheduleBlocks(blocksData.scheduleBlocks);
          }
        }
      } catch (loadError: any) {
        if (!cancelled) setError(loadError.message || 'Unable to load dashboard analytics.');
      }
    };
    void loadDashboardData();
    return () => { cancelled = true; };
  }, [refreshKey, localRefreshKey]);

  // Derive today's actual blocks and upcoming priority block
  const todayKey = useMemo(() => {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const displayName = user?.displayName?.trim() || 'Student';
    const capitalized = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    if (hour < 12) return `Good morning, ${capitalized}.`;
    if (hour < 17) return `Good afternoon, ${capitalized}.`;
    return `Good evening, ${capitalized}.`;
  }, [user]);

  const dailyQuote = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < todayKey.length; i++) {
      hash = (hash << 5) - hash + todayKey.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % DAILY_QUOTES.length;
    return DAILY_QUOTES[index];
  }, [todayKey]);

  const todayBlocks = useMemo(() => {
    return scheduleBlocks
      .filter((b) => b.date === todayKey)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [scheduleBlocks, todayKey]);

  const todayCompletedCount = todayBlocks.filter((b) => b.completed).length;
  const todayPendingCount = todayBlocks.filter((b) => !b.completed).length;
  const todayScheduledMinutes = todayBlocks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

  // Next up actionable block (first incomplete block today or earliest upcoming incomplete block)
  const nextUpBlock = useMemo(() => {
    const pendingToday = todayBlocks.find((b) => !b.completed);
    if (pendingToday) return pendingToday;
    
    // Earliest upcoming from tomorrow onwards
    const upcoming = scheduleBlocks
      .filter((b) => !b.completed && b.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
    return upcoming[0] || null;
  }, [todayBlocks, scheduleBlocks, todayKey]);

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 text-xs font-semibold text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-6 sm:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#EDE7F3] text-xs font-medium text-[#7B7484]">
          <span className="w-2 h-2 rounded-full bg-[#5E35B1] animate-ping" />
          Loading your study workspace...
        </div>
      </div>
    );
  }

  const { summary, sevenDay, feedback, topics } = analytics;
  const hasSessionEvidence = summary.completedSessions + summary.stoppedSessions > 0 || summary.actualSeconds > 0;
  
  const cards = [
    { label: 'Planned Study Time', value: formatMinutes(summary.plannedMinutes), note: 'All saved calendar blocks', highlight: false },
    { label: 'Actually Studied', value: formatDuration(summary.actualSeconds), note: 'Persisted active time only', highlight: true },
    { label: 'Completed Sessions', value: `${summary.completedSessions} session${summary.completedSessions === 1 ? '' : 's'}`, note: `${summary.stoppedSessions} stopped`, highlight: false },
    { label: 'Completion Rate', value: `${Math.round(summary.completionRate * 100)}%`, note: 'Completed / scheduled', highlight: false },
  ];

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
      
      {/* Personalized Greeting & Attributed Daily Quote */}
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
        <div>
          <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            {greeting}
          </h2>
        </div>
        <div className="text-left md:text-right self-start md:self-auto max-w-md">
          <blockquote className="font-serif italic text-xs sm:text-sm text-[#55524E] dark:text-[#C5BFCB]">
            &ldquo;{dailyQuote.text}&rdquo;
          </blockquote>
          <cite className="block text-[10px] font-sans font-medium uppercase tracking-wider text-[#7B7484] dark:text-[#807A87] mt-0.5 not-italic">
            &mdash; {dailyQuote.author}
          </cite>
        </div>
      </div>

      {/* Visual Centerpiece: YOUR ASCENT */}
      <AscentView
        user={user}
        refreshKey={refreshKey + localRefreshKey}
        onRefreshGlobal={handleAscentRefresh}
        onStartStudy={onStartStudy}
      />

      {/* Today's Overview Section */}
      <div className="space-y-6 pt-4 border-t border-[#EDE7F3] dark:border-[#302B35]">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
          <div>
            <h2 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Today&apos;s Overview
            </h2>
            <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans mt-0.5">
              Scheduled commitments, execution rate, and active streak.
            </p>
          </div>
          {nextUpBlock && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#7B7484] dark:text-[#A9A3AE]">
                Next: <strong className="text-[#17151A] dark:text-[#F5F3F7] font-semibold">{nextUpBlock.title}</strong>
              </span>
              {onStartStudy ? (
                <button
                  onClick={() => void onStartStudy(nextUpBlock)}
                  className="px-3 py-1 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white text-[10px] font-semibold uppercase tracking-wider transition-colors"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('planner')}
                  className="px-3 py-1 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] text-[#6D28D9] dark:text-[#8B5CF6] text-[10px] font-semibold uppercase tracking-wider hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] transition-colors"
                >
                  View
                </button>
              )}
            </div>
          )}
        </div>

        {/* 5 Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((card) => (
            <div 
              key={card.label} 
              className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-4 shadow-2xs"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">{card.label}</div>
              <div className={`font-serif text-3xl italic mt-2 ${card.highlight ? 'text-[#6D28D9] dark:text-[#8B5CF6]' : 'text-[#17151A] dark:text-[#F5F3F7]'}`}>
                {card.value}
              </div>
              <div className="text-[10px] text-[#7B7484] dark:text-[#A9A3AE] mt-1.5 truncate">{card.note}</div>
            </div>
          ))}

          {/* Daily Streak */}
          <div className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-4 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">Daily streak</div>
            <div className="font-serif text-3xl italic mt-2 text-[#17151A] dark:text-[#F5F3F7]">
              {streak ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : '0 days'}
            </div>
            <div className="text-[10px] text-[#7B7484] dark:text-[#A9A3AE] mt-1.5">
              Best: {streak ? `${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}` : '0 days'}
            </div>
          </div>
        </div>
      </div>

      {!hasSessionEvidence && (
        <div className="rounded-xl border border-dashed border-[#D8CCE8] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#17151A] p-6 text-center space-y-3">
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE]">Complete a scheduled study session to build your ascent momentum.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setActiveTab('planner')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
            >
              Start in Planner &rarr;
            </button>
            <span className="text-[#D8CCE8] dark:text-[#4A4254]">•</span>
            <button
              onClick={() => setActiveTab('upload')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
            >
              Analyze Past Papers &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Middle Grid: Upcoming Workload & 7-Day Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
            <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">Upcoming workload</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">Forecast</span>
          </div>

          {summary.upcomingBlocks > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="font-serif text-3xl sm:text-4xl italic text-[#6D28D9] dark:text-[#8B5CF6]">{formatMinutes(summary.upcomingMinutes)}</div>
              <p className="text-xs text-[#55524E] dark:text-[#A9A3AE]">
                {summary.upcomingBlocks} scheduled session{summary.upcomingBlocks === 1 ? '' : 's'} remaining on your calendar.
              </p>
            </div>
          ) : (
            <div className="py-4 space-y-3">
              <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE]">Your schedule is clear. Plan new study blocks to stay ahead.</p>
              <button
                onClick={() => setActiveTab('planner')}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] border border-[#EDE7F3] dark:border-[#302B35] px-3 py-1.5 rounded-lg hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] transition"
              >
                + Plan Study Block
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
            <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">Last 7 days</h3>
            <span className="text-[10px] font-mono text-[#7B7484] dark:text-[#807A87]">
              {sevenDay.startDate} &ndash; {sevenDay.endDate}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <div className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">{formatMinutes(sevenDay.plannedMinutes)}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] dark:text-[#807A87] mt-1">Scheduled</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <div className="font-serif text-xl italic text-[#6D28D9] dark:text-[#8B5CF6]">{formatDuration(sevenDay.actualSeconds)}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] dark:text-[#807A87] mt-1">Studied</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <div className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">{sevenDay.completedSessions}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] dark:text-[#807A87] mt-1">Completed</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <div className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">{Math.round(sevenDay.completionRate * 100)}%</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] dark:text-[#807A87] mt-1">Rate</div>
            </div>
          </div>
        </section>
      </div>

      {/* Topic Progress Section */}
      <section className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 sm:p-7 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
          <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">Topic progress</h3>
          <button 
            onClick={() => setActiveTab('practice')}
            className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
          >
            + Start Diagnostic
          </button>
        </div>

        {topics.length === 0 ? (
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-4">
            No topic progress recorded yet. Upload course materials or begin practice sessions to map topic calibration.
          </p>
        ) : (
          <div className="divide-y divide-[#EDE7F3] dark:divide-[#302B35]">
            {topics.map((topic) => (
              <div key={topic.topicId} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">{topic.topicName}</strong>
                  <div className="text-[#7B7484] dark:text-[#807A87] text-[11px] mt-0.5">
                    {topic.completedSessions} completed · {topic.stoppedSessions} stopped
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="font-mono font-bold text-sm text-[#6D28D9] dark:text-[#8B5CF6]">{formatDuration(topic.actualSeconds)}</span>
                  <span className="text-[#7B7484] dark:text-[#A9A3AE] ml-1">studied</span>
                  <div className="text-[#7B7484] dark:text-[#807A87] text-[11px] mt-0.5">{formatMinutes(topic.plannedMinutes)} planned</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Session Feedback Section */}
      <section className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 sm:p-7 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
          <h3 className="font-serif text-2xl italic text-[#17151A] dark:text-[#F5F3F7]">Session feedback</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">Post-session reflections</span>
        </div>

        {feedback.responseCount === 0 ? (
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-3">
            No session reflections yet. Ratings and notes will appear here after completing study blocks.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
            <div className="p-4 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <strong className="text-2xl font-serif italic text-[#17151A] dark:text-[#F5F3F7]">{feedback.averageFocus!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] dark:text-[#807A87] text-[10px] uppercase font-bold tracking-wider mt-1">Average Focus</div>
            </div>
            <div className="p-4 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <strong className="text-2xl font-serif italic text-[#17151A] dark:text-[#F5F3F7]">{feedback.averageDifficulty!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] dark:text-[#807A87] text-[10px] uppercase font-bold tracking-wider mt-1">Average Difficulty</div>
            </div>
            <div className="p-4 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
              <strong className="text-2xl font-serif italic text-[#6D28D9] dark:text-[#8B5CF6]">{feedback.averageProgress!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] dark:text-[#807A87] text-[10px] uppercase font-bold tracking-wider mt-1">
                Average Progress ({feedback.responseCount} logged)
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
};
