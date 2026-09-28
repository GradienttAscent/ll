import React, { useState, useEffect } from 'react';
import { X, Settings, User, Clock, Shield, Bell, Download, Check, LogOut, Moon } from 'lucide-react';
import { UserAccount } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  onLogout: () => void;
}

export interface UserPreferences {
  defaultDurationMinutes: number;
  shortBreakMinutes: number;
  audioChimeEnabled: boolean;
  autoFocusShield: boolean;
  academicTerm: string;
  targetDailyHours: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultDurationMinutes: 50,
  shortBreakMinutes: 10,
  audioChimeEnabled: true,
  autoFocusShield: true,
  academicTerm: 'Spring 2026',
  targetDailyHours: 3,
};

const PREFS_STORAGE_KEY = 'lazylift_user_preferences';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'study' | 'focus' | 'data'>('profile');
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const stored = localStorage.getItem(PREFS_STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [savedNotice, setSavedNotice] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(preferences));
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch {
      // Ignore storage write error
    }
  };

  const handleExportData = () => {
    const backup = {
      exportDate: new Date().toISOString(),
      user: { id: user.id, email: user.email, displayName: user.displayName },
      preferences,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lazylift_settings_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const durationOptions = [25, 45, 50, 60, 90];
  const breakOptions = [5, 10, 15];

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1B1F]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl border border-[#EDE7F3] shadow-2xl max-w-2xl w-full overflow-hidden relative animate-scale-in flex flex-col max-h-[90vh]"
        role="dialog"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#EDE7F3] bg-[#FAF8FC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#EDE7F3] text-[#5E35B1] flex items-center justify-center shadow-2xs">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-2xl italic text-[#1C1B1F]">Workspace Settings</h2>
              <p className="text-xs text-[#7B7484] font-sans">Customize your study timing, distraction shield, and preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#7B7484] hover:text-[#1C1B1F] hover:bg-[#EDE7F6] transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#EDE7F3] bg-white px-6 gap-6 text-xs font-bold uppercase tracking-wider">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'border-[#5E35B1] text-[#5E35B1]'
                : 'border-transparent text-[#7B7484] hover:text-[#1C1B1F]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('study')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'study'
                ? 'border-[#5E35B1] text-[#5E35B1]'
                : 'border-transparent text-[#7B7484] hover:text-[#1C1B1F]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Study &amp; Timer</span>
          </button>
          <button
            onClick={() => setActiveTab('focus')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'focus'
                ? 'border-[#5E35B1] text-[#5E35B1]'
                : 'border-transparent text-[#7B7484] hover:text-[#1C1B1F]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Focus Shield</span>
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'data'
                ? 'border-[#5E35B1] text-[#5E35B1]'
                : 'border-transparent text-[#7B7484] hover:text-[#1C1B1F]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Data &amp; Account</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-[#FAF8FC] rounded-2xl border border-[#EDE7F3] p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#EDE7F6] text-[#461599] border border-[#D8CCE8] flex items-center justify-center font-serif text-xl italic font-bold">
                  {(user.displayName || user.email)[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-serif text-xl italic text-[#1C1B1F]">{user.displayName || 'Student'}</h3>
                  <p className="text-xs text-[#7B7484] font-mono mt-0.5">{user.email}</p>
                  <span className="inline-block mt-2 text-[9px] uppercase tracking-wider font-bold bg-white text-[#461599] border border-[#D8CCE8] px-2 py-0.5 rounded">
                    Active Academic Account
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-2">
                    Academic Term / Semester
                  </label>
                  <input
                    type="text"
                    value={preferences.academicTerm}
                    onChange={(e) => setPreferences({ ...preferences, academicTerm: e.target.value })}
                    placeholder="e.g. Spring 2026"
                    className="w-full rounded-xl bg-white border border-[#EDE7F3] px-4 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-2">
                    Target Daily Study Goal (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={preferences.targetDailyHours}
                    onChange={(e) => setPreferences({ ...preferences, targetDailyHours: Number(e.target.value) || 3 })}
                    className="w-full rounded-xl bg-white border border-[#EDE7F3] px-4 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-sans"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STUDY & TIMER TAB */}
          {activeTab === 'study' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-3">
                  Default Study Session Duration
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {durationOptions.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, defaultDurationMinutes: mins })}
                      className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                        preferences.defaultDurationMinutes === mins
                          ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-2xs'
                          : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#7B7484] mt-2">Default duration applied when scheduling new study blocks.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] mb-3">
                  Short Break Duration
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {breakOptions.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, shortBreakMinutes: mins })}
                      className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                        preferences.shortBreakMinutes === mins
                          ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-2xs'
                          : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                      }`}
                    >
                      {mins} min break
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#EDE7F3]">
                <label className="flex items-center justify-between p-4 rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] cursor-pointer hover:border-[#D8CCE8] transition-colors">
                  <div>
                    <span className="text-xs font-bold text-[#1C1B1F] block">Audio Alerts on Completion</span>
                    <span className="text-[11px] text-[#7B7484] block mt-0.5">Play a subtle chime when study timer finishes</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.audioChimeEnabled}
                    onChange={(e) => setPreferences({ ...preferences, audioChimeEnabled: e.target.checked })}
                    className="w-4 h-4 rounded text-[#5E35B1] focus:ring-[#5E35B1] accent-[#5E35B1]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* FOCUS SHIELD TAB */}
          {activeTab === 'focus' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-[#FAF8FC] rounded-2xl border border-[#EDE7F3] p-5 space-y-2">
                <div className="flex items-center gap-2 text-[#5E35B1]">
                  <Shield className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Distraction Protection</span>
                </div>
                <p className="text-xs text-[#55524E] leading-relaxed">
                  Focus Shield guards your study time by prompting pause reflections whenever you navigate away or attempt to open distracting domains.
                </p>
              </div>

              <label className="flex items-center justify-between p-4 rounded-xl border border-[#EDE7F3] bg-[#FAF8FC] cursor-pointer hover:border-[#D8CCE8] transition-colors">
                <div>
                  <span className="text-xs font-bold text-[#1C1B1F] block">Enable Focus Shield on Timer Start</span>
                  <span className="text-[11px] text-[#7B7484] block mt-0.5">Automatically engage distraction rules when launching a focus block</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.autoFocusShield}
                  onChange={(e) => setPreferences({ ...preferences, autoFocusShield: e.target.checked })}
                  className="w-4 h-4 rounded text-[#5E35B1] focus:ring-[#5E35B1] accent-[#5E35B1]"
                />
              </label>
            </div>
          )}

          {/* DATA & ACCOUNT TAB */}
          {activeTab === 'data' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-2xl border border-[#EDE7F3] p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1C1B1F]">Export Workspace Data</h4>
                <p className="text-xs text-[#7B7484]">
                  Download a JSON backup of your current settings, preferences, and study metadata.
                </p>
                <button
                  type="button"
                  onClick={handleExportData}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#D8CCE8] bg-[#FAF8FC] hover:bg-[#EDE7F6] text-[#461599] text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Backup</span>
                </button>
              </div>

              <div className="bg-red-50/50 rounded-2xl border border-red-200 p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-900">Sign Out</h4>
                <p className="text-xs text-red-700">
                  End your current session on this device. Your data remains saved on your account.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-wider transition-colors shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#EDE7F3] bg-[#FAF8FC] flex items-center justify-between">
          <div>
            {savedNotice && (
              <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Preferences saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#EDE7F3] hover:border-[#D8CCE8] text-xs font-bold uppercase tracking-wider text-[#7B7484] hover:text-[#1C1B1F] transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-[#5E35B1] hover:bg-[#461599] text-white text-xs font-bold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
