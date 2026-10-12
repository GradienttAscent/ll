import React, { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, Circle, Loader2, Play, Send, ExternalLink } from 'lucide-react';
import { AdaptiveProposal, PersistedTopic, ScheduleBlock, SchedulingAssistantPreview } from '../types';
import { getPresentationViewerUrl } from './UploadExtractView';

interface PlannerViewProps {
  onStartStudy: (block: ScheduleBlock) => Promise<void>;
  refreshKey: number;
  academicRevision: number;
  adaptiveProposal: AdaptiveProposal | null;
  dismissedAdaptiveSessionId: string | null;
  adaptiveMessage: string;
  onAcceptAdaptiveProposal: (proposal: AdaptiveProposal) => Promise<void>;
  onRejectAdaptiveProposal: (proposal: AdaptiveProposal) => Promise<void>;
  onReconsiderAdaptiveProposal: (studySessionId: string) => Promise<void>;
  onCalendarChanged: () => void;
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

export const PlannerView: React.FC<PlannerViewProps> = ({ onStartStudy, refreshKey, academicRevision, adaptiveProposal, dismissedAdaptiveSessionId, adaptiveMessage, onAcceptAdaptiveProposal, onRejectAdaptiveProposal, onReconsiderAdaptiveProposal, onCalendarChanged }) => {
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
  const [schedulePreview, setSchedulePreview] = useState<any | null>(null);
  const [isApplyingProposal, setIsApplyingProposal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ id: 1, role: 'assistant', text: 'Ask about your schedule (\"What do I have next week?\"), or ask me to move, shorten, swap, cancel, or shift a whole day of future sessions. You can also add constraints like \"only on weekdays\" or \"keeping 90 minutes per day\".' }]);
  const [activeChatPreview, setActiveChatPreview] = useState<ActiveChatPreview | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const loadData = async () => {
    const [topicsResponse, blocksResponse] = await Promise.all([fetch('/api/topics/visible'), fetch('/api/schedule-blocks')]);
    const topicsJson = await topicsResponse.json();
    const blocksJson = await blocksResponse.json();
    if (topicsResponse.ok) {
      setTopics(topicsJson.topics as PersistedTopic[]);
    }
    if (blocksResponse.ok) setScheduleBlocks(blocksJson.scheduleBlocks);
  };

  useEffect(() => { void loadData(); }, [refreshKey, academicRevision]);

  const handleGenerateSchedule = async () => {
    if (topics.length === 0) {
      setStatusMessage('Upload academic material to generate a study plan.');
      return;
    }
    setIsGenerating(true);
    setStatusMessage('');
    try {
      if (!schedulePreview) {
        const settingsResponse = await fetch('/api/schedule/settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examDate, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '08:00', endTime: timeFromMinutes(8 * 60 + Math.max(30, Math.round(dailyHours * 60))) })) }),
        });
        const settingsData = await settingsResponse.json();
        if (!settingsResponse.ok) throw new Error(settingsData.error || 'Unable to save schedule settings.');
        const response = await fetch('/api/schedule/generate/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to generate schedule preview.');
        setSchedulePreview(data);
        const shortfall = Number(Object.values(data.proposal.unallocatedMinutesByTopic || {}).reduce((sum: number, value: any) => sum + Number(value), 0));
        setStatusMessage(`Preview ready: ${data.proposal.blocks.length} blocks, ${data.proposal.totalAvailableCapacity} minutes available${shortfall > 0 ? `, ${shortfall} minutes unallocated` : ''}. Review and confirm to save.`);
      } else {
        const response = await fetch('/api/schedule/generate/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposal: schedulePreview.proposal, proposalToken: schedulePreview.proposalToken }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to confirm schedule.');
        setScheduleBlocks(data.scheduleBlocks);
        setSchedulePreview(null);
        onCalendarChanged();
        setStatusMessage(`Schedule confirmed: ${data.scheduleBlocks.length} study blocks for ${examName}.`);
      }
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
      if (preview.changes.length > 0 || preview.scheduleProposal) setActiveChatPreview({ message, preview, selectedBlockId });
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, changes: preview.changes, scheduleProposal: preview.scheduleProposal, scheduleProposalToken: (preview as any).scheduleProposalToken, selectedBlockId }),
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
      onCalendarChanged();
      setActiveChatPreview(null);
      if (data.nextSession) {
        const next = data.nextSession;
        setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: `Marked complete. Your next session is ${next.topicName} on ${next.date} at ${next.startTime} for ${next.durationMinutes} minutes.` }]);
      } else if (preview.scheduleProposal) {
        setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: `Schedule saved: ${data.scheduleBlocks.length} study blocks are now on your calendar.` }]);
      } else {
        setChatMessages((messages) => [...messages, { id: Date.now(), role: 'assistant', text: 'Your calendar has been updated safely.' }]);
      }
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
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#EDE7F3] dark:border-[#302B35] pb-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            Study Planner
          </h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 max-w-xl font-sans">
            Schedules are dynamically calculated from topics extracted from your academic material.
          </p>
        </div>
        <button
          onClick={handleGenerateSchedule}
          disabled={isGenerating}
          className="rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-4 py-2.5 text-xs font-medium tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center gap-2 self-start md:self-auto"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white/80" />
              <span>Saving Schedule...</span>
            </>
          ) : (
            <>
              <CalendarCheck className="w-4 h-4 text-white" />
              <span>{schedulePreview ? 'Confirm Schedule' : 'Preview Schedule'}</span>
            </>
          )}
        </button>
        {schedulePreview && (
          <button
            onClick={() => setSchedulePreview(null)}
            className="rounded-lg border border-[#D8CCE8] dark:border-[#3E344A] px-4 py-2.5 text-xs font-medium text-[#55524E] dark:text-[#A9A3AE]"
          >
            Discard Preview
          </button>
        )}
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-[#D8CCE8] dark:border-[#3E344A] bg-[#EDE7F6] dark:bg-[#251E30] px-5 py-4 text-xs font-medium text-[#6D28D9] dark:text-[#A78BFA]">
          {statusMessage}
        </div>
      )}
      {schedulePreview?.proposal?.blocks?.length > 0 && (
        <div className="rounded-xl border border-[#D8CCE8] dark:border-[#3E344A] bg-white dark:bg-[#17151A] px-5 py-4 text-xs text-[#55524E] dark:text-[#A9A3AE]">
          <div className="font-semibold text-[#17151A] dark:text-[#F5F3F7]">Previewed study blocks</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {schedulePreview.proposal.blocks.map((block: any) => (
              <div key={`${block.date}-${block.startTime}-${block.topicId}`}>
                {block.date} · {block.startTime} · {block.durationMinutes} minutes · {block.title}
              </div>
            ))}
          </div>
        </div>
      )}
      {adaptiveMessage && !adaptiveProposal && (
        <div className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] px-5 py-4 text-xs font-medium text-[#55524E] dark:text-[#A9A3AE] flex flex-wrap items-center gap-3">
          <span>{adaptiveMessage}</span>
          {dismissedAdaptiveSessionId && (
            <button
              onClick={() => void onReconsiderAdaptiveProposal(dismissedAdaptiveSessionId)}
              className="rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] px-3 py-1.5 text-xs text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30]"
            >
              Generate another suggestion
            </button>
          )}
        </div>
      )}
      {adaptiveProposal && (
        <div className="rounded-2xl border border-[#6D28D9] dark:border-[#8B5CF6] bg-white dark:bg-[#17151A] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-xs">
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6D28D9] dark:text-[#A78BFA]">Revision suggested</div>
            <div className="font-serif text-2xl italic mt-1 text-[#17151A] dark:text-[#F5F3F7]">{adaptiveProposal.topicName}</div>
            <div className="text-xs text-[#7B7484] dark:text-[#7A7480] mt-1 font-mono">
              {formatDate(adaptiveProposal.proposedDate)} · {adaptiveProposal.proposedStartTime}-{adaptiveProposal.proposedEndTime} · {adaptiveProposal.proposedDurationMinutes} minutes
            </div>
            <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-2 font-sans">{adaptiveProposal.reason}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void applyAdaptiveProposal(true)}
              disabled={isApplyingProposal}
              className="rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-4 py-2 text-xs font-medium tracking-wider transition-colors disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => void applyAdaptiveProposal(false)}
              disabled={isApplyingProposal}
              className="rounded-lg bg-white dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border border-[#EDE7F3] dark:border-[#302B35] px-4 py-2 text-xs font-medium hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Target Exam Parameters */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-5 shadow-2xs">
            <h3 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">Target Exam Parameters</h3>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
              Course / Examination
              <input
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                className="mt-1.5 w-full rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
              Final Exam Date
              <input
                type="date"
                min={dateKey(new Date())}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
              Daily Available Hours: {dailyHours}
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(Number(e.target.value))}
                className="mt-2 w-full accent-[#6D28D9] dark:accent-[#8B5CF6]"
              />
            </label>
          </div>

        </div>

        {/* Center Column: Saved Calendar Blocks */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 sm:p-7 space-y-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
              <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">Saved Calendar Blocks</h3>
              <span className="text-[10px] font-mono font-medium text-[#6D28D9] dark:text-[#A78BFA] rounded-md bg-[#EDE7F6] dark:bg-[#251E30] px-2.5 py-1">
                {scheduleBlocks.filter((block) => block.completed).length}/{scheduleBlocks.length} completed
              </span>
            </div>

            {calendarDates.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#7A7480] py-4 font-sans">No saved study blocks yet. Upload academic material to generate a schedule.</p>
            ) : (
              calendarDates.map((date) => (
                <section key={date} className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] border-b border-[#EDE7F3] dark:border-[#302B35] pb-2 text-[#7B7484] dark:text-[#7A7480]">
                    {formatDate(date)}
                  </h4>
                  {(blocksByDate[date] || []).map((block) => (
                    <div
                      key={block.id}
                      className={`bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                        block.completed
                          ? 'border-[#EDE7F3] dark:border-[#302B35] opacity-60'
                          : pendingBlockIds.has(block.id)
                          ? 'border-2 border-dashed border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6]/30 dark:bg-[#251E30]/30'
                          : 'border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
                      }`}
                    >
                      <span title="Completion is recorded by the study session lifecycle">
                        {block.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-[#6D28D9]/40 dark:text-[#8B5CF6]/40" />
                        )}
                      </span>
                      <div className="flex-1">
                        <div className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">{block.title}</div>
                        <div className="text-xs text-[#7B7484] dark:text-[#7A7480] mt-1 font-mono">
                          {block.startTime} · {block.durationMinutes} minutes · {block.completed ? 'Completed' : pendingBlockIds.has(block.id) ? 'Pending reassignment' : 'Planned'}
                        </div>
                      </div>
                      <button
                        onClick={() => void onStartStudy(block).catch((error) => setStatusMessage(error.message))}
                        disabled={block.completed}
                        className="rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-3.5 py-1.5 text-xs font-medium tracking-wider transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-2xs self-start sm:self-auto"
                      >
                        <Play className="w-3.5 h-3.5 text-white/80" />
                        <span>Start Study</span>
                      </button>
                    </div>
                  ))}
                  {(ghostBlocksByDate[date] || []).map((block) => (
                    <div
                      key={block.id}
                      className="rounded-xl border-2 border-dashed border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6]/30 dark:bg-[#251E30]/30 p-4 flex items-center gap-4"
                    >
                      <div className="w-5 h-5 rounded-full border border-dashed border-[#6D28D9] dark:border-[#8B5CF6]" />
                      <div className="flex-1">
                        <div className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">{block.title}</div>
                        <div className="text-xs text-[#7B7484] dark:text-[#7A7480] mt-1 font-mono">
                          {block.startTime} · {block.durationMinutes} minutes · Proposed {block.topicName} session
                        </div>
                      </div>
                      <span className="rounded-md border border-[#D8CCE8] dark:border-[#3E344A] bg-white dark:bg-[#1D1A21] px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-[#6D28D9] dark:text-[#A78BFA]">
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
        <aside className="lg:col-span-3 bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-5 flex flex-col min-h-[34rem] shadow-2xs">
          <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
            <h3 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">Scheduling Assistant</h3>
            <p className="text-[10px] text-[#7B7484] dark:text-[#7A7480] mt-1 font-sans">Rearrange your study plan using natural language instructions.</p>
          </div>

          <div className="flex-1 space-y-3 py-4 overflow-y-auto max-h-[32rem]" aria-live="polite">
            {chatMessages.map((chat) => (
              <div
                key={chat.id}
                className={
                  chat.role === 'user'
                    ? 'ml-4 rounded-xl rounded-br-xs bg-[#6D28D9] dark:bg-[#8B5CF6] text-white p-3.5 text-xs shadow-2xs'
                    : 'mr-2 rounded-xl rounded-bl-xs bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[#17151A] dark:text-[#F5F3F7] p-3.5 text-xs'
                }
              >
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] mb-1 opacity-70">
                  {chat.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <p className="font-sans leading-relaxed">{chat.text}</p>
                {chat.preview?.sourceAction && (
                  <a
                    href={getPresentationViewerUrl({ mapped: true, documentId: chat.preview.sourceAction.documentId, exactSlide: chat.preview.sourceAction.exactSlide })}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#D8CCE8] dark:border-[#3E344A] bg-white dark:bg-[#17151A] px-3 py-2 text-[10px] font-medium text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open slide {chat.preview.sourceAction.exactSlide} — {chat.preview.sourceAction.topicName}</span>
                  </a>
                )}
                {chat.preview?.matches && (
                  <div className="mt-3 space-y-2">
                    {chat.preview.matches.map((match) => (
                      <button
                        key={match.blockId}
                        onClick={() => void requestChatPreview(chat.sourceMessage!, match.blockId, `Use ${match.topicName}: ${match.date} at ${match.startTime}`)}
                        disabled={isChatLoading}
                        className="w-full text-left rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] hover:border-[#D8CCE8] dark:hover:border-[#3E344A] px-3 py-2 text-[10px] transition-colors disabled:opacity-50 text-[#17151A] dark:text-[#F5F3F7]"
                      >
                        <strong>{match.topicName}</strong>
                        <br />
                        <span className="text-[#7B7484] dark:text-[#7A7480]">{formatDate(match.date)} · {match.startTime} · {match.durationMinutes} min</span>
                      </button>
                    ))}
                  </div>
                )}
                {chat.preview && (chat.preview.changes.length > 0 || chat.preview.scheduleProposal) && activeChatPreview?.message === chat.sourceMessage && activeChatPreview.selectedBlockId === chat.selectedBlockId && (
                  <div className="mt-3 border-t border-[#EDE7F3] dark:border-[#302B35] pt-3 space-y-2">
                    {chat.preview.scheduleProposal && (
                      <div className="text-[10px] text-[#55524E] dark:text-[#A9A3AE]">
                        <strong className="text-[#17151A] dark:text-[#F5F3F7]">
                          {chat.preview.scheduleProposal.blocks?.length ?? 0} study blocks
                        </strong>
                        <br />
                        {chat.preview.scheduleProposal.blocks?.reduce((sum: number, block: any) => sum + (block.durationMinutes || 0), 0) ?? 0} minutes across your availability
                      </div>
                    )}
                    {chat.preview.changes.map((change) => (
                      <div key={change.blockId} className="text-[10px] text-[#55524E] dark:text-[#A9A3AE]">
                        <strong className="text-[#17151A] dark:text-[#F5F3F7]">{change.topicName}</strong>
                        <br />
                        {change.original.date} {change.original.startTime} &rarr; {change.proposed.date} {change.proposed.startTime} ({change.proposed.durationMinutes} min)
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => void confirmChatPreview(chat.sourceMessage!, chat.preview!, chat.selectedBlockId)}
                        disabled={isChatLoading}
                        className="rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-3 py-1.5 text-xs font-medium tracking-wider disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => void cancelChatPreview()}
                        disabled={isChatLoading}
                        className="rounded-lg bg-white dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border border-[#EDE7F3] dark:border-[#302B35] px-3 py-1.5 text-xs font-medium hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] disabled:opacity-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isChatLoading && (
              <div className="mr-2 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] p-3 text-xs text-[#7B7484] dark:text-[#7A7480]">
                <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2 text-[#6D28D9] dark:text-[#8B5CF6]" />
                Checking your calendar...
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendChatMessage();
            }}
            className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 flex gap-2"
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="e.g. Move DBMS to tomorrow"
              className="min-w-0 flex-1 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-colors"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isChatLoading}
              className="rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-3.5 disabled:opacity-50 flex items-center justify-center transition-colors"
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

