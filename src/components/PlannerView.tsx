import React, { useEffect, useState } from 'react';
import { Calendar, CalendarCheck, CheckCircle2, Circle, Loader2, Play, Send } from 'lucide-react';
import { AdaptiveProposal, PersistedTopic, ScheduleBlock, SchedulingAssistantPreview } from '../types';

interface PlannerViewProps {
  onStartStudy: (block: ScheduleBlock) => Promise<void>;
  refreshKey: number;
  adaptiveProposal: AdaptiveProposal | null;
  dismissedAdaptiveSessionId: string | null;
  adaptiveMessage: string;
  onAcceptAdaptiveProposal: (proposal: AdaptiveProposal) => Promise<void>;
  onRejectAdaptiveProposal: (proposal: AdaptiveProposal) => Promise<void>;
  onReconsiderAdaptiveProposal: (studySessionId: string) => Promise<void>;
}

type PlannedBlock = Omit<ScheduleBlock, 'id' | 'topicName' | 'createdAt' | 'blockType'>;
type OccupiedBlock = Pick<ScheduleBlock, 'date' | 'startTime' | 'durationMinutes'>;
type ChatMessage = { id: number; role: 'user' | 'assistant'; text: string; preview?: SchedulingAssistantPreview; sourceMessage?: string; selectedBlockId?: string };
type ActiveChatPreview = { message: string; preview: SchedulingAssistantPreview; selectedBlockId?: string };
type GhostBlock = { id: string; title: string; topicName: string; date: string; startTime: string; durationMinutes: number };

const dateKey = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});

const startMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeFromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function overlaps(existing: OccupiedBlock, candidate: OccupiedBlock): boolean {
  if (existing.date !== candidate.date) return false;
  const existingStart = startMinutes(existing.startTime);
  const candidateStart = startMinutes(candidate.startTime);
  return existingStart < candidateStart + candidate.durationMinutes && candidateStart < existingStart + existing.durationMinutes;
}

function findPlannerSlot(
  occupied: OccupiedBlock[],
  startDate: Date,
  availableDays: number,
  dailyMinutes: number,
  durationMinutes: number,
): PlannedBlock | null {
  for (let dayIndex = 0; dayIndex < availableDays; dayIndex += 1) {
    const blockDate = new Date(startDate);
    blockDate.setDate(startDate.getDate() + dayIndex);
    const date = dateKey(blockDate);
    for (let minutes = 8 * 60; minutes + durationMinutes <= 8 * 60 + dailyMinutes; minutes += 30) {
      const candidate: OccupiedBlock = { date, startTime: timeFromMinutes(minutes), durationMinutes };
      if (!occupied.some((block) => overlaps(block, candidate))) {
        return { topicId: '', title: '', ...candidate, completed: false };
      }
    }
  }
  return null;
}

export function generateBlocks(
  topics: PersistedTopic[],
  examDate: string,
  dailyHours: number,
  existingBlocks: OccupiedBlock[] = [],
  currentDate = new Date(),
): PlannedBlock[] {
  const today = new Date(currentDate);
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
  const blocks: PlannedBlock[] = [];
  const occupied = [...existingBlocks];

  for (const { topic, score } of scoredTopics) {
    let remaining = Math.max(30, Math.round((score / scoreTotal) * totalMinutes));
    while (remaining > 0) {
      const durationMinutes = Math.min(remaining, 120);
      const slot = findPlannerSlot(occupied, today, availableDays, dailyMinutes, durationMinutes);
      if (!slot) break;
      const planned: PlannedBlock = {
        topicId: topic.id,
        title: `Study: ${topic.name}`,
        date: slot.date,
        startTime: slot.startTime,
        durationMinutes,
        completed: false,
      };
      blocks.push(planned);
      occupied.push(planned);
      remaining -= durationMinutes;
    }
  }
  return blocks;
}

