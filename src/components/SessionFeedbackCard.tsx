import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface SessionFeedbackCardProps {
  sessionId: string;
  title: string;
  onSave: (input: { focusRating: number; difficultyRating: number; progressRating: number; notes: string }) => Promise<void>;
}

export const SessionFeedbackCard: React.FC<SessionFeedbackCardProps> = ({ title, onSave }) => {
  const [focusRating, setFocusRating] = useState(3);
  const [difficultyRating, setDifficultyRating] = useState(3);
  const [progressRating, setProgressRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const ratingRow = (label: string, value: number, setValue: (rating: number) => void) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE] mb-2">{label}</div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => setValue(rating)}
            className={`w-9 h-9 rounded-xl border text-xs font-bold transition-all shadow-2xs ${
              value === rating
                ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-transparent'
                : 'bg-white dark:bg-[#1D1A21] border-[#EDE7F3] dark:border-[#302B35] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846]'
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await onSave({ focusRating, difficultyRating, progressRating, notes });
    } catch (saveError: any) {
      setError(saveError.message || 'Unable to save session feedback.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-xs p-4 flex items-center justify-center animate-fade-in">
      <form onSubmit={submit} className="w-full max-w-md bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-8 space-y-6 shadow-xl text-[#17151A] dark:text-[#F5F3F7]">
        <div>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E3846] text-[9px] uppercase tracking-[0.2em] font-bold text-[#6D28D9] dark:text-[#8B5CF6] mb-3">
            Session Complete
          </div>
          <h2 className="font-serif text-3xl italic text-[#17151A] dark:text-[#F5F3F7]">How did that session go?</h2>
          <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] mt-1 font-sans">{title}</p>
        </div>

        <div className="space-y-4">
          {ratingRow('Focus Level', focusRating, setFocusRating)}
          {ratingRow('Perceived Difficulty', difficultyRating, setDifficultyRating)}
          {ratingRow('Progress Made', progressRating, setProgressRating)}
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#A9A3AE]">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Optional reflection on formulas or difficult questions..."
            className="mt-2 w-full resize-none bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] rounded-xl px-3.5 py-2.5 text-xs font-normal normal-case tracking-normal text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-all"
          />
        </label>

        {error && <p className="text-xs font-bold text-red-600 dark:text-red-400 font-mono">{error}</p>}

        <button
          disabled={isSaving}
          className="w-full bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg py-2.5 text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Saving feedback...</span>
            </>
          ) : (
            'Save Feedback'
          )}
        </button>
      </form>
    </div>
  );
};
