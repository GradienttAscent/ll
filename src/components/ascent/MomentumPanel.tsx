import React from 'react';
import { AscentStage } from '../../types';
import { ASCENT_STAGES, STAGE_ORDER } from './ascentUtils';

interface MomentumPanelProps {
  momentumDays: number;
  weekCompleted: number;
  weekMissed: number;
  followThroughRate: number;
  stage: AscentStage;
  elevationMeters: number;
  progress: number;
}

export const MomentumPanel: React.FC<MomentumPanelProps> = ({
  momentumDays,
  weekCompleted,
  weekMissed,
  followThroughRate,
  stage,
  elevationMeters,
  progress,
}) => {
  const currentStageInfo = ASCENT_STAGES[stage];

  return (
    <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-2.5">
          <div>
            <h2 className="font-serif text-2xl italic font-normal text-[#1C1B1F] dark:text-[#F5F3F7]">
              Your Momentum
            </h2>
          </div>
        </div>

        {/* Big Metric: Follow-Through Consistency */}
        <div className="space-y-0.5">
          <div className="font-serif text-3xl sm:text-4xl italic font-normal text-[#1C1B1F] dark:text-[#F5F3F7]">
            {momentumDays} {momentumDays === 1 ? 'day' : 'days'}
          </div>
          <p className="text-[10.5px] text-[#7B7484] dark:text-[#A9A3AE] font-sans">
            Consistent scheduled study follow-through
          </p>
        </div>

        {/* 3 Real Data Metrics Grid */}
        <div className="space-y-2 text-xs font-sans">
          <div className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-between">
            <span className="text-[#55524E] dark:text-[#A9A3AE]">Completed this week</span>
            <span className="font-mono font-bold text-xs text-[#1C1B1F] dark:text-[#F5F3F7]">
              {weekCompleted} {weekCompleted === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-between">
            <span className="text-[#55524E] dark:text-[#A9A3AE]">Missed sessions</span>
            <span className={`font-mono font-bold text-xs ${weekMissed > 0 ? 'text-[#7B7484] dark:text-[#A9A3AE]' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {weekMissed} {weekMissed === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-between">
            <span className="text-[#55524E] dark:text-[#A9A3AE]">Follow-through rate</span>
            <span className="font-mono font-bold text-xs text-[#5E35B1] dark:text-[#8B5CF6]">
              {followThroughRate}%
            </span>
          </div>
        </div>

        {/* Progression Stage Bar (Continuous Ridge Elevation) */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-[#7B7484] dark:text-[#A9A3AE]">
            <span>Elevation: {elevationMeters}m</span>
            <span className="text-[#5E35B1] dark:text-[#8B5CF6]">{currentStageInfo.label}</span>
          </div>

          {/* 5-Stage Subtle Track */}
          <div className="w-full h-1.5 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] overflow-hidden flex">
            {STAGE_ORDER.map((stg) => {
              const info = ASCENT_STAGES[stg];
              const isPast = progress >= info.maxProgress;
              const isCurrent = stage === stg;

              return (
                <div
                  key={stg}
                  className={`flex-1 h-full transition-all duration-500 border-r border-white/60 dark:border-[#17151A]/60 last:border-r-0 ${
                    isPast
                      ? 'bg-[#5E35B1] dark:bg-[#8B5CF6]'
                      : isCurrent
                      ? 'bg-[#8B5CF6] dark:bg-[#A78BFA]'
                      : 'bg-transparent'
                  }`}
                  title={`${info.label} (${info.elevation})`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
