import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Wrench } from 'lucide-react';

interface AscentDevControlsProps {
  onTriggerComplete: () => Promise<void>;
  onTriggerMiss: () => Promise<void>;
  isLoading?: boolean;
}

export const AscentDevControls: React.FC<AscentDevControlsProps> = ({
  onTriggerComplete,
  onTriggerMiss,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full flex flex-col items-center justify-center pt-1">
      <div className="inline-flex items-center gap-2 border border-[#EDE7F3] dark:border-[#302B35] rounded-full px-3 py-1 bg-white dark:bg-[#17151A] shadow-2xs text-[10px] text-[#7B7484] dark:text-[#A9A3AE]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#1C1B1F] dark:hover:text-[#F5F3F7] transition"
        >
          <Wrench className="w-3 h-3 text-[#5E35B1] dark:text-[#8B5CF6]" />
          <span>Ascent Progression Controls</span>
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-2.5 p-3 rounded-2xl border border-[#D8CCE8] dark:border-[#3A3342] bg-[#FAF8FC] dark:bg-[#1D1A21] flex flex-wrap items-center justify-center gap-3 text-xs animate-fade-in shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#55524E] dark:text-[#A9A3AE]">
            Direct State Triggers:
          </span>

          <button
            onClick={() => void onTriggerComplete()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5E35B1] dark:bg-[#8B5CF6] hover:bg-[#461599] dark:hover:bg-[#7C3AED] text-white text-[11px] font-semibold transition active:scale-98 disabled:opacity-50 shadow-2xs"
            title="Complete scheduled commitment (Steps forward/upward on mountain)"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Complete commitment</span>
          </button>

          <button
            onClick={() => void onTriggerMiss()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D8CCE8] dark:border-[#3A3342] bg-white dark:bg-[#17151A] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 text-[#55524E] dark:text-[#A9A3AE] text-[11px] font-semibold transition active:scale-98 disabled:opacity-50"
            title="Miss scheduled commitment (Turns around and walks downward)"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Miss commitment</span>
          </button>
        </div>
      )}
    </div>
  );
};
