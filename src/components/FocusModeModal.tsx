import React, { useState } from 'react';
import { Shield, X, Check, Laptop, Smartphone, AlertCircle, Play } from 'lucide-react';

export interface DistractionTarget {
  id: string;
  name: string;
  category: 'social' | 'video' | 'chat' | 'entertainment' | 'custom';
  domain: string;
}

export const COMMON_DISTRACTIONS: DistractionTarget[] = [
  { id: 'youtube', name: 'YouTube', category: 'video', domain: 'youtube.com' },
  { id: 'whatsapp', name: 'WhatsApp', category: 'chat', domain: 'web.whatsapp.com' },
  { id: 'instagram', name: 'Instagram', category: 'social', domain: 'instagram.com' },
  { id: 'reddit', name: 'Reddit', category: 'social', domain: 'reddit.com' },
  { id: 'twitter', name: 'X / Twitter', category: 'social', domain: 'x.com' },
  { id: 'netflix', name: 'Netflix', category: 'entertainment', domain: 'netflix.com' },
];

export interface FocusModeConfig {
  durationMinutes: number;
  blockedDistractions: string[];
  blockWebsites: boolean;
  blockApps: boolean;
}

interface FocusModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartFocus: (config: FocusModeConfig) => void;
  initialMinutes?: number;
  taskTitle?: string;
}

