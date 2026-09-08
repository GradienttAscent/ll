import React, { useEffect, useState } from 'react';
import { Calendar, Sparkles, CheckCircle2, Circle, Loader2, Play } from 'lucide-react';
import { PersistedTopic, ScheduleBlock } from '../types';

interface PlannerViewProps {
  onStartStudy: (block: ScheduleBlock) => Promise<void>;
  refreshKey: number;
}

type PlannedBlock = Omit<ScheduleBlock, 'id' | 'topicName' | 'createdAt'>;

const dateKey = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});

function generateBlocks(topics: PersistedTopic[], examDate: string, dailyHours: number): PlannedBlock[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${examDate}T00:00:00`);
  const availableDays = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86_400_000));
  const dailyMinutes = Math.max(30, Math.round(dailyHours * 60));
  const totalMinutes = availableDays * dailyMinutes;
  const maxPriority = Math.max(...topics.map((topic) => topic.priority), 1);
  const maxWeightage = Math.max(...topics.map((topic) => topic.weightage), 1);
  const scoredTopics = [...topics].sort((a, b) => b.priority - a.priority).map((topic) => ({
    topic,
    score: 0.7 * (topic.priority / maxPriority) + 0.3 * (topic.weightage / maxWeightage),
  }));
  const scoreTotal = scoredTopics.reduce((sum, item) => sum + item.score, 0);
  let dayIndex = 0;
  let minutesUsedToday = 0;
  const blocks: PlannedBlock[] = [];

  for (const { topic, score } of scoredTopics) {
    let remaining = Math.max(30, Math.round((score / scoreTotal) * totalMinutes));
    while (remaining > 0 && dayIndex < availableDays) {
      const availableToday = dailyMinutes - minutesUsedToday;
      const durationMinutes = Math.min(remaining, availableToday, 120);
      const blockDate = new Date(today);
      blockDate.setDate(today.getDate() + dayIndex);
      // Morning default keeps up to the UI's ten-hour availability range on the same date.
      const startMinutes = 8 * 60 + minutesUsedToday;
      blocks.push({
        topicId: topic.id,
        title: `Study: ${topic.name}`,
        date: dateKey(blockDate),
        startTime: `${String(Math.floor(startMinutes / 60) % 24).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`,
        durationMinutes,
        completed: false,
      });
      remaining -= durationMinutes;
      minutesUsedToday += durationMinutes;
      if (minutesUsedToday >= dailyMinutes) {
        dayIndex += 1;
        minutesUsedToday = 0;
      }
    }
  }
  return blocks;
}

export const PlannerView: React.FC<PlannerViewProps> = ({ onStartStudy, refreshKey }) => {
  const [examName, setExamName] = useState('Algorithms Final Examination');
  const [examDate, setExamDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return dateKey(date);
  });
  const [dailyHours, setDailyHours] = useState(4);
  const [topics, setTopics] = useState<PersistedTopic[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadData = async () => {
    const [topicsResponse, blocksResponse] = await Promise.all([fetch('/api/topics'), fetch('/api/schedule-blocks')]);
    const topicsJson = await topicsResponse.json();
    const blocksJson = await blocksResponse.json();
    if (topicsResponse.ok) setTopics(topicsJson.topics);
    if (blocksResponse.ok) setScheduleBlocks(blocksJson.scheduleBlocks);
  };

  useEffect(() => { void loadData(); }, [refreshKey]);

  const handleGenerateSchedule = async () => {
    if (topics.length === 0) {
      setStatusMessage('Add and analyze academic text first. No stored topics are available yet.');
      return;
    }
    setIsGenerating(true);
    setStatusMessage('');
    try {
      const planned = generateBlocks(topics, examDate, dailyHours);
      const existingKeys = new Set(scheduleBlocks.map((block) => `${block.topicId}|${block.date}|${block.startTime}`));
      const newBlocks = planned.filter((block) => !existingKeys.has(`${block.topicId}|${block.date}|${block.startTime}`));
      if (newBlocks.length === 0) {
        setStatusMessage('This schedule is already saved. Change the date or study hours to generate new blocks.');
        return;
      }
      const response = await fetch('/api/schedule-blocks/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleBlocks: newBlocks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save schedule.');
      setScheduleBlocks(data.scheduleBlocks);
      setStatusMessage(`Schedule generated and saved: ${newBlocks.length} study blocks for ${examName}.`);
    } catch (error: any) {
      setStatusMessage(error.message || 'Unable to generate schedule.');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleComplete = async (block: ScheduleBlock) => {
    const response = await fetch(`/api/schedule-blocks/${block.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !block.completed }),
    });
    const data = await response.json();
    if (response.ok) setScheduleBlocks(data.scheduleBlocks);
  };

  const blocksByDate = scheduleBlocks.reduce<Record<string, ScheduleBlock[]>>((groups, block) => {
    (groups[block.date] ||= []).push(block);
    return groups;
  }, {});

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2"><Calendar className="w-3.5 h-3.5" /><span>Persistent Study Calendar</span></div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">Day-Wise Personal Study Planner</h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl">Schedules are calculated from your stored extracted topics, their priority and weightage.</p>
        </div>
        <button onClick={handleGenerateSchedule} disabled={isGenerating} className="border border-black bg-black text-white hover:bg-white hover:text-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50">
          {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Saving Schedule...</> : <><Sparkles className="w-4 h-4 inline mr-2" />Generate & Save Schedule</>}
        </button>
      </div>

      {statusMessage && <div className="border border-black bg-[#F8F7F2] px-5 py-4 text-xs font-bold">{statusMessage}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-5">
            <h3 className="font-serif text-2xl italic">Target Exam Parameters</h3>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Course / Examination<input value={examName} onChange={(e) => setExamName(e.target.value)} className="mt-1.5 w-full bg-white border border-black/30 px-3 py-2 text-xs" /></label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Final Exam Date<input type="date" min={dateKey(new Date())} value={examDate} onChange={(e) => setExamDate(e.target.value)} className="mt-1.5 w-full bg-white border border-black/30 px-3 py-2 text-xs" /></label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Daily Available Hours: {dailyHours}<input type="range" min={1} max={10} step={0.5} value={dailyHours} onChange={(e) => setDailyHours(Number(e.target.value))} className="mt-2 w-full accent-black" /></label>
          </div>
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-3">
            <h3 className="font-serif text-2xl italic">Stored Topics ({topics.length})</h3>
            {topics.length === 0 ? <p className="text-xs text-black/60">Analyze text on the Past Papers page to populate planning topics.</p> : topics.map((topic) => <div key={topic.id} className="bg-white border border-black p-3 text-xs"><strong>{topic.name}</strong><div className="mt-1 text-black/60">Priority {topic.priority}/10 · Weightage {topic.weightage}%</div></div>)}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-black pb-4"><h3 className="font-serif text-3xl italic">Saved Calendar Blocks</h3><span className="text-[10px] font-mono font-bold">{scheduleBlocks.filter((block) => block.completed).length}/{scheduleBlocks.length} completed</span></div>
            {Object.keys(blocksByDate).length === 0 ? <p className="text-xs text-black/60">No saved study blocks yet. Generate a schedule after storing topics.</p> : (Object.entries(blocksByDate) as Array<[string, ScheduleBlock[]]>).map(([date, blocks]) => <section key={date} className="space-y-3"><h4 className="text-[10px] font-bold uppercase tracking-[0.2em] border-b border-black/20 pb-2">{formatDate(date)}</h4>{blocks.map((block) => <div key={block.id} className={`bg-white border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${block.completed ? 'border-black/20 opacity-60' : 'border-black'}`}><button onClick={() => void toggleComplete(block)}>{block.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5 text-black/40" />}</button><div className="flex-1"><div className="font-serif text-xl italic">{block.title}</div><div className="text-xs text-black/60 mt-1">{block.startTime} · {block.durationMinutes} minutes · {block.completed ? 'Completed' : 'Planned'}</div></div><button onClick={() => void onStartStudy(block).catch((error) => setStatusMessage(error.message))} disabled={block.completed} className="bg-black text-white border border-black px-4 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-white hover:text-black disabled:opacity-40"><Play className="w-3.5 h-3.5 inline mr-1" />Start Study</button></div>)}</section>)}
          </div>
        </div>
      </div>
    </div>
  );
};