export const PlannerView: React.FC<PlannerViewProps> = ({ onStartStudy, refreshKey, adaptiveProposal, dismissedAdaptiveSessionId, adaptiveMessage, onAcceptAdaptiveProposal, onRejectAdaptiveProposal, onReconsiderAdaptiveProposal }) => {
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
  const [isApplyingProposal, setIsApplyingProposal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 1, role: 'assistant', text: 'Ask about your schedule (\"What do I have next week?\"), or ask me to move, shorten, swap, cancel, or shift a whole day of future sessions. You can also add constraints like \"only on weekdays\" or \"keeping 90 minutes per day\".' }]);
  const [activeChatPreview, setActiveChatPreview] = useState<ActiveChatPreview | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const loadData = async () => {
    const [topicsResponse, blocksResponse, evidenceResponse] = await Promise.all([fetch('/api/topics'), fetch('/api/schedule-blocks'), fetch('/api/academic-evidence')]);
    const topicsJson = await topicsResponse.json();
    const blocksJson = await blocksResponse.json();
    const evidenceJson = await evidenceResponse.json();
    if (topicsResponse.ok) {
      const activeIds = new Set((evidenceJson.academic?.ranking || []).map((topic: any) => topic.id));
      setTopics(topicsJson.topics.filter((topic: PersistedTopic) => activeIds.has(topic.id)));
    }
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
      const newBlocks = generateBlocks(topics, examDate, dailyHours, scheduleBlocks);
      if (newBlocks.length === 0) {
        setStatusMessage('No available planner slots fit the current exam date and daily hours.');
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

  const applyAdaptiveProposal = async (accept: boolean) => {
    if (!adaptiveProposal) return;
    setIsApplyingProposal(true);
    setStatusMessage('');
    try {
      if (accept) {
        await onAcceptAdaptiveProposal(adaptiveProposal);
        setStatusMessage('Revision block added to your calendar.');
      } else {
        await onRejectAdaptiveProposal(adaptiveProposal);
        setStatusMessage('Revision suggestion dismissed.');
      }
    } catch (error: any) {
      setStatusMessage(error.message || 'Unable to update revision suggestion.');
    } finally {
      setIsApplyingProposal(false);
    }
  };

  const requestChatPreview = async (message: string, selectedBlockId?: string, displayMessage = message) => {
    if (isChatLoading) return;
    setIsChatLoading(true);
    setActiveChatPreview(null);
    setChatMessages((messages) => [...messages, { id: Date.now(), role: 'user', text: displayMessage }]);
    try {
      const response = await fetch('/api/scheduling-assistant/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, selectedBlockId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to understand that scheduling request.');
      const preview = data.preview as SchedulingAssistantPreview;
      if (preview.changes.length > 0) setActiveChatPreview({ message, preview, selectedBlockId });
      setChatMessages((messages) => [...messages, { id: Date.now() + 1, role: 'assistant', text: preview.assistantMessage, preview, sourceMessage: message, selectedBlockId }]);
    } catch (error: any) {
      setChatMessages((messages) => [...messages, { id: Date.now() + 1, role: 'assistant', text: error.message || 'Unable to answer that scheduling request.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || isChatLoading) return;
    setChatInput('');
    await requestChatPreview(message);
  };

  const confirmChatPreview = async (message: string, preview: SchedulingAssistantPreview, selectedBlockId?: string) => {
    setIsChatLoading(true);
    try {
      const response = await fetch('/api/scheduling-assistant/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, changes: preview.changes, selectedBlockId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setActiveChatPreview(null);
          throw new Error("Your schedule changed since this suggestion, so I couldn't apply those exact changes.");
        }
        throw new Error(data.error || 'Unable to confirm these changes.');
      }
      setScheduleBlocks(data.scheduleBlocks);
      setActiveChatPreview(null);
      setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: 'Your calendar has been updated safely.' }]);
    } catch (error: any) {
      setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: error.message || 'Unable to confirm these changes.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const cancelChatPreview = async () => {
    setActiveChatPreview(null);
    setIsChatLoading(true);
    try {
      const response = await fetch('/api/scheduling-assistant/cancel', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to cancel this suggestion.');
      setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: 'Okay, I left your schedule unchanged.' }]);
    } catch (error: any) {
      setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: error.message || 'Unable to cancel this suggestion.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const blocksByDate = scheduleBlocks.reduce<Record<string, ScheduleBlock[]>>((groups, block) => {
    (groups[block.date] ||= []).push(block);
    return groups;
  }, {});
  const pendingBlockIds = new Set(activeChatPreview?.preview.changes.map((change) => change.blockId) || []);
  const ghostBlocksByDate = (activeChatPreview?.preview.changes || []).reduce<Record<string, GhostBlock[]>>((groups, change) => {
    const ghost: GhostBlock = {
      id: `preview-${change.blockId}`,
      title: change.original.title,
      topicName: change.topicName,
      date: change.proposed.date,
      startTime: change.proposed.startTime,
      durationMinutes: change.proposed.durationMinutes,
    };
    (groups[ghost.date] ||= []).push(ghost);
    return groups;
  }, {});
  const calendarDates = Array.from(new Set([...Object.keys(blocksByDate), ...Object.keys(ghostBlocksByDate)])).sort();

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#EDE7F3] pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[10px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
            <Calendar className="w-3.5 h-3.5 text-[#5E35B1]" />
            <span>Persistent Study Calendar</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
            Day-Wise Personal Study Planner
          </h1>
          <p className="text-xs text-[#55524E] mt-2 max-w-xl">
            Schedules are dynamically calculated from your stored extracted topics, their priority, and declared weightage.
          </p>
        </div>
        <button
          onClick={handleGenerateSchedule}
          disabled={isGenerating}
          className="rounded-xl bg-[#5E35B1] hover:bg-[#461599] text-white px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow disabled:opacity-50 active:scale-98 flex items-center gap-2 self-start md:self-auto"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
              <span>Saving Schedule...</span>
            </>
          ) : (
            <>
              <CalendarCheck className="w-4 h-4 text-white" />
              <span>Generate &amp; Save Schedule</span>
            </>
          )}
        </button>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-[#D8CCE8] bg-[#EDE7F6]/60 px-5 py-4 text-xs font-bold text-[#461599]">
          {statusMessage}
        </div>
      )}
      {adaptiveMessage && !adaptiveProposal && (
        <div className="rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] px-5 py-4 text-xs font-bold text-[#55524E] flex flex-wrap items-center gap-3">
          <span>{adaptiveMessage}</span>
          {dismissedAdaptiveSessionId && (
            <button
              onClick={() => void onReconsiderAdaptiveProposal(dismissedAdaptiveSessionId)}
              className="rounded-lg border border-[#D8CCE8] bg-white px-3 py-1.5 text-[9px] uppercase tracking-wider text-[#461599] hover:bg-[#EDE7F6]"
            >
              Generate another suggestion
            </button>
          )}
        </div>
      )}
      {adaptiveProposal && (
        <div className="rounded-2xl border-2 border-[#5E35B1] bg-[#FDF8FE] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5E35B1]">Revision suggested</div>
            <div className="font-serif text-2xl italic mt-1 text-[#1C1B1F]">{adaptiveProposal.topicName}</div>
            <div className="text-xs text-[#7B7484] mt-1 font-mono">
              {formatDate(adaptiveProposal.proposedDate)} · {adaptiveProposal.proposedStartTime}-{adaptiveProposal.proposedEndTime} · {adaptiveProposal.proposedDurationMinutes} minutes
            </div>
            <p className="text-xs text-[#55524E] mt-2">{adaptiveProposal.reason}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void applyAdaptiveProposal(true)}
              disabled={isApplyingProposal}
              className="rounded-xl bg-[#5E35B1] text-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider hover:bg-[#461599] transition-all disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => void applyAdaptiveProposal(false)}
              disabled={isApplyingProposal}
              className="rounded-xl bg-white text-[#55524E] border border-[#EDE7F3] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider hover:border-[#D8CCE8] transition-all disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Target Exam Parameters */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-5 shadow-2xs">
            <h3 className="font-serif text-2xl italic text-[#1C1B1F]">Target Exam Parameters</h3>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
              Course / Examination
              <input
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] px-3.5 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
              Final Exam Date
              <input
                type="date"
                min={dateKey(new Date())}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] px-3.5 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
              Daily Available Hours: {dailyHours}
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(Number(e.target.value))}
                className="mt-2 w-full accent-[#5E35B1]"
              />
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-3 shadow-2xs">
            <h3 className="font-serif text-2xl italic text-[#1C1B1F]">Stored Topics ({topics.length})</h3>
            {topics.length === 0 ? (
              <p className="text-xs text-[#7B7484]">Analyze text on the Past Papers page to populate planning topics.</p>
            ) : (
              topics.map((topic) => (
                <div key={topic.id} className="bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-3 text-xs">
                  <strong className="text-[#1C1B1F]">{topic.name}</strong>
                  <div className="mt-1 text-[#7B7484]">
                    Priority {topic.priority}/10{topic.hasWeightage ? ` · Declared weightage ${topic.weightage}%` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Column: Saved Calendar Blocks */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-7 space-y-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
              <h3 className="font-serif text-3xl italic text-[#1C1B1F]">Saved Calendar Blocks</h3>
              <span className="text-[10px] font-mono font-bold text-[#461599] rounded-md bg-[#EDE7F6] px-2.5 py-1">
                {scheduleBlocks.filter((block) => block.completed).length}/{scheduleBlocks.length} completed
              </span>
            </div>

            {calendarDates.length === 0 ? (
              <p className="text-xs text-[#7B7484] py-4">No saved study blocks yet. Generate a schedule after storing topics.</p>
            ) : (
              calendarDates.map((date) => (
                <section key={date} className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] border-b border-[#EDE7F3] pb-2 text-[#7B7484]">
                    {formatDate(date)}
                  </h4>
                  {(blocksByDate[date] || []).map((block) => (
                    <div
                      key={block.id}
                      className={`bg-[#FAF8FC] rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                        block.completed
                          ? 'border-[#EDE7F3] opacity-60'
                          : pendingBlockIds.has(block.id)
                          ? 'border-2 border-dashed border-[#5E35B1] bg-[#EDE7F6]/30'
                          : 'border-[#EDE7F3] hover:border-[#D8CCE8]'
                      }`}
                    >
                      <span title="Completion is recorded by the study session lifecycle">
                        {block.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-[#5E35B1]/50" />
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="font-serif text-xl italic text-[#1C1B1F]">{block.title}</div>
                        <div className="text-xs text-[#7B7484] mt-1 font-mono">
                          {block.startTime} · {block.durationMinutes} minutes · {block.completed ? 'Completed' : pendingBlockIds.has(block.id) ? 'Pending reassignment' : 'Planned'}
                        </div>
                      </div>
                      <button
                        onClick={() => void onStartStudy(block).catch((error) => setStatusMessage(error.message))}
                        disabled={block.completed}
                        className="rounded-xl bg-[#5E35B1] text-white px-4 py-2 text-[10px] font-bold uppercase tracking-wider hover:bg-[#461599] transition-all disabled:opacity-40 flex items-center gap-1 shadow-2xs self-start sm:self-auto active:scale-98"
                      >
                        <Play className="w-3.5 h-3.5 text-[#CEB8FF]" />
                        <span>Start Study</span>
                      </button>
                    </div>
                  ))}
                  {(ghostBlocksByDate[date] || []).map((block) => (
                    <div
                      key={block.id}
                      className="rounded-xl border-2 border-dashed border-[#5E35B1] bg-[#EDE7F6]/30 p-4 flex items-center gap-4"
                    >
                      <div className="w-5 h-5 rounded-full border border-dashed border-[#5E35B1]" />
                      <div className="flex-1">
                        <div className="font-serif text-xl italic text-[#1C1B1F]">{block.title}</div>
                        <div className="text-xs text-[#7B7484] mt-1 font-mono">
                          {block.startTime} · {block.durationMinutes} minutes · Proposed {block.topicName} session
                        </div>
                      </div>
                      <span className="rounded-md border border-[#D8CCE8] bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#461599]">
                        Preview
                      </span>
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Conversational Scheduling Assistant */}
        <aside className="lg:col-span-3 bg-white rounded-2xl border border-[#EDE7F3] p-5 flex flex-col min-h-[34rem] shadow-2xs">
          <div className="border-b border-[#EDE7F3] pb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Conversational Planning</div>
            <h3 className="font-serif text-2xl italic mt-1 text-[#1C1B1F]">Scheduling Assistant</h3>
            <p className="text-[10px] text-[#7B7484] mt-1">I can help rearrange your study plan using natural language.</p>
          </div>

          <div className="flex-1 space-y-3 py-4 overflow-y-auto max-h-[32rem]" aria-live="polite">
            {chatMessages.map((chat) => (
              <div
                key={chat.id}
                className={
                  chat.role === 'user'
                    ? 'ml-4 rounded-2xl rounded-br-xs bg-[#5E35B1] text-white p-3.5 text-xs shadow-2xs'
                    : 'mr-2 rounded-2xl rounded-bl-xs bg-[#FAF8FC] border border-[#EDE7F3] text-[#1C1B1F] p-3.5 text-xs'
                }
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] mb-1 opacity-70">
                  {chat.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <p>{chat.text}</p>
                {chat.preview?.matches && (
                  <div className="mt-3 space-y-2">
                    {chat.preview.matches.map((match) => (
                      <button
                        key={match.blockId}
                        onClick={() => void requestChatPreview(chat.sourceMessage!, match.blockId, `Use ${match.topicName}: ${match.date} at ${match.startTime}`)}
                        disabled={isChatLoading}
                        className="w-full text-left rounded-xl border border-[#EDE7F3] bg-white hover:bg-[#EDE7F6] hover:border-[#D8CCE8] px-3 py-2 text-[10px] transition-colors disabled:opacity-50 text-[#1C1B1F]"
                      >
                        <strong>{match.topicName}</strong>
                        <br />
                        <span className="text-[#7B7484]">{formatDate(match.date)} · {match.startTime} · {match.durationMinutes} min</span>
                      </button>
                    ))}
                  </div>
                )}
                {chat.preview && chat.preview.changes.length > 0 && activeChatPreview?.message === chat.sourceMessage && activeChatPreview.selectedBlockId === chat.selectedBlockId && (
                  <div className="mt-3 border-t border-[#EDE7F3] pt-3 space-y-2">
                    {chat.preview.changes.map((change) => (
                      <div key={change.blockId} className="text-[10px] text-[#55524E]">
                        <strong className="text-[#1C1B1F]">{change.topicName}</strong>
                        <br />
                        {change.original.date} {change.original.startTime} &rarr; {change.proposed.date} {change.proposed.startTime} ({change.proposed.durationMinutes} min)
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => void confirmChatPreview(chat.sourceMessage!, chat.preview!, chat.selectedBlockId)}
                        disabled={isChatLoading}
                        className="rounded-lg bg-[#5E35B1] text-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider hover:bg-[#461599] disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => void cancelChatPreview()}
                        disabled={isChatLoading}
                        className="rounded-lg bg-white text-[#55524E] border border-[#EDE7F3] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider hover:border-[#D8CCE8] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isChatLoading && (
              <div className="mr-2 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] p-3 text-xs text-[#7B7484]">
                <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2 text-[#5E35B1]" />
                Checking your calendar...
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendChatMessage();
            }}
            className="border-t border-[#EDE7F3] pt-4 flex gap-2"
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="e.g. Move DBMS to tomorrow"
              className="min-w-0 flex-1 rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] px-3.5 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1]"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isChatLoading}
              className="rounded-xl bg-[#5E35B1] text-white px-3.5 hover:bg-[#461599] disabled:opacity-50 flex items-center justify-center transition-all"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
};

