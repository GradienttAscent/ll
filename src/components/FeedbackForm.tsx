import React, { useState } from 'react';
import { SessionFeedbackPayload } from '../types';
import { Star, AlertCircle, Loader2 } from 'lucide-react';

interface FeedbackFormProps {
  sessionId: string;
  topicName?: string;
  blockTitle?: string;
  onSubmit: (payload: SessionFeedbackPayload) => Promise<void>;
  onSkip?: () => void;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({
  sessionId,
  topicName,
  blockTitle,
  onSubmit,
  onSkip
}) => {
  const [focus, setFocus] = useState<number>(4);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [perceivedProgress, setPerceivedProgress] = useState<number>(4);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: SessionFeedbackPayload = {
      sessionId,
      score: perceivedProgress * 20,
      maxMarks: 100,
      source: 'manual',
      difficulty,
      focus,
      perceivedProgress,
      notes: notes.trim() || undefined
    };

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-8 sm:p-10 bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] space-y-8 animate-fade-in my-8 shadow-sm">
      {/* Editorial Header */}
      <div className="text-center space-y-3 pb-6 border-b border-[#EDE7F3] dark:border-[#302B35]">
        <div className="inline-block px-3 py-1 rounded-full bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E3846] text-[#6D28D9] dark:text-[#8B5CF6] text-[9px] uppercase tracking-[0.25em] font-bold">
          Session Completed &bull; Reflection Log
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl italic text-[#17151A] dark:text-[#F5F3F7]">
          Session Evaluation
        </h2>
        <p className="font-serif italic text-[#7B7484] dark:text-[#A9A3AE] text-sm">
          Reflect on your study session for <strong className="text-[#6D28D9] dark:text-[#8B5CF6] font-semibold">{topicName || blockTitle || 'this topic'}</strong>.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl text-red-800 dark:text-red-300 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Focus Level */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Focus Rating (1 = Distracted, 5 = Deep Flow)
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFocus(level)}
                className={`flex-1 py-3 rounded-xl border text-xs font-bold font-mono transition-all shadow-2xs ${
                  focus === level
                    ? 'border-transparent bg-[#6D28D9] dark:bg-[#8B5CF6] text-white'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Difficulty */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Perceived Difficulty
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'easy', label: 'Easy', desc: 'Smooth review' },
              { id: 'medium', label: 'Medium', desc: 'As expected' },
              { id: 'hard', label: 'Hard', desc: 'Challenging concepts' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDifficulty(d.id as any)}
                className={`p-4 rounded-xl border text-left transition-all shadow-2xs ${
                  difficulty === d.id
                    ? 'border-transparent bg-[#6D28D9] dark:bg-[#8B5CF6] text-white'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#A9A3AE] hover:border-[#D8CCE8] dark:hover:border-[#3E3846]'
                }`}
              >
                <div className={`text-xs font-semibold uppercase tracking-wider ${difficulty === d.id ? 'text-white' : 'text-[#17151A] dark:text-[#F5F3F7]'}`}>{d.label}</div>
                <div className={`text-[10px] mt-1 ${difficulty === d.id ? 'text-white/80' : 'text-[#7B7484] dark:text-[#A9A3AE]'}`}>{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Progress */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Perceived Progress Made
          </label>
          <div className="flex items-center justify-between bg-[#FAF8FC] dark:bg-[#1D1A21] p-4 rounded-xl border border-[#EDE7F3] dark:border-[#302B35]">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setPerceivedProgress(star)}
                  className="p-1 focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-5 h-5 ${
                      star <= perceivedProgress ? 'fill-[#6D28D9] text-[#6D28D9] dark:fill-[#8B5CF6] dark:text-[#8B5CF6]' : 'text-[#D8CCE8] dark:text-[#3E3846]'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
              {perceivedProgress * 20}% Covered
            </span>
          </div>
        </div>

        {/* Reflection Notes */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484] dark:text-[#A9A3AE]">
            Notes &amp; Takeaways <span className="text-[#7B7484]/60 dark:text-[#A9A3AE]/60 font-normal">(Optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key formulas, concepts to review, or blockers faced..."
            rows={3}
            className="w-full p-3 bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] text-xs font-sans text-[#17151A] dark:text-[#F5F3F7] placeholder-[#7B7484] dark:placeholder-[#A9A3AE] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-[#EDE7F3] dark:border-[#302B35]">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSubmitting}
              className="text-xs font-semibold uppercase tracking-wider text-[#7B7484] dark:text-[#A9A3AE] hover:text-[#17151A] dark:hover:text-[#F5F3F7] transition-colors"
            >
              Skip Feedback
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white text-xs font-semibold uppercase tracking-[0.16em] transition-all shadow-xs hover:shadow active:scale-98 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#CEB8FF]" />
                <span>Saving Log...</span>
              </>
            ) : (
              'Save Reflection Log'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
