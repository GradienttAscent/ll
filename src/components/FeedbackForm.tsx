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
    <div className="max-w-xl mx-auto p-8 sm:p-10 bg-white rounded-3xl border border-[#EDE7F3] space-y-8 animate-fade-in my-8 shadow-sm">
      {/* Editorial Header */}
      <div className="text-center space-y-3 pb-6 border-b border-[#EDE7F3]">
        <div className="inline-block px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[#461599] text-[9px] uppercase tracking-[0.25em] font-bold">
          Session Completed &bull; Reflection Log
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl italic text-[#1C1B1F]">
          Session Evaluation
        </h2>
        <p className="font-serif italic text-[#7B7484] text-sm">
          Reflect on your study session for <strong className="text-[#5E35B1] font-semibold">{topicName || blockTitle || 'this topic'}</strong>.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Focus Level */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">
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
                    ? 'border-transparent bg-[#5E35B1] text-white'
                    : 'border-[#EDE7F3] bg-[#FAF8FC] text-[#7B7484] hover:border-[#D8CCE8]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Difficulty */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">
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
                    ? 'border-transparent bg-[#5E35B1] text-white'
                    : 'border-[#EDE7F3] bg-[#FAF8FC] text-[#7B7484] hover:border-[#D8CCE8]'
                }`}
              >
                <div className={`text-xs font-bold uppercase tracking-wider ${difficulty === d.id ? 'text-white' : 'text-[#1C1B1F]'}`}>{d.label}</div>
                <div className={`text-[10px] mt-1 ${difficulty === d.id ? 'text-white/80' : 'text-[#7B7484]'}`}>{d.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Perceived Progress */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">
            Perceived Progress Made
          </label>
          <div className="flex items-center justify-between bg-[#FAF8FC] p-4 rounded-xl border border-[#EDE7F3]">
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
                      star <= perceivedProgress ? 'fill-[#5E35B1] text-[#5E35B1]' : 'text-[#D8CCE8]'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#5E35B1]">
              {perceivedProgress * 20}% Covered
            </span>
          </div>
        </div>

        {/* Reflection Notes */}
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#7B7484]">
            Notes &amp; Takeaways <span className="text-[#7B7484]/60 font-normal">(Optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key formulas, concepts to review, or blockers faced..."
            rows={3}
            className="w-full p-3 bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] text-xs font-sans text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] focus:ring-2 focus:ring-[#5E35B1]/10 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-[#EDE7F3]">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSubmitting}
              className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] hover:text-[#1C1B1F] transition-colors"
            >
              Skip Feedback
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 rounded-xl bg-[#5E35B1] hover:bg-[#461599] text-white text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-xs hover:shadow active:scale-98 flex items-center gap-2"
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
