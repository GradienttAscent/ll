import React from 'react';
import { ActiveTab, ScheduleBlock } from '../types';
import { 
  FileText, 
  Calendar, 
  Layers, 
  Clock, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Plus,
  ShieldCheck,
  Brain,
  History,
  LineChart,
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
    { tab: 'insights', label: 'Behavioral Insights', icon: LineChart },
    { tab: 'history', label: 'Session History', icon: History },
    { tab: 'room', label: 'Study Room (Peers)', icon: Users },
    { tab: 'lms', label: 'LMS Sync (Canvas)', icon: GraduationCap },
  ];

  return (
    <aside className="w-72 border-r border-[#EDE7F3] p-5 sm:p-6 flex flex-col justify-between min-h-[calc(100vh-61px)] bg-[#FAF8FC] select-none shrink-0">
      <div className="space-y-7">
        
        {/* Study controls */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] mb-1.5">Study controls</p>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-3xl font-serif italic leading-none text-[#1C1B1F]">Focus session</h2>
            {onOpenFocusMode && (
              <button
                onClick={onOpenFocusMode}
                className="p-1.5 rounded-lg border border-[#EDE7F3] hover:border-[#D8CCE8] bg-white text-[#7B7484] hover:text-[#5E35B1] transition-all shadow-2xs"
                title="Configure Focus Mode & Distraction Shield"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Deep Focus Widget embedded */}
          <div className="p-4 rounded-xl border border-[#EDE7F3] bg-white shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Deep Focus Engine</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-[9px] font-mono font-medium text-[#7B7484]">{isTimerRunning ? 'LIVE' : 'STANDBY'}</span>
              </span>
            </div>
            
            <div className="flex items-baseline justify-between pt-1">
              <div>
                <div className="font-serif italic text-lg leading-none text-[#1C1B1F]">Focus Timer</div>
                <div className="text-xs font-mono font-semibold text-[#5E35B1] mt-1.5">{formatTime(focusTimerSeconds)} remaining</div>
              </div>
              <button
                onClick={toggleTimer}
                className="px-3 py-1.5 rounded-lg border border-[#D8CCE8] text-[10px] font-bold uppercase tracking-wider bg-[#EDE7F6] text-[#461599] hover:bg-[#5E35B1] hover:text-white transition-all shadow-2xs active:scale-96"
              >
                {isTimerRunning ? 'Pause' : 'Resume'}
              </button>
            </div>

            {/* Optional Focus Mode Distraction Shield pill */}
            {activeFocusShieldCount > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#FAF8FC] border border-[#EDE7F3] text-[10px]">
                <span className="flex items-center gap-1 text-[#461599] font-medium">
                  <Shield className="w-3 h-3 text-[#5E35B1]" /> Focus Shield Active
                </span>
                <span className="text-[#7B7484] font-mono text-[9px]">{activeFocusShieldCount} blocked</span>
              </div>
            )}

            {activeStudyBlock ? (
              <div className="border-t border-[#EDE7F3] pt-3 space-y-2">
                <div className="text-[9px] uppercase tracking-widest text-[#7B7484]">Studying now</div>
                <div className="text-xs font-bold text-[#1C1B1F] truncate">{activeStudyBlock.title}</div>
                <div className="flex gap-3 pt-1">
                  <button 
                    onClick={onCompleteStudy} 
                    className="text-[9px] uppercase font-bold text-[#5E35B1] hover:underline"
                  >
                    Complete Block
                  </button>
                  <button 
                    onClick={onStopStudy} 
                    className="text-[9px] uppercase font-bold text-[#7B7484] hover:text-red-600 hover:underline"
                  >
                    Stop Session
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#7B7484] leading-relaxed pt-1 border-t border-[#EDE7F3]">
                Select “Start Study” on any saved calendar block.
              </div>
            )}

            {sessionMessage && (
              <div className="text-[10px] font-medium text-[#5E35B1] bg-[#EDE7F6] p-2 rounded-lg">{sessionMessage}</div>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] mb-2.5 px-2">
            Navigation
          </p>

          <div className="space-y-0.5">
            {navItems.map(({ tab, label, icon: Icon }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all text-left ${
                    isActive
                      ? 'bg-[#5E35B1] text-white shadow-xs font-bold'
                      : 'text-[#55524E] hover:bg-[#F1ECF7] hover:text-[#461599]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#CEB8FF]' : 'text-[#7B7484]'}`} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Upload CTA */}
      <div className="pt-5 border-t border-[#EDE7F3] space-y-3">
        <button
          onClick={onOpenUpload}
          className="w-full rounded-xl border border-[#D8CCE8] bg-white py-2.5 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#461599] hover:bg-[#EDE7F6] transition-all flex items-center justify-center space-x-2 shadow-2xs hover:shadow-xs active:scale-98"
        >
          <Plus className="w-3.5 h-3.5 text-[#5E35B1]" />
          <span>Upload Documents</span>
        </button>

        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-[#7B7484] px-1">
          <span>LazyLift v2.4</span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="w-3 h-3" /> Encrypted
          </span>
        </div>
      </div>
    </aside>
  );
};


