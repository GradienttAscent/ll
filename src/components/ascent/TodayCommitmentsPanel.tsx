import React from 'react';
import { ScheduleBlock } from '../../types';
import { TodaySchedulePanel } from './TodaySchedulePanel';

interface TodayCommitmentsPanelProps {
  todayBlocks: ScheduleBlock[];
  onStartStudy?: (block: ScheduleBlock) => void;
  onCompleteCommitment: (block: ScheduleBlock, sourceRect: DOMRect) => void;
  onMissCommitment: (block: ScheduleBlock) => void;
  onAddTodayCommitment: (title: string, durationMinutes: number) => Promise<void>;
}

export const TodayCommitmentsPanel: React.FC<TodayCommitmentsPanelProps> = ({
  todayBlocks,
  onStartStudy,
  onCompleteCommitment,
  onMissCommitment,
  onAddTodayCommitment,
}) => {
  return (
    <TodaySchedulePanel
      todayBlocks={todayBlocks}
      onStartStudy={onStartStudy}
      onCompleteBlock={onCompleteCommitment}
      onMissBlock={onMissCommitment}
      onAddTodayBlock={onAddTodayCommitment}
    />
  );
};
