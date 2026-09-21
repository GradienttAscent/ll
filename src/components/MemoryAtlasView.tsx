import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarPlus, Clock3, Loader2, Sparkles } from 'lucide-react';
import { CourseMemorySummary, MemoryAtlasData, MemoryTopicState, RefreshPlan } from '../types';

interface MemoryAtlasViewProps {
  onCalendarChanged: () => void;
}

const MAX_CURVES = 6;

const chartWidth = 1000;
const chartHeight = 384;
const chartLeft = 76;
const chartTop = 36;
const chartRight = 30;
const chartBottom = 48;
const plotWidth = chartWidth - chartLeft - chartRight;
const plotHeight = chartHeight - chartTop - chartBottom;

const xOf = (day: number) => chartLeft + (day / 14) * plotWidth;
const yOfRetention = (retention: number) => chartTop + (1 - retention) * plotHeight;
const clampRetention = (value: number) => Math.max(0, Math.min(1, value));

const statusLabel = (status: MemoryTopicState['status']) => status === 'stable' ? 'Stable' : status === 'fading' ? 'Approaching revision' : 'Revision due';
const statusShort = (status: MemoryTopicState['status']) => status === 'stable' ? 'STABLE' : status === 'fading' ? 'FADING' : 'DUE';
const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};
const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const formatDateShort = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const formatSlot = (date: string, time: string) => `${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} | ${time}`;
const pad = (value: number) => String(value).padStart(2, '0');