export const FocusModeModal: React.FC<FocusModeModalProps> = ({
  isOpen,
  onClose,
  onStartFocus,
  initialMinutes = 50,
  taskTitle,
}) => {
  const [duration, setDuration] = useState<number>(initialMinutes);
  const [customDuration, setCustomDuration] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [selectedDistractions, setSelectedDistractions] = useState<string[]>([
    'youtube',
    'whatsapp',
    'instagram',
  ]);
  const [blockWebsites, setBlockWebsites] = useState(true);
  const [blockApps, setBlockApps] = useState(false);
  const [customSiteInput, setCustomSiteInput] = useState('');
  const [customList, setCustomList] = useState<DistractionTarget[]>([]);
  const [activeServerSession, setActiveServerSession] = useState<any>(null);
  const [isStopping, setIsStopping] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetch('/api/focus-mode/active')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && data.activeSession) {
          setActiveServerSession(data.activeSession);
        } else {
          setActiveServerSession(null);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const presetDurations = [25, 50, 90];

  const toggleDistraction = (id: string) => {
    setSelectedDistractions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customSiteInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!trimmed) return;
    const newId = `custom-${Date.now()}`;
    const newTarget: DistractionTarget = {
      id: newId,
      name: trimmed,
      category: 'custom',
      domain: trimmed,
    };
    setCustomList((prev) => [...prev, newTarget]);
    setSelectedDistractions((prev) => [...prev, newId]);
    setCustomSiteInput('');
  };

  const handleStopActiveSession = async () => {
    setIsStopping(true);
    try {
      await fetch('/api/focus-mode/stop', { method: 'POST' });
      setActiveServerSession(null);
      onClose();
    } catch (err) {
      console.error('Failed to stop focus session:', err);
    } finally {
      setIsStopping(false);
    }
  };

  const handleStart = async () => {
    const finalDuration = isCustom && customDuration ? parseInt(customDuration, 10) || 50 : duration;
    const allTargets = [...COMMON_DISTRACTIONS, ...customList];
    const targetDomains = allTargets
      .filter((t) => selectedDistractions.includes(t.id))
      .map((t) => t.domain);

    try {
      await fetch('/api/focus-mode/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationMinutes: Math.max(5, Math.min(240, finalDuration)),
          taskTitle: taskTitle || undefined,
          domains: targetDomains,
        }),
      });
    } catch (err) {
      console.error('Failed to register active focus session:', err);
    }

    onStartFocus({
      durationMinutes: Math.max(5, Math.min(240, finalDuration)),
      blockedDistractions: selectedDistractions,
      blockWebsites,
      blockApps,
    });
    onClose();
  };

  const allTargets = [...COMMON_DISTRACTIONS, ...customList];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E3846] text-[9px] uppercase tracking-[0.2em] font-bold text-[#6D28D9] dark:text-[#8B5CF6] mb-3">
            <Shield className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" /> Focus Mode &bull; Distraction Guard
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl italic text-[#17151A] dark:text-[#F5F3F7] leading-tight">
            Configure Focus Mode
          </h2>
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] font-sans mt-1.5">
            {taskTitle ? (
              <span>Locked into: <strong className="text-[#6D28D9] dark:text-[#8B5CF6] font-semibold">{taskTitle}</strong></span>
            ) : (
              'Shield your study block from cognitive leaks, social loops, and tab drift.'
            )}
          </p>
        </div>

        {activeServerSession && (
          <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50 dark:bg-purple-950/20 text-xs space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Focus Session Active (Ends {new Date(activeServerSession.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </span>
              <button
                onClick={handleStopActiveSession}
                disabled={isStopping}
                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] uppercase tracking-wider transition"
              >
                {isStopping ? 'Stopping...' : 'Stop Focus'}
              </button>
            </div>
            <div className="text-[11px] text-purple-800 dark:text-purple-300">
              Actively shielded: {activeServerSession.blockedDomains?.join(', ') || 'Default blocklist'}
            </div>
          </div>
        )}

        {/* Duration Configuration */}
        <div className="space-y-2.5">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Focus Duration
          </label>
          <div className="grid grid-cols-4 gap-2.5">
            {presetDurations.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setDuration(m);
                  setIsCustom(false);
                }}
                className={`py-3 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                  !isCustom && duration === m
                    ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-transparent shadow-xs'
                    : 'bg-[#FAF8FC] dark:bg-[#1D1A21] border-[#EDE7F3] dark:border-[#302B35] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846] hover:text-[#17151A] dark:hover:text-[#F5F3F7]'
                }`}
              >
                {m} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={`py-3 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                isCustom
                  ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-transparent shadow-xs'
                  : 'bg-[#FAF8FC] dark:bg-[#1D1A21] border-[#EDE7F3] dark:border-[#302B35] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846] hover:text-[#17151A] dark:hover:text-[#F5F3F7]'
              }`}
            >
              Custom
            </button>
          </div>

          {isCustom && (
            <div className="pt-2 flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="240"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                placeholder="Minutes (e.g. 45)"
                className="w-full bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs font-mono text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]"
              />
              <span className="text-xs text-[#7B7484] dark:text-[#A9A3AE] whitespace-nowrap">minutes</span>
            </div>
          )}
        </div>

        {/* Distraction Selection */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
              Monitored Distractions ({selectedDistractions.length} active)
            </label>
            <button
              type="button"
              onClick={() => {
                if (selectedDistractions.length === allTargets.length) {
                  setSelectedDistractions([]);
                } else {
                  setSelectedDistractions(allTargets.map((t) => t.id));
                }
              }}
              className="text-[9px] uppercase tracking-wider font-semibold text-[#6D28D9] dark:text-[#8B5CF6] hover:underline"
            >
              {selectedDistractions.length === allTargets.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {allTargets.map((item) => {
              const isChecked = selectedDistractions.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleDistraction(item.id)}
                  className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all shadow-2xs ${
                    isChecked
                      ? 'bg-[#EDE7F6] dark:bg-[#251E30] border-[#D8CCE8] dark:border-[#3E3846] text-[#6D28D9] dark:text-[#8B5CF6] font-semibold'
                      : 'bg-[#FAF8FC] dark:bg-[#1D1A21] border-[#EDE7F3] dark:border-[#302B35] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846]'
                  }`}
                >
                  <span className="text-xs truncate">{item.name}</span>
                  <div
                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                      isChecked
                        ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] border-transparent text-white'
                        : 'border-[#D8CCE8] dark:border-[#3E3846] bg-white dark:bg-[#17151A]'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Add custom distraction */}
          <form onSubmit={handleAddCustom} className="pt-1 flex items-center gap-2">
            <input
              type="text"
              value={customSiteInput}
              onChange={(e) => setCustomSiteInput(e.target.value)}
              placeholder="Add other site/app (e.g. twitch.tv)..."
              className="flex-1 bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6]"
            />
            <button
              type="submit"
              disabled={!customSiteInput.trim()}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E3846] text-[10px] font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6] disabled:opacity-40 transition-colors"
            >
              + Add
            </button>
          </form>
        </div>

        {/* Technical Architecture Distinctions (No fake system blocking) */}
        <div className="space-y-3 pt-2 border-t border-[#EDE7F3] dark:border-[#302B35]">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Enforcement Layer
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] cursor-pointer hover:border-[#D8CCE8] dark:hover:border-[#3E3846]">
              <input
                type="checkbox"
                checked={blockWebsites}
                onChange={(e) => setBlockWebsites(e.target.checked)}
                className="mt-0.5 rounded text-[#6D28D9] dark:text-[#8B5CF6] focus:ring-[#6D28D9] accent-[#6D28D9] dark:accent-[#8B5CF6]"
              />
              <div className="text-xs">
                <div className="font-semibold text-[#17151A] dark:text-[#F5F3F7] flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
                  <span>Tab &amp; In-App Distraction Shield</span>
                </div>
                <div className="text-[11px] text-[#7B7484] dark:text-[#A9A3AE] mt-0.5">
                  Tracks active tab blur, interrupts navigational wanderlust, and logs focus drops in your reflection history.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] cursor-pointer hover:border-[#D8CCE8] dark:hover:border-[#3E3846]">
              <input
                type="checkbox"
                checked={blockApps}
                onChange={(e) => setBlockApps(e.target.checked)}
                className="mt-0.5 rounded text-[#6D28D9] dark:text-[#8B5CF6] focus:ring-[#6D28D9] accent-[#6D28D9] dark:accent-[#8B5CF6]"
              />
              <div className="text-xs">
                <div className="font-semibold text-[#17151A] dark:text-[#F5F3F7] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
                  <span>Companion OS / Desktop App Shield</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] border border-[#D8CCE8] dark:border-[#3E3846] rounded font-bold">Companion Bridge</span>
                </div>
                <div className="text-[11px] text-[#7B7484] dark:text-[#A9A3AE] mt-0.5">
                  System-level app blocking (e.g. WhatsApp Desktop/mobile) triggers via the LazyLift OS companion bridge. When no native companion is detected, strict browser focus reminders apply.
                </div>
              </div>
            </label>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[11px] text-[#7B7484] dark:text-[#A9A3AE] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#6D28D9] dark:text-[#8B5CF6]" />
            <span>Honest student guarantee: LazyLift never pretends to kill system tasks without verified companion permissions.</span>
          </div>
        </div>

        {/* CTA Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EDE7F3] dark:border-[#302B35]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="px-5 py-2.5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98 flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Focus Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
