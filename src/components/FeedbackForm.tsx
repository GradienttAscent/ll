import React, { useState } from 'react';
import { SessionFeedbackPayload } from '../types';
import { Star, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
    <div className="max-w-xl mx-auto p-8 sm:p-10 bg-[#FDFDFC] border border-black space-y-8 animate-fade-in my-8">
      {/* Editorial Header */}
      <div className="text-center space-y-3 pb-6 border-b border-black">
        <div className="inline-block px-3 py-1 border border-black text-black text-[9px] uppercase tracking-[0.25em] font-bold bg-[#F8F7F2]">
          Session Completed &bull; Reflection Log
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl italic text-black">
          Session Evaluation
        </h2>
        <p className="font-serif italic text-black/70 text-sm">
          Reflect on your study session for <strong className="text-black font-semibold">{topicName || blockTitle || 'this topic'}</strong>.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Focus Level */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-black/60">
            Focus Rating (1 = Distracted, 5 = Deep Flow)
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFocus(level)}
                className={`flex-1 py-3 border text-xs font-bold font-mono transition-all ${
                  focus === level
                    ? 'border-black bg-black text-white'
                    : 'border-black/30 bg-[#F8F7F2] text-black hover:border-black'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Difficulty */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-black/60">
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
                className={`p-4 border text-left transition-all ${
                  difficulty === d.id
                    ? 'border-black bg-black text-white'
                    : 'border-black/30 bg-[#F8F7F2] text-black hover:border-black'
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wider">{d.label}</div>
                <div className={`text-[10px] mt-1 ${difficulty === d.id ? 'text-white/70' : 'text-black/60'}`}>{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Progress */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-black/60">
            Perceived Progress Made
          </label>
          <div className="flex items-center justify-between bg-[#F8F7F2] p-4 border border-black">
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
                      star <= perceivedProgress ? 'fill-black text-black' : 'text-black/20'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black">
              {perceivedProgress * 20}% Covered
            </span>
          </div>
        </div>

        {/* Reflection Notes */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-black/60">
            Notes &amp; Takeaways <span className="text-black/40 font-normal">(Optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key formulas, concepts to review, or blockers faced..."
            rows={3}
            className="w-full p-3 bg-white border border-black text-xs font-sans focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-black">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSubmitting}
              className="text-[10px] font-bold uppercase tracking-wider text-black/60 hover:text-black transition-colors"
            >
              Skip Feedback
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 border border-black bg-black text-white hover:bg-white hover:text-black text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
