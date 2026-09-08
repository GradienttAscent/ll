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
  Plus
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
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <aside className="w-72 border-r border-black p-6 sm:p-8 flex flex-col justify-between min-h-[calc(100vh-61px)] bg-[#FDFDFC] select-none">
      <div className="space-y-8">
        
        {/* Active Course & Exam Readiness Header */}
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

            {/* Deep Focus Widget embedded */}
            <div className="p-4 border border-black bg-[#F8F7F2] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-black/40">Deep Focus Engine</span>
                <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-serif italic text-lg leading-none text-black">Sanctuary Timer</div>
                  <div className="text-xs font-mono text-black/60 mt-1">{formatTime(focusTimerSeconds)} remaining</div>
                </div>
                <button
                  onClick={toggleTimer}
                  className="px-3 py-1 border border-black text-[10px] font-bold uppercase tracking-wider bg-white hover:bg-black hover:text-white transition-colors"
                >
                  {isTimerRunning ? 'Pause' : 'Resume'}
                </button>
              </div>
              {activeStudyBlock ? <div className="border-t border-black/20 pt-3 space-y-2"><div className="text-[9px] uppercase tracking-widest text-black/50">Studying now</div><div className="text-xs font-bold">{activeStudyBlock.title}</div><button onClick={onCompleteStudy} className="text-[9px] uppercase font-bold border-b border-black">Complete Study Block</button></div> : <div className="text-[10px] text-black/50">Select “Start Study” on a saved calendar block.</div>}
            </div>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/40 mb-3">
            Navigation
          </p>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'dashboard'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline &amp; Journal</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'upload'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Past Papers &amp; Topics</span>
          </button>

          <button
            onClick={() => setActiveTab('practice')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'practice'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>AI Practice Mode</span>
          </button>

          <button
            onClick={() => setActiveTab('mock')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'mock'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Timed Mock Exam</span>
          </button>

          <button
            onClick={() => setActiveTab('planner')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'planner'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Planner &amp; Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab('room')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'room'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Study Room (Peers)</span>
          </button>

          <button
            onClick={() => setActiveTab('lms')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors text-left ${
              activeTab === 'lms'
                ? 'bg-black text-white'
                : 'text-black/70 hover:bg-black/5 hover:text-black'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>LMS Sync (Canvas)</span>
          </button>
        </div>
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