function curvePath(topic: MemoryTopicState): string {
  return Array.from({ length: 57 }, (_, index) => {
    const days = (index * 14) / 56;
    const retention = clampRetention(topic.predictedRetention * Math.exp(-days / topic.memoryStrengthDays));
    const x = xOf(days);
    const y = yOfRetention(retention);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function MemoryRing({ course }: { course: CourseMemorySummary }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * course.predictedRetention;
  return <div className="border border-black p-5 flex items-center gap-5 bg-[#FDFDFC]">
    <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0" role="img" aria-label={`${course.courseName} predicted retention ${formatPercent(course.predictedRetention)}`}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="4" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke="black" strokeWidth="4" strokeLinecap="square" strokeDasharray={`${filled} ${circumference}`} transform="rotate(-90 50 50)" className="transition-all duration-500" />
      <text x="50" y="54" textAnchor="middle" fontSize="16" fontFamily="Instrument Serif, Georgia, serif">{formatPercent(course.predictedRetention)}</text>
    </svg>
    <div className="min-w-0"><div className="text-[9px] uppercase tracking-[0.18em] font-bold text-black/50">Course memory</div><h3 className="font-serif text-2xl italic truncate mt-1">{course.courseName}</h3><p className="text-[10px] text-black/60 mt-2">{course.dueCount} due | {course.fadingCount} fading | {course.stableCount} stable</p></div>
  </div>;
}

function StatusMark({ status }: { status: MemoryTopicState['status'] }) {
  const style = status === 'due'
    ? 'bg-black text-white border-black'
    : status === 'fading'
      ? 'border-black text-black'
      : 'border-black/40 text-black/50';
  return <span className={`inline-flex border px-2 py-0.5 text-[8px] uppercase tracking-[0.14em] font-bold ${style}`}>{statusShort(status)}</span>;
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mq.addEventListener('change', handler);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export const MemoryAtlasView: React.FC<MemoryAtlasViewProps> = ({ onCalendarChanged }) => {
  const [forecastDays, setForecastDays] = useState(0);
  const [atlas, setAtlas] = useState<MemoryAtlasData | null>(null);
  const [nowAtlas, setNowAtlas] = useState<MemoryAtlasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [engaged, setEngaged] = useState(false);
  const selectTopic = (topicId: string) => { setEngaged(true); setSelectedTopicId(topicId); };
  const [refreshPlan, setRefreshPlan] = useState<RefreshPlan | null>(null);
  const [planTopicId, setPlanTopicId] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState('');
  const compact = useMedia('(max-width: 767px)');

  const loadAtlas = async (days: number): Promise<MemoryAtlasData> => {
    const response = await fetch(`/api/memory/topics?forecastDays=${days}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load memory estimates.');
    return data.memory;
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    void loadAtlas(0)
      .then((memory) => { setAtlas(memory); setNowAtlas(memory); })
      .catch((loadError: any) => setError(loadError.message || 'Unable to load memory estimates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (forecastDays === 0) return;
    const timer = window.setTimeout(() => {
      void loadAtlas(forecastDays)
        .then(setAtlas)
        .catch((loadError: any) => setError(loadError.message || 'Unable to load memory estimates.'));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [forecastDays]);

  const buildPlan = async (topicId?: string) => {
    setPlanLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/memory/refresh-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(topicId ? { topicId } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to build a refresh plan.');
      setRefreshPlan(data.refreshPlan);
      setPlanTopicId(topicId || null);
      if (data.refreshPlan.message) setMessage(data.refreshPlan.message);
    } catch (planError: any) {
      setMessage(planError.message || 'Unable to build a refresh plan.');
    } finally {
      setPlanLoading(false);
    }
  };

  const acceptPlan = async () => {
    if (!refreshPlan?.items.length) return;
    setAccepting(true);
    setMessage('');
    try {
      const response = await fetch('/api/memory/refresh-plan/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: refreshPlan.items, ...(planTopicId ? { topicId: planTopicId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to add the refresh plan.');
      setRefreshPlan(null);
      setPlanTopicId(null);
      setMessage(`${data.scheduleBlocks.length} memory refresh ${data.scheduleBlocks.length === 1 ? 'block was' : 'blocks were'} added to your calendar.`);
      onCalendarChanged();
      void loadAtlas(forecastDays).then(setAtlas);
    } catch (acceptError: any) {
      setMessage(acceptError.message || 'Unable to add the refresh plan.');
    } finally {
      setAccepting(false);
    }
  };

  const chartTopics = useMemo(() => {
    if (!atlas) return [];
    const bySoonestCrossing = (left: MemoryTopicState, right: MemoryTopicState) => left.daysUntilDue - right.daysUntilDue;
    const fading = atlas.topics.filter((topic) => topic.status === 'fading').sort(bySoonestCrossing);
    const stableCrossingNow = atlas.topics
      .filter((topic) => topic.status === 'stable' && topic.daysUntilDue > 0 && topic.daysUntilDue <= forecastDays)
      .sort(bySoonestCrossing);
    const dueClosestToThreshold = atlas.topics
      .filter((topic) => topic.status === 'due')
      .sort((left, right) => right.daysUntilDue - left.daysUntilDue);
    return [...fading, ...stableCrossingNow, ...dueClosestToThreshold].slice(0, MAX_CURVES)
      .map((topic, index) => ({ topic, index: index + 1 }));
  }, [atlas, forecastDays]);

  const nowTopics = useMemo(() => {
    const source = nowAtlas || atlas;
    if (!source) return [];
    const rank = (topic: MemoryTopicState) => topic.status === 'due' ? 0 : topic.status === 'fading' ? 1 : 2;
    return source.topics
      .slice()
      .sort((left, right) => rank(left) - rank(right) || left.predictedRetention - right.predictedRetention)
      .slice(0, MAX_CURVES)
      .map((topic, index) => ({ topic, index: index + 1 }));
  }, [atlas, nowAtlas]);

  const selectedTopic = useMemo(() => {
    const source = atlas?.topics.find((topic) => topic.topicId === selectedTopicId) || null;
    return source || chartTopics[0]?.topic || null;
  }, [atlas, selectedTopicId, chartTopics]);

  const selectedChartIndex = chartTopics.find((entry) => entry.topic.topicId === selectedTopic?.topicId)?.index ?? null;
  const selectedInChart = chartTopics.some((entry) => entry.topic.topicId === selectedTopic?.topicId);

  if (loading && !atlas) return <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 text-xs text-black/60">Mapping your completed study evidence...</div>;
  if (error && !atlas) return <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8"><div className="border border-black bg-[#F8F7F2] p-5 text-xs font-bold">{error}</div></div>;
  if (!atlas) return null;

  const hasTopics = atlas.summary.studiedTopicCount > 0;
  const xTicks = compact ? [0, 4, 8, 12, 14] : [0, 2, 4, 6, 8, 10, 12, 14];
  const thresholdY = yOfRetention(0.5);

  const markLayout = (() => {
    const columnOffsets = [0, 13, 26];
    const lastY = [-Infinity, -Infinity, -Infinity];
    return chartTopics.map(({ topic, index }) => {
      const y = yOfRetention(topic.predictedRetention);
      let column = 0;
      while (column < columnOffsets.length - 1 && Math.abs(y - lastY[column]) < 20) column += 1;
      lastY[column] = y;
      return { topic, index, y, x: xOf(0) + columnOffsets[column] };
    });
  })();

  const crossings = chartTopics
    .filter(({ topic }) => topic.daysUntilDue > 0 && topic.daysUntilDue <= 14)
    .map(({ topic, index }) => ({ topic, index, x: xOf(Math.min(14, topic.daysUntilDue)), y: thresholdY }));

  return <div className="max-w-7xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
    <header className="border-b border-black pb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
      <div><div className="inline-flex items-center gap-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold"><Sparkles className="w-3.5 h-3.5" />Memory Atlas</div><h1 className="font-serif text-5xl sm:text-6xl italic mt-4">Your Memory Atlas</h1><p className="text-sm text-black/65 max-w-2xl mt-3">Knowledge fades. LazyLift helps you return. A visual map of the concepts you have actually studied and when they may benefit from revision.</p></div>
      <button onClick={() => void buildPlan()} disabled={!hasTopics || planLoading} className="bg-black text-white border border-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] hover:bg-white hover:text-black transition-colors disabled:opacity-40">{planLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Building...</> : <>Build My Refresh Plan <ArrowRight className="w-3.5 h-3.5 inline ml-1" /></>}</button>
    </header>

    {error && <div className="border border-black bg-[#F8F7F2] p-4 text-xs">{error}</div>}
    {message && <div className="border border-black bg-[#F8F7F2] p-4 text-xs font-bold">{message}</div>}

    {!hasTopics ? <section className="border-2 border-dashed border-black/40 bg-[#F8F7F2] p-10 sm:p-16 text-center"><div className="font-serif text-4xl italic">Your first memory trace is waiting.</div><p className="text-sm text-black/60 max-w-lg mx-auto mt-4">Complete a study session with at least one minute of actual focus and your first memory trace will appear here. Scheduled topics do not enter Memory Atlas until a qualifying session is completed.</p></section> : <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px border border-black bg-black">
        {[['Studied topics', atlas.summary.studiedTopicCount], ['Stable', atlas.summary.stableCount], ['Approaching revision', atlas.summary.fadingCount], ['Due now', atlas.summary.dueCount]].map(([label, value]) => <div key={String(label)} className="bg-[#FDFDFC] p-5"><div className="text-[9px] uppercase tracking-[0.18em] font-bold text-black/50">{label}</div><div className="font-serif text-4xl italic mt-2">{value}</div></div>)}
      </section>

      <section className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">Forgetting landscape</div><h2 className="font-serif text-4xl sm:text-5xl italic mt-2">What fades next?</h2><p className="text-xs text-black/60 mt-2">See which studied concepts are approaching the revision threshold over the next 14 days. Curves are drawn from each topic&apos;s current predicted retention.</p></div>
          <label className="w-full max-w-md text-[10px] uppercase tracking-[0.18em] font-bold">Forecast: {forecastDays === 0 ? 'Today' : `+${forecastDays} days`}<input aria-label="Memory forecast days" type="range" min="0" max="14" value={forecastDays} onChange={(event) => setForecastDays(Number(event.target.value))} className="w-full mt-3 accent-black" /><div className="flex justify-between text-[9px] text-black/50 mt-1"><span>Today</span><span>+14 days</span></div></label>
        </div>

        <section>
          <div className="border-b border-black pb-3 mb-4 flex items-end justify-between"><div><div className="text-[9px] uppercase tracking-[0.2em] font-bold text-black/50">Memory now</div><h3 className="font-serif text-2xl italic mt-1">Current state, by urgency</h3></div><div className="text-[9px] uppercase tracking-[0.14em] text-black/45">Predicted retention</div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px border border-black bg-black">
            {nowTopics.map(({ topic, index }) => {
              const active = engaged && selectedTopic?.topicId === topic.topicId;
              return <button key={topic.topicId} type="button" aria-label={`Select ${topic.topicName}`} tabIndex={0}
                onMouseEnter={() => selectTopic(topic.topicId)} onFocus={() => selectTopic(topic.topicId)} onClick={() => selectTopic(topic.topicId)}
                className={`bg-[#FDFDFC] p-5 text-left ma-index-row ${active ? 'bg-[#F4F3EE]' : ''}`}>
                <div className="flex items-start justify-between gap-3"><span className="font-mono text-[10px] text-black/45">{pad(index)}</span><StatusMark status={topic.status} /></div>
                <div className="font-serif text-4xl italic mt-3 leading-none">{formatPercent(topic.predictedRetention)}</div>
                <div className="min-w-0 mt-3"><div className="text-[12px] font-bold leading-snug truncate">{topic.topicName}</div><div className="text-[9px] uppercase tracking-[0.12em] text-black/50 mt-1 truncate">{topic.courseName}</div></div>
              </button>;
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="min-w-[560px] w-full h-auto" role="img" aria-label="Forgetting landscape forecast showing which studied concepts approach the 50% revision threshold">
                {[1, 0.75, 0.5, 0.25, 0].map((value) => {
                  const y = yOfRetention(value);
                  const isThreshold = Math.abs(value - 0.5) < 0.001;
                  return <g key={value}>
                    <line x1={chartLeft} x2={chartWidth - chartRight} y1={y} y2={y} stroke={isThreshold ? '#1A1A1A' : 'rgba(0,0,0,0.08)'} strokeWidth={isThreshold ? 1.5 : 1} strokeDasharray={isThreshold ? '5 4' : '0'} />
                    <text x={chartLeft - 12} y={y + 3.5} textAnchor="end" fontSize="10" fill="#6B6B6B">{Math.round(value * 100)}%</text>
                  </g>;
                })}
                <text x={chartWidth - chartRight} y={thresholdY - 8} textAnchor="end" fontSize="8.5" fontWeight="700" letterSpacing="0.14em" fill="#1A1A1A">REVISION THRESHOLD</text>
                {xTicks.map((day) => <g key={day}>
                  <line x1={xOf(day)} x2={xOf(day)} y1={chartTop} y2={chartTop + plotHeight} stroke="rgba(0,0,0,0.05)" />
                  <text x={xOf(day)} y={chartTop + plotHeight + 20} textAnchor="middle" fontSize="9.5" fill="#6B6B6B">{day === 0 ? 'NOW' : `+${day}D`}</text>
                </g>)}
                {markLayout.map(({ topic, index, x, y }) => {
                  const active = engaged && selectedTopic?.topicId === topic.topicId;
                  const dimmed = selectedInChart && engaged && !active;
                  return <g key={`${topic.topicId}-${forecastDays}`} className="ma-fade cursor-pointer" tabIndex={0} role="button"
                    aria-label={`${pad(index)} ${topic.topicName}, ${formatPercent(topic.predictedRetention)} predicted retention`}
                    onMouseEnter={() => selectTopic(topic.topicId)} onFocus={() => selectTopic(topic.topicId)} onClick={() => selectTopic(topic.topicId)}
                    style={{ opacity: dimmed ? 0.18 : active ? 1 : 0.5 }}>
                    <path d={curvePath(topic)} className="ma-curve" fill="none" stroke={active ? '#000' : '#565656'} strokeWidth={active ? 2.5 : 1.2} style={{ opacity: 1 }} />
                    <path d={curvePath(topic)} fill="none" stroke="transparent" strokeWidth={16} className="cursor-pointer" />
                  </g>;
                })}
                {markLayout.map(({ topic, index, x, y }) => {
                  const active = engaged && selectedTopic?.topicId === topic.topicId;
                  const dimmed = selectedInChart && engaged && !active;
                  return <g key={`marker-${topic.topicId}-${forecastDays}`} className="ma-rise cursor-pointer"
                    onMouseEnter={() => selectTopic(topic.topicId)} onFocus={() => selectTopic(topic.topicId)} onClick={() => selectTopic(topic.topicId)}
                    style={{ opacity: dimmed ? 0.18 : active ? 1 : 0.6 }}>
                    <circle cx={x} cy={y} r={9} fill={active ? '#1A1A1A' : '#FDFDFC'} stroke={active ? '#1A1A1A' : '#555'} strokeWidth={1.25} />
                    <text x={x} y={y + 2.5} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={active ? '#FDFDFC' : '#333'}>{pad(index)}</text>
                  </g>;
                })}
                {crossings.map(({ topic, index, x, y }) => <g key={`cross-${topic.topicId}-${forecastDays}`} className="ma-fade">
                  <circle cx={x} cy={y} r={4.5} fill="#FDFDFC" stroke="#1A1A1A" strokeWidth={1.5} />
                  <text x={x} y={y - 11 - (index % 3) * 9} textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="0.12em" fill="#1A1A1A">DUE</text>
                </g>)}
              </svg>
            </div>

            <div className="mt-6">
              <div className="border-b border-black pb-3 mb-3"><div className="text-[9px] uppercase tracking-[0.2em] font-bold text-black/50">Study traces on the chart</div></div>
              <div className="border border-black divide-y divide-black/10">
                {chartTopics.map(({ topic, index }) => {
                  const active = engaged && selectedTopic?.topicId === topic.topicId;
                  return <button key={topic.topicId} type="button" tabIndex={0}
                    onMouseEnter={() => selectTopic(topic.topicId)} onFocus={() => selectTopic(topic.topicId)} onClick={() => selectTopic(topic.topicId)}
                    className={`w-full flex items-baseline gap-4 px-4 py-3 text-left ma-index-row ${engaged && selectedTopic?.topicId === topic.topicId ? 'bg-[#F4F3EE]' : ''}`}>
                    <span className="font-mono text-[10px] text-black/45">{pad(index)}</span>
                    <span className="flex-1 min-w-0"><strong className={`text-[13px] leading-tight block truncate ${active ? '' : 'opacity-70'}`}>{topic.topicName}</strong><span className="text-[9px] uppercase tracking-[0.12em] text-black/50 block mt-0.5 truncate">{topic.courseName}</span></span>
                    <span className={`font-serif text-xl italic ${active ? '' : 'opacity-70'}`}>{formatPercent(topic.predictedRetention)}</span>
                    <span className="hidden sm:inline-flex"><StatusMark status={topic.status} /></span>
                  </button>;
                })}
              </div>
            </div>
          </div>

          {selectedTopic && <aside className="border border-black bg-[#FDFDFC] p-6 sm:p-7" aria-live="polite">
            <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-black/50">Selected memory</div>
            <div className="flex items-baseline gap-3 mt-3"><span className="font-mono text-lg text-black/40">{selectedChartIndex ? pad(selectedChartIndex) : ''}</span><h3 className="font-serif text-3xl italic leading-tight">{selectedTopic.topicName}</h3></div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-black/55 mt-2">{selectedTopic.courseName}</p>
            <dl className="mt-5 space-y-3 border-t border-black/10 pt-5 text-xs">
              <div className="flex items-baseline justify-between gap-4"><dt className="text-black/55">Predicted retention</dt><dd className="font-serif text-lg italic">{formatPercent(selectedTopic.predictedRetention)}</dd></div>
              <div className="flex items-baseline justify-between gap-4"><dt className="text-black/55">Last studied</dt><dd className="text-right">{formatDateShort(selectedTopic.lastStudiedAt)}</dd></div>
              <div className="flex items-baseline justify-between gap-4"><dt className="text-black/55">Revision due</dt><dd className="text-right">{formatDateShort(selectedTopic.dueAt)}</dd></div>
              <div className="flex items-baseline justify-between gap-4"><dt className="text-black/55">Actual focus</dt><dd className="text-right">{formatDuration(selectedTopic.totalActualStudySeconds)}</dd></div>
            </dl>
            <button onClick={() => void buildPlan(selectedTopic.topicId)} disabled={planLoading} className="w-full mt-6 bg-black text-white border border-black px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] hover:bg-white hover:text-black transition-colors disabled:opacity-40">{planLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" />Building...</> : <>Schedule refresh <ArrowRight className="w-3.5 h-3.5 inline ml-1" /></>}</button>
          </aside>}
        </div>
      </section>

      <section className="space-y-5"><div><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">Subject memory overview</div><h2 className="font-serif text-4xl italic mt-2">Memory by course</h2></div><div className="grid grid-cols-1 md:grid-cols-2 gap-5">{atlas.courses.map((course) => <MemoryRing key={course.courseId} course={course} />)}</div></section>

      <section className="border border-black"><div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-black"><div><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">Topics due for revision</div><h2 className="font-serif text-4xl italic mt-2">Return with intention</h2></div><p className="text-xs text-black/60 max-w-sm">Topics are ordered by revision urgency. A refresh is always proposed before it reaches your calendar.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[9px] uppercase tracking-[0.16em] text-black/50 border-b border-black"><tr><th className="p-4 font-bold">#</th><th className="p-4 font-bold">Topic</th><th className="p-4 font-bold">Subject</th><th className="p-4 font-bold">Predicted retention</th><th className="p-4 font-bold">Last studied</th><th className="p-4 font-bold">Due</th><th className="p-4 font-bold">Action</th></tr></thead><tbody>{atlas.topics.map((topic, index) => <tr key={topic.topicId} className="border-b border-black/10 last:border-0"><td className="p-4 font-mono text-black/45">{String(index + 1).padStart(2, '0')}</td><td className="p-4"><strong>{topic.topicName}</strong><div className="text-[10px] text-black/55 mt-1">{statusLabel(topic.status)} | {topic.qualifyingSessionCount} qualifying sessions</div></td><td className="p-4 text-black/70">{topic.courseName}</td><td className="p-4 font-serif text-xl italic">{formatPercent(topic.predictedRetention)}</td><td className="p-4 text-black/70">{formatDate(topic.lastStudiedAt)}</td><td className="p-4 text-black/70">{topic.daysUntilDue <= 0 ? 'Now' : formatDate(topic.dueAt)}</td><td className="p-4"><button onClick={() => void buildPlan(topic.topicId)} disabled={planLoading} className="border border-black px-3 py-2 text-[9px] font-bold uppercase tracking-wider hover:bg-black hover:text-white">Schedule</button></td></tr>)}</tbody></table></div></section>

      {refreshPlan && <section className="border-2 border-black bg-[#F8F7F2] p-6 sm:p-8 space-y-6 animate-slide-up"><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-black pb-5"><div><div className="text-[10px] uppercase tracking-[0.2em] font-bold">Your Refresh Plan</div><h2 className="font-serif text-4xl italic mt-2">Small returns, safely placed.</h2></div><div className="font-serif text-3xl italic">{refreshPlan.totalMinutes} min</div></div>{refreshPlan.items.length === 0 ? <p className="text-sm text-black/65">{refreshPlan.message || 'No refresh sessions are needed right now.'}</p> : <><div className="space-y-3">{refreshPlan.items.map((item, index) => <div key={`${item.topicId}-${item.date}-${item.startTime}`} className="bg-white border border-black p-4 flex flex-col sm:flex-row sm:items-center gap-4"><span className="font-serif text-3xl italic">{String(index + 1).padStart(2, '0')}</span><div className="flex-1"><strong>{item.topicName}</strong><div className="text-[10px] uppercase tracking-wider text-black/55 mt-1">{item.courseName} | {item.reason}</div></div><div className="text-xs sm:text-right"><strong>{item.durationMinutes} min</strong><br /><span className="text-black/60">{formatSlot(item.date, item.startTime)}</span></div></div>)}</div><button onClick={() => void acceptPlan()} disabled={accepting} className="w-full bg-black text-white border border-black px-5 py-4 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black disabled:opacity-50">{accepting ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Adding safely...</> : <><CalendarPlus className="w-4 h-4 inline mr-2" />Add Refresh Plan To Calendar</>}</button></>}</section>}

      <section className="border-t border-black pt-6 flex gap-3 text-xs text-black/60"><Clock3 className="w-4 h-4 shrink-0 mt-0.5" /><p>Memory estimates use an Ebbinghaus-inspired exponential decay model based on your completed LazyLift study sessions. They are scheduling estimates, not measurements of actual recall.</p></section>
    </>}
  </div>;
};