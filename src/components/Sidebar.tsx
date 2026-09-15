import React from 'react';
import { ActiveTab, ScheduleBlock } from '../types';
import { safeNumber } from '../utils/formatters';
import { 
  FileText, 
  Calendar, 
  Layers, 
  Clock, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Plus,
  Brain,
  History,
  LayoutDashboard,
  Play,
  Pause,
  CheckCircle2
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
}) => {
  const formatTime = (totalSeconds: number) => {
    const s = safeNumber(totalSeconds, 0);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const navGroups = [
    {
      title: 'ANALYTICS & INSIGHTS',
      items: [
        { id: 'dashboard', label: 'Progress Dashboard', icon: LayoutDashboard },
        { id: 'insights', label: 'Adaptive Insights', icon: Brain },
        { id: 'history', label: 'Sessions & Feedback', icon: History },
      ]
    },
    {
      title: 'STUDY EXECUTION',
      items: [
        { id: 'calendar', label: 'Weekly Calendar Grid', icon: Calendar },
        { id: 'session', label: 'Active Study Session', icon: Clock },
        { id: 'room', label: 'Study Room (Peers)', icon: Users },
      ]
    },
    {
      title: 'PRACTICE & REVISION',
      items: [
        { id: 'practice', label: 'AI Practice Mode', icon: BookOpen },
        { id: 'mock', label: 'Timed Mock Exam', icon: Layers },
        { id: 'upload', label: 'Past Papers & Topics', icon: FileText },
      ]
    },
    {
      title: 'PLANNING & SYNC',
      items: [
        { id: 'planner', label: 'Schedule Generator', icon: Calendar },
        { id: 'lms', label: 'LMS Sync (Canvas)', icon: GraduationCap },
      ]
    }
  ];

  return (
    <aside className="w-72 border-r border-black p-6 sm:p-8 flex flex-col justify-between min-h-[calc(100vh-61px)] bg-[#FDFDFC] select-none shrink-0">
      <div className="space-y-8">
        
        {/* Active Course & Readiness Header */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-2">Active Sanctuary Course</p>
          <h2 className="text-3xl font-serif italic mb-1 leading-none text-black">CS301: Algorithms</h2>
          <p className="text-xs text-black/60 mb-6 font-mono">Final Exam: August 24, 2026</p>

          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-[11px] font-bold mb-2 uppercase tracking-wider text-black">
                <span>Readiness Score</span>
                <span>74%</span>
              </div>
              <div className="h-1 w-full bg-black/10">
                <div className="h-full bg-black w-[74%]"></div>
              </div>
            </div>

            {/* Deep Focus Engine Card */}
            <div className="p-4 border border-black bg-[#F8F7F2] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-black/40">Deep Focus Engine</span>
                <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-black animate-pulse' : 'bg-black/30'}`} />
              </div>
              
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-serif italic text-lg leading-none text-black">Sanctuary Timer</div>
                  <div className="text-xs font-mono text-black/60 mt-1">{formatTime(focusTimerSeconds)}</div>
                </div>
                <button
                  onClick={toggleTimer}
                  className="px-3 py-1 border border-black text-[10px] font-bold uppercase tracking-wider bg-white hover:bg-black hover:text-white transition-colors"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
              </div>

              {activeStudyBlock ? (
                <div className="border-t border-black/20 pt-3 space-y-2">
                  <div className="text-[9px] uppercase tracking-widest text-black/50">Studying now</div>
                  <div className="text-xs font-bold text-black truncate">{activeStudyBlock.title}</div>
                  <button 
                    onClick={onCompleteStudy} 
                    className="text-[9px] uppercase font-bold border-b border-black text-black hover:text-violet-700 transition-colors"
                  >
                    Complete Study Block
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-black/50 border-t border-black/10 pt-2">
                  Select "Start Study" on a saved calendar block.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grouped Navigation */}
        <nav className="space-y-6">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-2 px-1">
                {group.title}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as ActiveTab)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
                      isActive
                        ? 'bg-black text-white'
                        : 'text-black/70 hover:bg-black/5 hover:text-black'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Upload CTA */}
      <div className="pt-6 border-t border-black space-y-3">
        <button
          onClick={onOpenUpload}
          className="w-full border border-black bg-white py-3 px-4 text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Documents</span>
        </button>

        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-black/40 px-1">
          <span>LazyLift v2.4</span>
          <span>Encrypted</span>
        </div>
      </div>
    </aside>
  );
};
