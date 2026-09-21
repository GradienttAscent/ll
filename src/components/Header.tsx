import React from 'react';
import { ActiveTab, UserAccount } from '../types';
import { Bell, LogOut, Settings, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  user: UserAccount;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, onOpenUpload, user, onLogout }) => {
  const identity = user.displayName || user.email;
  const initials = identity.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-30 bg-[#FDFDFC] border-b border-black px-6 py-3.5 transition-all">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-10">
          <div 
            onClick={() => setActiveTab('dashboard')} 
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-8 h-8 bg-black text-[#FDFDFC] flex items-center justify-center font-bold text-xs tracking-tighter uppercase">
              LL
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold tracking-tighter uppercase text-black font-sans">
                LazyLift
              </span>
              <span className="hidden sm:inline-block text-[9px] uppercase tracking-[0.2em] font-bold text-black/40">
                Academic
              </span>
            </div>
          </div>

          {/* Nav Tabs matching Editorial layout */}
          <nav className="hidden lg:flex items-center space-x-6 text-[11px] font-semibold uppercase tracking-widest text-black/50">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'dashboard'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Journal
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'upload'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Past Papers & AI Analysis
            </button>
            <button
              onClick={() => setActiveTab('planner')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'planner'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Planner
            </button>
            <button onClick={() => setActiveTab('calendar')} className={`py-1 transition-colors border-b ${activeTab === 'calendar' ? 'text-black border-black font-bold' : 'border-transparent text-black/40 hover:text-black'}`}>Calendar</button>
            <button onClick={() => setActiveTab('insights')} className={`py-1 transition-colors border-b ${activeTab === 'insights' ? 'text-black border-black font-bold' : 'border-transparent text-black/40 hover:text-black'}`}>Insights</button>
            <button onClick={() => setActiveTab('memory')} className={`py-1 transition-colors border-b ${activeTab === 'memory' ? 'text-black border-black font-bold' : 'border-transparent text-black/40 hover:text-black'}`}>Memory Atlas</button>
            <button onClick={() => setActiveTab('history')} className={`py-1 transition-colors border-b ${activeTab === 'history' ? 'text-black border-black font-bold' : 'border-transparent text-black/40 hover:text-black'}`}>History</button>
            <button
              onClick={() => setActiveTab('practice')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'practice'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Practice
            </button>
            <button
              onClick={() => setActiveTab('mock')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'mock'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Mock Exam
            </button>
            <button
              onClick={() => setActiveTab('room')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'room'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              Study Room
            </button>
            <button
              onClick={() => setActiveTab('lms')}
              className={`py-1 transition-colors border-b ${
                activeTab === 'lms'
                  ? 'text-black border-black font-bold'
                  : 'border-transparent text-black/40 hover:text-black'
              }`}
            >
              LMS Sync
            </button>
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={onOpenUpload}
            className="hidden sm:flex items-center space-x-2 border border-black bg-white hover:bg-black hover:text-white text-black px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>

          <button className="p-2 border border-black/20 hover:border-black text-black/60 hover:text-black transition-colors relative" title="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-black rounded-full"></span>
          </button>

          <button className="p-2 border border-black/20 hover:border-black text-black/60 hover:text-black transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile Avatar */}
          <div className="flex items-center space-x-2.5 pl-3 border-l border-black/20">
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-[10px] font-bold">
              {initials}
            </div>
            <div className="hidden lg:block text-left text-xs">
              <div className="font-bold text-black uppercase tracking-wider text-[11px]">{identity}</div>
              <div className="text-[9px] tracking-widest text-black/40">{user.email}</div>
            </div>
            <button onClick={onLogout} className="p-2 border border-black/20 hover:border-black text-black/60 hover:text-black transition-colors" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};

