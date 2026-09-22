import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Clock3, CircleCheck, LayoutGrid, MessageSquare, Flame, BookOpen, Layers, CheckCircle2, Play, Shield } from 'lucide-react';
import { ActiveTab, DashboardAnalytics, ScheduleBlock, StudyStreak, UserAccount } from '../types';

interface DashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  refreshKey: number;
  user?: UserAccount | null;
  onStartStudy?: (block: ScheduleBlock) => Promise<void>;
  onOpenFocusMode?: () => void;
}

const TASTEFUL_STUDENT_QUOTES = [
  "Start small. Keep moving.",
  "Small progress still moves you forward.",
  "Understanding takes time. Give yourself the space to focus.",
  "One solid session beats three hours of distracted skimming.",
  "Focus on the concept in front of you.",
  "Momentum builds one solved problem at a time.",
  "Depth over speed.",
];

function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let timeSalutation = 'Good day';
  if (hour < 12) timeSalutation = 'Good morning';
  else if (hour < 18) timeSalutation = 'Good afternoon';
  else timeSalutation = 'Good evening';

  const cleanName = name ? name.split(' ')[0] : 'there';
  return `${timeSalutation}, ${cleanName} 👋`;
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

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  refreshKey,
  user,
  onStartStudy,
  onOpenFocusMode,
}) => {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [streak, setStreak] = useState<StudyStreak | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [error, setError] = useState('');

  // Cycle quote based on day
  useEffect(() => {
    const todayNum = new Date().getDate();
    setQuoteIndex(todayNum % TASTEFUL_STUDENT_QUOTES.length);
  }, []);

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
  }, [refreshKey]);

  // Derive today's actual blocks and upcoming priority block
  const todayKey = useMemo(() => {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }, []);

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
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      
      {/* 5. Interactive Dashboard / Personalized Student Opening Experience */}
      <section className="rounded-3xl border border-[#EDE7F3] bg-gradient-to-br from-white via-[#FAF8FC] to-[#F5EFFC] p-6 sm:p-10 shadow-xs relative overflow-hidden">
        {/* Subtle accent corner glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#EDE7F6] rounded-full filter blur-3xl opacity-60 pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599]">
              <LayoutGrid className="w-3 h-3 text-[#5E35B1]" /> Academic Command Center
            </div>
            
            <h1 className="font-serif text-3xl sm:text-5xl italic font-normal text-[#1C1B1F] leading-tight">
              {getGreeting(user?.displayName || user?.email)}
            </h1>

            {/* Student-focused, tasteful changing quote */}
            <p className="font-serif italic text-base sm:text-lg text-[#5E35B1]">
              &ldquo;{TASTEFUL_STUDENT_QUOTES[quoteIndex]}&rdquo;
            </p>

            {/* 6. Compact "Your Day" / Today Summary from Real Data */}
            <div className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs font-sans text-[#55524E]">
              <span className="font-bold text-[#1C1B1F] uppercase tracking-wider text-[10px]">Today:</span>
              <span className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-[#EDE7F3]">
                <strong className="text-[#1C1B1F] font-semibold">{todayBlocks.length}</strong> study blocks planned
              </span>
              <span className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-[#EDE7F3]">
                <strong className="text-[#5E35B1] font-semibold">{formatMinutes(todayScheduledMinutes)}</strong> scheduled
              </span>
              <span className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-[#EDE7F3]">
                <strong className="text-emerald-700 font-semibold">{todayCompletedCount}</strong> done
                {todayPendingCount > 0 && <span className="text-[#7B7484]">({todayPendingCount} remaining)</span>}
              </span>
            </div>
          </div>

          {/* Actionable "NEXT UP" Card - Answers "What should I do now?" */}
          <div className="w-full lg:w-80 shrink-0 bg-white rounded-2xl border border-[#D8CCE8] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5E35B1] flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" /> Next Up
              </span>
              {nextUpBlock && (
                <span className="text-[9px] font-mono uppercase bg-[#EDE7F6] text-[#461599] px-2 py-0.5 rounded font-bold">
                  {nextUpBlock.date === todayKey ? 'Today' : nextUpBlock.date}
                </span>
              )}
            </div>

            {nextUpBlock ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-[#1C1B1F] line-clamp-1">{nextUpBlock.title}</h3>
                  <div className="text-xs text-[#7B7484] font-mono mt-1 flex items-center gap-2">
                    <span>{formatTime(nextUpBlock.startTime)}</span>
                    <span>&bull;</span>
                    <span>{nextUpBlock.durationMinutes} min session</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {onStartStudy ? (
                    <button
                      onClick={() => void onStartStudy(nextUpBlock)}
                      className="flex-1 bg-[#5E35B1] hover:bg-[#461599] text-white py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em] transition-all flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-98"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Start Study</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('planner')}
                      className="flex-1 bg-[#5E35B1] hover:bg-[#461599] text-white py-2.5 px-3 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Open In Planner</span>
                    </button>
                  )}

                  {onOpenFocusMode && (
                    <button
                      onClick={onOpenFocusMode}
                      className="p-2.5 rounded-xl border border-[#D8CCE8] bg-[#FAF8FC] hover:bg-[#EDE7F6] text-[#461599] transition-colors"
                      title="Start with Focus Mode Shield"
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-2 space-y-2 text-center">
                <p className="text-xs text-[#7B7484]">Your calendar is clear. Plan your next subject block.</p>
                <button
                  onClick={() => setActiveTab('planner')}
                  className="w-full text-center py-2 px-3 rounded-xl border border-[#D8CCE8] bg-[#EDE7F6] text-[#461599] text-[10px] font-bold uppercase tracking-wider hover:bg-[#5E35B1] hover:text-white transition-colors"
                >
                  Plan Study Session &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top 4 Metrics + Streak Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div 
            key={card.label} 
            className="rounded-2xl border border-[#EDE7F3] bg-white p-5 shadow-2xs transition-all hover:border-[#D8CCE8]"
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7B7484]">{card.label}</div>
            <div className={`font-serif text-3xl italic mt-2.5 ${card.highlight ? 'text-[#5E35B1]' : 'text-[#1C1B1F]'}`}>
              {card.value}
            </div>
            <div className="text-[10px] text-[#7B7484] mt-2 truncate">{card.note}</div>
          </div>
        ))}

        {/* Study Streak Card */}
        <div className="rounded-2xl border border-[#EDE7F3] bg-gradient-to-br from-white to-[#FDF8FE] p-5 shadow-2xs transition-all hover:border-[#CEB8FF]">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7B7484]">Study streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-serif text-3xl italic mt-2.5 text-[#1C1B1F]">
            {streak ? `${streak.current} ${streak.current === 1 ? 'day' : 'days'}` : '0 days'}
          </div>
          <div className="text-[10px] text-[#7B7484] mt-2">
            Longest: {streak ? `${streak.longest} ${streak.longest === 1 ? 'day' : 'days'}` : '0 days'}
          </div>
        </div>
      </div>

      {!hasSessionEvidence && (
        <div className="rounded-2xl border border-dashed border-[#D8CCE8] bg-[#FDFBFE] p-6 text-center space-y-3">
          <p className="text-sm text-[#55524E] font-medium">Complete a study session to start seeing your progress.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setActiveTab('planner')}
              className="text-[11px] font-bold uppercase tracking-wider text-[#5E35B1] hover:underline"
            >
              Start in Planner &rarr;
            </button>
            <span className="text-[#D8CCE8]">•</span>
            <button
              onClick={() => setActiveTab('upload')}
              className="text-[11px] font-bold uppercase tracking-wider text-[#5E35B1] hover:underline"
            >
              Analyze Past Papers &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Middle Grid: Upcoming Workload & 7-Day Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-[#EDE7F3] bg-white p-6 sm:p-7 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-[#5E35B1]" />
              <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Upcoming workload</h2>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484]">Forecast</span>
          </div>

          {summary.upcomingBlocks > 0 ? (
            <div className="space-y-2">
              <div className="font-serif text-4xl italic text-[#5E35B1]">{formatMinutes(summary.upcomingMinutes)}</div>
              <p className="text-xs text-[#55524E]">
                {summary.upcomingBlocks} unfinished future session{summary.upcomingBlocks === 1 ? '' : 's'}.
              </p>
            </div>
          ) : (
            <div className="py-4 space-y-3">
              <p className="text-xs text-[#7B7484]">Your schedule is clear. Plan new study blocks to stay ahead.</p>
              <button
                onClick={() => setActiveTab('planner')}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5E35B1] border border-[#D8CCE8] px-3 py-1.5 rounded-lg hover:bg-[#EDE7F6] transition"
              >
                + Add Study Block
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#EDE7F3] bg-white p-6 sm:p-7 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleCheck className="w-4 h-4 text-[#5E35B1]" />
              <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Last 7 days</h2>
            </div>
            <span className="text-[10px] font-medium text-[#7B7484]">
              {sevenDay.startDate} to {sevenDay.endDate}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3]">
              <div className="font-serif text-xl italic text-[#1C1B1F]">{formatMinutes(sevenDay.plannedMinutes)}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] mt-1">Scheduled</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3]">
              <div className="font-serif text-xl italic text-[#5E35B1]">{formatDuration(sevenDay.actualSeconds)}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] mt-1">Studied</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3]">
              <div className="font-serif text-xl italic text-[#1C1B1F]">{sevenDay.completedSessions}</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] mt-1">Completed</div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3]">
              <div className="font-serif text-xl italic text-[#1C1B1F]">{Math.round(sevenDay.completionRate * 100)}%</div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-[#7B7484] mt-1">Rate</div>
            </div>
          </div>
        </section>
      </div>

      {/* Topic Progress Section */}
      <section className="rounded-2xl border border-[#EDE7F3] bg-white p-6 sm:p-8 space-y-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#5E35B1]" />
            <h2 className="font-serif text-3xl italic text-[#1C1B1F]">Topic progress</h2>
          </div>
          <button 
            onClick={() => setActiveTab('practice')}
            className="text-[10px] font-bold uppercase tracking-wider text-[#5E35B1] hover:underline"
          >
            + Start Topic Diagnostic
          </button>
        </div>

        {topics.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-[#7B7484]">
              No topic progress yet. Begin an AI Practice Session or past paper quiz to calibrate subject mastery.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDE7F3]">
            {topics.map((topic) => (
              <div key={topic.topicId} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-sm font-semibold text-[#1C1B1F]">{topic.topicName}</strong>
                  <div className="text-[#7B7484] mt-0.5">
                    {topic.completedSessions} completed · {topic.stoppedSessions} stopped
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="font-mono font-bold text-sm text-[#5E35B1]">{formatDuration(topic.actualSeconds)}</span>
                  <span className="text-[#7B7484] ml-1">studied</span>
                  <div className="text-[#7B7484] text-[11px] mt-0.5">{formatMinutes(topic.plannedMinutes)} planned</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Session Feedback Section */}
      <section className="rounded-2xl border border-[#EDE7F3] bg-[#FAF8FC] p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#5E35B1]" />
            <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Session feedback</h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484]">Post-session reflections</span>
        </div>

        {feedback.responseCount === 0 ? (
          <p className="text-xs text-[#7B7484] py-3">
            No session feedback yet. Post-session reflections and study health observations will appear here after your first deep study session.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#EDE7F3]">
              <strong className="text-xl font-serif italic text-[#1C1B1F]">{feedback.averageFocus!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] text-[10px] uppercase font-bold tracking-wider mt-1">Average Focus</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-[#EDE7F3]">
              <strong className="text-xl font-serif italic text-[#1C1B1F]">{feedback.averageDifficulty!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] text-[10px] uppercase font-bold tracking-wider mt-1">Average Difficulty</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-[#EDE7F3]">
              <strong className="text-xl font-serif italic text-[#5E35B1]">{feedback.averageProgress!.toFixed(1)} / 5</strong>
              <div className="text-[#7B7484] text-[10px] uppercase font-bold tracking-wider mt-1">
                Average Progress · {feedback.responseCount} response{feedback.responseCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Editorial Footer Tagline */}
      <div className="text-center pt-8 border-t border-[#EDE7F3]">
        <p className="font-serif italic text-sm text-[#7B7484]">
          Turn effort into momentum &mdash; <span className="font-sans not-italic font-semibold text-[#5E35B1]">Your Academic Buddy</span>
        </p>
      </div>

    </div>
  );
};
