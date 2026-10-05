import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Bell, Calendar, Clock, CheckCircle2, ArrowRight, X } from 'lucide-react';
import { ActiveTab, AdaptiveProposal, ScheduleBlock } from '../types';

export interface NotificationItem {
  id: string;
  type: 'upcoming_session' | 'adaptive_proposal' | 'session_active' | 'streak_notice';
  title: string;
  description: string;
  timestamp: string;
  targetTab: ActiveTab;
  isRead: boolean;
}

interface NotificationsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  scheduleBlocks: ScheduleBlock[];
  adaptiveProposal: AdaptiveProposal | null;
  activeStudyBlock: ScheduleBlock | null;
  setActiveTab: (tab: ActiveTab) => void;
}

const READ_STORAGE_KEY = 'lazylift_read_notifications';

export const NotificationsPopover: React.FC<NotificationsPopoverProps> = ({
  isOpen,
  onClose,
  scheduleBlocks,
  adaptiveProposal,
  activeStudyBlock,
  setActiveTab,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(READ_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Close on Outside Click and Escape Key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Derive real notifications from active user state
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const todayStr = new Date(today.getTime() - offset).toISOString().slice(0, 10);

    // 1. Active study session in progress
    if (activeStudyBlock) {
      list.push({
        id: `active-${activeStudyBlock.id}`,
        type: 'session_active',
        title: 'Study session in progress',
        description: `Currently focusing on ${activeStudyBlock.title} (${activeStudyBlock.durationMinutes} min)`,
        timestamp: 'Now',
        targetTab: 'planner',
        isRead: readIds.includes(`active-${activeStudyBlock.id}`),
      });
    }

    // 2. Adaptive Proposal pending
    if (adaptiveProposal) {
      list.push({
        id: `adaptive-${adaptiveProposal.studySessionId}`,
        type: 'adaptive_proposal',
        title: 'Study plan update proposed',
        description: `Adaptive schedule adjustment suggested for "${adaptiveProposal.topicName}"`,
        timestamp: 'New',
        targetTab: 'planner',
        isRead: readIds.includes(`adaptive-${adaptiveProposal.studySessionId}`),
      });
    }

    // 3. Today's upcoming/scheduled study blocks
    const todayBlocks = scheduleBlocks
      .filter((b) => b.date === todayStr)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    const pendingToday = todayBlocks.filter((b) => !b.completed);
    pendingToday.forEach((block) => {
      list.push({
        id: `block-${block.id}-${block.date}`,
        type: 'upcoming_session',
        title: 'Upcoming study session',
        description: `${block.title} scheduled for ${block.startTime || 'today'} (${block.durationMinutes}m)`,
        timestamp: block.startTime || 'Today',
        targetTab: 'planner',
        isRead: readIds.includes(`block-${block.id}-${block.date}`),
      });
    });

    // 4. Overdue incomplete blocks from previous days (if any)
    const overdueBlocks = scheduleBlocks
      .filter((b) => b.date < todayStr && !b.completed)
      .slice(0, 2);

    overdueBlocks.forEach((block) => {
      list.push({
        id: `overdue-${block.id}`,
        type: 'upcoming_session',
        title: 'Uncompleted session',
        description: `${block.title} from ${block.date} is pending revision`,
        timestamp: block.date,
        targetTab: 'planner',
        isRead: readIds.includes(`overdue-${block.id}`),
      });
    });

    return list;
  }, [scheduleBlocks, adaptiveProposal, activeStudyBlock, readIds]);

  const markAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(allIds));
    } catch {
      // Ignore local storage write errors
    }
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!readIds.includes(item.id)) {
      const updated = [...readIds, item.id];
      setReadIds(updated);
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore local storage write errors
      }
    }
    setActiveTab(item.targetTab);
    onClose();
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl z-50 overflow-hidden animate-scale-in"
      role="dialog"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21]">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#6D28D9] dark:text-[#8B5CF6]" />
          <h3 className="font-serif text-lg italic text-[#17151A] dark:text-[#F5F3F7]">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-[#6D28D9] dark:bg-[#8B5CF6] text-white px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7] hover:bg-[#EDE7F6] dark:hover:bg-[#251E30] transition-colors"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-88 overflow-y-auto divide-y divide-[#EDE7F3] dark:divide-[#302B35]">
        {notifications.length === 0 ? (
          <div className="py-10 px-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-center mx-auto text-[#7B7484] dark:text-[#A9A3AE]">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="font-serif italic text-base text-[#17151A] dark:text-[#F5F3F7]">You&apos;re all caught up</p>
            <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE]">No pending session alerts or schedule changes right now.</p>
          </div>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleNotificationClick(item)}
              className={`p-4 transition-colors cursor-pointer flex items-start gap-3 hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] ${
                !item.isRead ? 'bg-[#FAF8FC]/60 dark:bg-[#1D1A21]/60' : 'bg-white dark:bg-[#17151A]'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {item.type === 'session_active' && (
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                )}
                {item.type === 'adaptive_proposal' && (
                  <div className="w-7 h-7 rounded-lg bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] border border-[#D8CCE8] dark:border-[#3E3846] flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                )}
                {item.type === 'upcoming_session' && (
                  <div className="w-7 h-7 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#6D28D9] dark:text-[#8B5CF6] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7] truncate">{item.title}</span>
                  <span className="text-[10px] font-mono text-[#7B7484] dark:text-[#A9A3AE] shrink-0">{item.timestamp}</span>
                </div>
                <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-0.5 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {!item.isRead && (
                <span className="w-2 h-2 rounded-full bg-[#6D28D9] dark:bg-[#8B5CF6] shrink-0 mt-1.5" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] text-center">
        <button
          onClick={() => {
            setActiveTab('planner');
            onClose();
          }}
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6D28D9] dark:text-[#8B5CF6] hover:text-[#5B21B6] dark:hover:text-[#A78BFA] inline-flex items-center gap-1"
        >
          <span>View Study Planner</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
