import React from 'react';
import { ActiveTab, ScheduleBlock } from '../types';
import { 
  FileText, 
  Calendar, 
  Layers, 
  Clock, 
  BookOpen, 
  Plus,
  Brain,
  Shield
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  focusTimerSeconds: number;
  isTimerRunning: boolean;
  toggleTimer: () => void;
  activeStudyBlock: ScheduleBlock | null;
  onCompleteStudy: () => void;
  onStopStudy: () => void;
  sessionMessage: string;
  onOpenFocusMode?: () => void;
  activeFocusShieldCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenUpload,
  focusTimerSeconds,
  isTimerRunning,
  toggleTimer,
  activeStudyBlock,
  onCompleteStudy,
  onStopStudy,
  sessionMessage,
  onOpenFocusMode,
  activeFocusShieldCount = 0,
}) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const navItems: { tab: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { tab: 'dashboard', label: 'Timeline & Journal', icon: Clock },
    { tab: 'upload', label: 'Past Papers & Topics', icon: FileText },
    { tab: 'practice', label: 'AI Practice Mode', icon: BookOpen },
    { tab: 'mock', label: 'Timed Mock Exam', icon: Layers },
    { tab: 'planner', label: 'Planner & Calendar', icon: Calendar },
    { tab: 'calendar', label: 'Full Calendar', icon: Calendar },
    { tab: 'memory', label: 'Memory Atlas', icon: Brain },
  ];

  return (
    <aside className="w-68 border-r border-[#EDE7F3] dark:border-[#302B35] p-5 flex flex-col justify-between min-h-[calc(100vh-61px)] bg-[#FDFDFC] dark:bg-[#111013] select-none shrink-0 transition-colors">
      <div className="space-y-6">
        
        {/* Study controls */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#7B7484] dark:text-[#807A87] mb-1.5">Study controls</p>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-serif italic leading-none text-[#17151A] dark:text-[#F5F3F7]">Focus session</h2>
            {onOpenFocusMode && (
              <button
                onClick={onOpenFocusMode}
                className="p-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#4B4454] bg-white dark:bg-[#17151A] text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#6D28D9] dark:hover:text-[#8B5CF6] transition-all shadow-2xs"
                title="Configure Focus Mode & Distraction Shield"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Deep Focus Widget embedded */}
          <div className="p-3.5 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">Focus timer</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-[9px] font-mono font-medium text-[#7B7484] dark:text-[#A9A3AE]">{isTimerRunning ? 'LIVE' : 'STANDBY'}</span>
              </span>
            </div>
            
            <div className="flex items-baseline justify-between pt-0.5">
              <div>
                <div className="font-sans text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7]">Focus Timer</div>
                <div className="text-xs font-mono font-medium text-[#6D28D9] dark:text-[#8B5CF6] mt-1">{formatTime(focusTimerSeconds)} remaining</div>
              </div>
              <button
                onClick={toggleTimer}
                className="px-2.5 py-1 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] text-[10px] font-bold uppercase tracking-wider bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#17151A] dark:text-[#F5F3F7] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] hover:text-[#6D28D9] dark:hover:text-[#8B5CF6] transition-all shadow-2xs active:scale-96"
              >
                {isTimerRunning ? 'Pause' : 'Resume'}
              </button>
            </div>

            {/* Optional Focus Mode Distraction Shield pill */}
            {activeFocusShieldCount > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[10px]">
                <span className="flex items-center gap-1 text-[#6D28D9] dark:text-[#A78BFA] font-medium">
                  <Shield className="w-3 h-3 text-[#6D28D9] dark:text-[#8B5CF6]" /> Focus Shield Active
                </span>
                <span className="text-[#7B7484] dark:text-[#A9A3AE] font-mono text-[9px]">{activeFocusShieldCount} blocked</span>
              </div>
            )}

            {activeStudyBlock ? (
              <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-2.5 space-y-1.5">
                <div className="text-[9px] uppercase tracking-widest text-[#7B7484] dark:text-[#807A87]">Studying now</div>
                <div className="text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7] truncate">{activeStudyBlock.title}</div>
                <div className="flex gap-3 pt-0.5">
                  <button 
                    onClick={onCompleteStudy} 
                    className="text-[9px] uppercase font-bold text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
                  >
                    Complete Block
                  </button>
                  <button 
                    onClick={onStopStudy} 
                    className="text-[9px] uppercase font-bold text-[#7B7484] dark:text-[#A9A3AE] hover:text-red-600 dark:hover:text-red-400 hover:underline"
                  >
                    Stop Session
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#7B7484] dark:text-[#A9A3AE] leading-relaxed pt-1 border-t border-[#EDE7F3] dark:border-[#302B35]">
                Select “Start Study” on any saved calendar block.
              </div>
            )}

            {sessionMessage && (
              <div className="text-[10px] font-medium text-[#6D28D9] dark:text-[#A78BFA] bg-[#EDE7F6] dark:bg-[#251E30] p-2 rounded-lg">{sessionMessage}</div>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#7B7484] dark:text-[#807A87] mb-2 px-2">
            Navigation
          </p>

          <div className="space-y-0.5">
            {navItems.map(({ tab, label, icon: Icon }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs tracking-wide transition-all text-left ${
                    isActive
                      ? 'bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] font-semibold'
                      : 'text-[#55524E] dark:text-[#A9A3AE] hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] hover:text-[#17151A] dark:hover:text-[#F5F3F7] font-normal'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[#6D28D9] dark:text-[#8B5CF6]' : 'text-[#7B7484] dark:text-[#807A87]'}`} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Upload CTA */}
      <div className="pt-4 border-t border-[#EDE7F3] dark:border-[#302B35] space-y-2.5">
        <button
          onClick={onOpenUpload}
          className="w-full rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white py-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-all flex items-center justify-center space-x-1.5 shadow-2xs hover:shadow-xs active:scale-98"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Upload Documents</span>
        </button>

        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-[#7B7484] dark:text-[#807A87] px-1">
          <span>LazyLift</span>
          <span className="font-mono text-[9px]">v2.4</span>
        </div>
      </div>
    </aside>
  );
};
