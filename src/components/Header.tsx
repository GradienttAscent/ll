import React, { useState } from 'react';
import { ActiveTab, AdaptiveProposal, ScheduleBlock, UserAccount } from '../types';
import { Bell, FileUp, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { LazyLiftLogo } from './LazyLiftLogo';
import { NotificationsPopover } from './NotificationsPopover';
import { SettingsModal } from './SettingsModal';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  user: UserAccount;
  onLogout: () => void;
  onOpenFocusMode?: () => void;
  activeFocusShieldCount?: number;
  scheduleBlocks?: ScheduleBlock[];
  adaptiveProposal?: AdaptiveProposal | null;
  activeStudyBlock?: ScheduleBlock | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenUpload,
  user,
  onLogout,
  onOpenFocusMode,
  activeFocusShieldCount = 0,
  scheduleBlocks = [],
  adaptiveProposal = null,
  activeStudyBlock = null,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const identity = user.displayName || user.email;
  const initials = identity.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const tabLabels: Record<ActiveTab, string> = {
    dashboard: 'Timeline & Journal',
    upload: 'Past Papers & Topics',
    planner: 'Planner & Calendar',
    calendar: 'Full Calendar',
    insights: 'Behavioral Insights',
    memory: 'Memory Atlas',
    history: 'Session History',
    practice: 'AI Practice Mode',
    mock: 'Timed Mock Exam',
    room: 'Study Room',
    session: 'Live Session',
  };

  // Check if there are unread notifications
  const todayStr = new Date().toISOString().slice(0, 10);
  const hasPendingItems = scheduleBlocks.some((b) => b.date === todayStr && !b.completed) || Boolean(adaptiveProposal) || Boolean(activeStudyBlock);

  return (
    <header className="sticky top-0 z-30 bg-[#FDFDFC]/95 dark:bg-[#111013]/95 backdrop-blur-md border-b border-[#EDE7F3] dark:border-[#302B35] px-6 py-3 transition-colors">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
        
        {/* Brand Logo & Contextual Page Indicator */}
        <div className="flex items-center space-x-6 sm:space-x-8">
          <div 
            onClick={() => setActiveTab('dashboard')} 
            className="cursor-pointer group transition-transform active:scale-98"
          >
            <LazyLiftLogo size="md" showWordmark showTagline={false} showBadge={false} />
          </div>

          {/* Contextual Page Location */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] text-[11px] font-medium text-[#55524E] dark:text-[#A9A3AE] shadow-2xs">
            <span className="text-[#7B7484] dark:text-[#807A87] uppercase tracking-wider text-[9px] font-bold">Workspace</span>
            <span className="text-[#D8CCE8] dark:text-[#4A4254]">/</span>
            <span className="font-semibold text-[#6D28D9] dark:text-[#A78BFA]">{tabLabels[activeTab] || 'Study Space'}</span>
          </div>

          {/* Quick Focus Mode Shield Status Badge */}
          {activeFocusShieldCount > 0 && (
            <button
              onClick={onOpenFocusMode}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3A3342] text-[10px] font-bold text-[#6D28D9] dark:text-[#A78BFA] hover:bg-[#D8CCE8] dark:hover:bg-[#30283E] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#6D28D9] dark:bg-[#8B5CF6]" />
              <span>Focus Shield Active ({activeFocusShieldCount})</span>
            </button>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-2">
          {onOpenFocusMode && (
            <button
              onClick={onOpenFocusMode}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#4B4454] bg-white dark:bg-[#17151A] text-[#461599] dark:text-[#A78BFA] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] text-[10px] font-bold uppercase tracking-wider transition-all shadow-2xs"
              title="Configure Focus Mode"
            >
              <span>Focus Mode</span>
            </button>
          )}

          <button 
            onClick={onOpenUpload}
            className="flex items-center space-x-2 bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white px-3.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98"
          >
            <FileUp className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Upload Document</span>
            <span className="sm:hidden">Upload</span>
          </button>

          {/* Theme Toggle Button (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#CEB8FF] dark:hover:border-[#4B4454] bg-white dark:bg-[#17151A] text-[#6B6575] dark:text-[#A9A3AE] hover:text-[#5E35B1] dark:hover:text-[#8B5CF6] transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Button & Popover */}
          <div className="relative">
            <button 
              onClick={() => setIsNotificationsOpen((prev) => !prev)}
              className={`p-2 rounded-lg border transition-colors relative ${
                isNotificationsOpen 
                  ? 'border-[#5E35B1] dark:border-[#8B5CF6] bg-[#EDE7F6] dark:bg-[#251E30] text-[#461599] dark:text-[#A78BFA]' 
                  : 'border-[#EDE7F3] dark:border-[#302B35] hover:border-[#CEB8FF] dark:hover:border-[#4B4454] bg-white dark:bg-[#17151A] text-[#6B6575] dark:text-[#A9A3AE] hover:text-[#461599] dark:hover:text-[#8B5CF6]'
              }`}
              title="Notifications"
              aria-expanded={isNotificationsOpen}
            >
              <Bell className="w-4 h-4" />
              {hasPendingItems && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#5E35B1] dark:bg-[#8B5CF6] rounded-full" />
              )}
            </button>

            <NotificationsPopover
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              scheduleBlocks={scheduleBlocks}
              adaptiveProposal={adaptiveProposal}
              activeStudyBlock={activeStudyBlock}
              setActiveTab={setActiveTab}
            />
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#CEB8FF] dark:hover:border-[#4B4454] bg-white dark:bg-[#17151A] text-[#6B6575] dark:text-[#A9A3AE] hover:text-[#461599] dark:hover:text-[#8B5CF6] transition-colors" 
            title="Workspace Settings"
            aria-label="Open Workspace Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Settings Modal */}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            user={user}
            onLogout={onLogout}
          />

          {/* User Profile Avatar */}
          <div className="flex items-center space-x-2.5 pl-2.5 border-l border-[#EDE7F3] dark:border-[#302B35]">
            <div className="w-8 h-8 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] text-[#461599] dark:text-[#A78BFA] border border-[#D8CCE8] dark:border-[#3A3342] flex items-center justify-center font-sans text-[11px] font-bold">
              {initials}
            </div>
            <div className="hidden xl:block text-left text-xs">
              <div className="font-bold text-[#1C1B1F] dark:text-[#F5F3F7] uppercase tracking-wider text-[11px] truncate max-w-[120px]">{identity}</div>
              <div className="text-[9px] tracking-wider text-[#7B7484] dark:text-[#A9A3AE] truncate max-w-[120px]">{user.email}</div>
            </div>
            <button 
              onClick={onLogout} 
              className="p-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-red-200 dark:hover:border-red-900 bg-white dark:bg-[#17151A] text-[#6B6575] dark:text-[#A9A3AE] hover:text-red-600 dark:hover:text-red-400 transition-colors" 
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
