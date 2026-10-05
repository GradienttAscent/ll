import React, { useEffect, useRef, useState } from 'react';
import { AscentStage, AscentState, ScheduleBlock, UserAccount } from '../../types';
import { AscentLandscape } from './AscentLandscape';
import { TodaySchedulePanel } from './TodaySchedulePanel';
import { MomentumPanel } from './MomentumPanel';
import { AscentParticleOverlay, ParticleFlight } from './AscentParticleOverlay';
import { AscentDevControls } from './AscentDevControls';
import { ASCENT_STAGES, getElevationMeters, getStageFromProgress } from './ascentUtils';

interface AscentViewProps {
  user?: UserAccount | null;
  refreshKey: number;
  onRefreshGlobal?: () => void;
  onStartStudy?: (block: ScheduleBlock) => void;
}

export const AscentView: React.FC<AscentViewProps> = ({
  user,
  refreshKey,
  onRefreshGlobal,
  onStartStudy,
}) => {
  const [ascentData, setAscentData] = useState<AscentState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Figure screen coordinate for travelling light targeting
  const [figureScreenPos, setFigureScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [particleFlights, setParticleFlights] = useState<ParticleFlight[]>([]);
  const [isAbsorbingLight, setIsAbsorbingLight] = useState(false);
  const [statusBadgeText, setStatusBadgeText] = useState<string>('');
  const badgeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track previous stage and last action to generate proper stage change toasts
  const prevStageRef = useRef<AscentStage>('STARTING');
  const hadMissedRef = useRef(false);

  const showStatusMessage = (msg: string) => {
    setStatusBadgeText(msg);
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = setTimeout(() => {
      setStatusBadgeText('');
    }, 4500);
  };

  const fetchAscent = async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`/api/ascent?tzOffsetMinutes=${tzOffset}`);
      if (!res.ok) throw new Error('Unable to load ascent data.');
      const data = await res.json();
      if (data.ascent) {
        setAscentData(data.ascent);
        prevStageRef.current = data.ascent.stage;
        hadMissedRef.current = data.ascent.totalMissed > 0;
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load ascent data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAscent();
  }, [refreshKey]);

  // Handle task completion from Today's Commitments (with travelling light)
  const handleCompleteCommitment = async (block: ScheduleBlock, sourceRect: DOMRect) => {
    if (!ascentData) return;

    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;

    // Default target: either captured figure screen pos or fallback upper center
    const targetX = figureScreenPos ? figureScreenPos.x : window.innerWidth / 2;
    const targetY = figureScreenPos ? figureScreenPos.y : 300;

    const flightId = `flight-${Date.now()}`;

    // Add travelling light particle
    setParticleFlights((prev) => [
      ...prev,
      {
        id: flightId,
        startX,
        startY,
        targetX,
        targetY,
        onComplete: async () => {
          // Particle arrived at figure!
          setIsAbsorbingLight(true);
          setTimeout(() => setIsAbsorbingLight(false), 550);

          try {
            // Apply real state change via backend
            const patchRes = await fetch(`/api/schedule-blocks/${block.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: true }),
            });
            if (!patchRes.ok) throw new Error('Failed to complete commitment.');

            // Reload ascent state
            const tzOffset = new Date().getTimezoneOffset();
            const ascentRes = await fetch(`/api/ascent?tzOffsetMinutes=${tzOffset}`);
            const ascentJson = await ascentRes.json();
            const updatedAscent: AscentState = ascentJson.ascent;

            // Formulate message based on recovery or stage transition
            const oldStage = prevStageRef.current;
            const newStage = updatedAscent.stage;
            prevStageRef.current = newStage;

            if (hadMissedRef.current && updatedAscent.totalMissed === 0) {
              showStatusMessage('Back on the ascent.');
              hadMissedRef.current = false;
            } else if (oldStage !== newStage) {
              const oldLabel = ASCENT_STAGES[oldStage].label;
              const newLabel = ASCENT_STAGES[newStage].label;
              showStatusMessage(`${oldLabel} → ${newLabel}`);
            } else {
              showStatusMessage('Momentum maintained.');
            }

            setAscentData(updatedAscent);
            if (onRefreshGlobal) onRefreshGlobal();
          } catch (err: any) {
            showStatusMessage(err.message || 'Failed to update commitment.');
          }
        },
      },
    ]);
  };

  // Handle marking commitment missed
  const handleMissCommitment = async (block: ScheduleBlock) => {
    try {
      const patchRes = await fetch(`/api/schedule-blocks/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missed: true }),
      });
      if (!patchRes.ok) throw new Error('Failed to mark commitment missed.');

      hadMissedRef.current = true;

      const tzOffset = new Date().getTimezoneOffset();
      const ascentRes = await fetch(`/api/ascent?tzOffsetMinutes=${tzOffset}`);
      const ascentJson = await ascentRes.json();
      const updatedAscent: AscentState = ascentJson.ascent;

      showStatusMessage('Momentum cooled.');
      prevStageRef.current = updatedAscent.stage;
      setAscentData(updatedAscent);
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (err: any) {
      showStatusMessage(err.message || 'Failed to update commitment.');
    }
  };

  // Handle adding today commitment
  const handleAddTodayCommitment = async (title: string, durationMinutes: number) => {
    try {
      const today = new Date();
      const offset = today.getTimezoneOffset() * 60000;
      const todayKey = new Date(today.getTime() - offset).toISOString().slice(0, 10);

      // Find or create topic
      const topicsRes = await fetch('/api/topics');
      const topicsData = await topicsRes.json();
      let topicId = topicsData.topics?.[0]?.id;
      if (!topicId) {
        const createTopicRes = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Daily Focus', priority: 5, weightage: 10 }),
        });
        const createdTopicData = await createTopicRes.json();
        topicId = createdTopicData.topics[0].id;
      }

      const saveRes = await fetch('/api/schedule-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          title,
          date: todayKey,
          startTime: '11:00',
          durationMinutes,
          completed: false,
          blockType: 'study',
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to add today commitment.');

      await fetchAscent();
      if (onRefreshGlobal) onRefreshGlobal();
      showStatusMessage('Commitment scheduled for today.');
    } catch (err: any) {
      showStatusMessage(err.message || 'Unable to save commitment.');
    }
  };

  // Handle committing for tomorrow
  const handleCommitTomorrow = async (input: { title: string; startTime: string; durationMinutes: number }) => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch('/api/ascent/commit-tomorrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          tzOffsetMinutes: tzOffset,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit for tomorrow.');

      setAscentData(data.ascent);
      showStatusMessage('Tomorrow destination locked on ridge.');
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (err: any) {
      showStatusMessage(err.message || 'Unable to lock in tomorrow commitment.');
    }
  };

  // Prototype Controls Trigger: Complete Commitment
  const handleDevTriggerComplete = async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch('/api/ascent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', tzOffsetMinutes: tzOffset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed action');

      const oldStage = prevStageRef.current;
      const newStage = data.ascent.stage;
      prevStageRef.current = newStage;

      if (hadMissedRef.current && data.ascent.totalMissed === 0) {
        showStatusMessage('Back on the ascent.');
        hadMissedRef.current = false;
      } else if (oldStage !== newStage) {
        showStatusMessage(`${ASCENT_STAGES[oldStage].label} → ${ASCENT_STAGES[newStage].label}`);
      } else {
        showStatusMessage('Momentum maintained.');
      }

      setAscentData(data.ascent);
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (err: any) {
      showStatusMessage(err.message || 'Unable to complete commitment.');
    }
  };

  // Prototype Controls Trigger: Miss Commitment
  const handleDevTriggerMiss = async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch('/api/ascent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'miss', tzOffsetMinutes: tzOffset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed action');

      hadMissedRef.current = true;
      prevStageRef.current = data.ascent.stage;
      showStatusMessage('Momentum cooled.');
      setAscentData(data.ascent);
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (err: any) {
      showStatusMessage(err.message || 'Unable to record miss.');
    }
  };

  if (isLoading && !ascentData) {
    return (
      <div className="w-full py-12 text-center rounded-3xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A]">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-xs font-medium text-[#7B7484] dark:text-[#A9A3AE]">
          <span className="w-2 h-2 rounded-full bg-[#5E35B1] dark:bg-[#8B5CF6] animate-ping" />
          Loading your ascent path...
        </div>
      </div>
    );
  }

  const currentProgress = ascentData?.progress ?? 0.05;
  const currentStage = ascentData?.stage ?? 'STARTING';
  const currentElevation = ascentData?.elevationMeters ?? getElevationMeters(currentProgress);
  const todayBlocks = ascentData?.todayBlocks ?? [];
  const tomorrowCommitment = ascentData?.tomorrowCommitment ?? null;

  return (
    <section className="space-y-4 sm:space-y-5 w-full">
      {/* Travelling Light Particle Animation Overlay */}
      <AscentParticleOverlay flights={particleFlights} />

      {/* Hero Section Header: Pure Product & Data */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#1C1B1F] dark:text-[#F5F3F7] tracking-tight leading-none">
            Your Ascent
          </h1>
          <p className="text-xs font-mono font-medium text-[#5E35B1] dark:text-[#8B5CF6] mt-1.5 uppercase tracking-wider">
            {currentStage} &middot; {currentElevation}m
          </p>
        </div>

        <div className="text-xs font-mono font-medium text-[#7B7484] dark:text-[#A9A3AE] self-start sm:self-auto">
          Scheduled today: <strong className="text-[#1C1B1F] dark:text-[#F5F3F7]">{ascentData?.todayScheduledCount ?? todayBlocks.length}</strong> &middot; Completed: <strong className="text-[#6D28D9] dark:text-[#8B5CF6]">{ascentData?.todayCompletedCount ?? todayBlocks.filter((b) => b.completed).length}</strong> &middot; Missed: <strong className="text-[#B91C1C] dark:text-[#EF4444]">{ascentData?.todayMissedCount ?? todayBlocks.filter((b) => b.missed).length}</strong>
        </div>
      </div>

      {/* The Visual Centerpiece: Interactive Mountain-Ridge Landscape */}
      <AscentLandscape
        progress={currentProgress}
        stage={currentStage}
        elevationMeters={currentElevation}
        tomorrowCommitment={tomorrowCommitment}
        onFigurePosCalculated={setFigureScreenPos}
        isAbsorbingLight={isAbsorbingLight}
        statusBadgeText={statusBadgeText}
      />

      {/* Unified Action & Momentum Panels: Calendar-backed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        
        {/* Panel 1: Today's Scheduled Study (Spans 2 columns) */}
        <div className="lg:col-span-2">
          <TodaySchedulePanel
            todayBlocks={todayBlocks}
            onStartStudy={onStartStudy}
            onCompleteBlock={handleCompleteCommitment}
            onMissBlock={handleMissCommitment}
            onAddTodayBlock={handleAddTodayCommitment}
          />
        </div>

        {/* Panel 2: Momentum & Follow-Through Panel */}
        <div className="lg:col-span-1">
          <MomentumPanel
            momentumDays={ascentData?.momentumDays ?? 0}
            weekCompleted={ascentData?.weekCompleted ?? 0}
            weekMissed={ascentData?.weekMissed ?? 0}
            followThroughRate={ascentData?.followThroughRate ?? 100}
            stage={currentStage}
            elevationMeters={currentElevation}
            progress={currentProgress}
          />
        </div>

      </div>

      {/* Prototype / Verification Controls for Testing and Evaluation */}
      <AscentDevControls
        onTriggerComplete={handleDevTriggerComplete}
        onTriggerMiss={handleDevTriggerMiss}
        isLoading={isLoading}
      />
    </section>
  );
};
