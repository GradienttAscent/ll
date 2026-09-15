import React, { useState } from 'react';

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
  const ratingRow = (label: string, value: number, setValue: (rating: number) => void) => <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2">{label}</div><div className="flex gap-2">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" onClick={() => setValue(rating)} className={`w-8 h-8 border text-xs font-bold transition-colors ${value === rating ? 'bg-black text-white border-black' : 'bg-white border-black hover:bg-black hover:text-white'}`}>{rating}</button>)}</div></div>;

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

  return <div className="fixed inset-0 z-50 bg-black/20 p-4 flex items-center justify-center"><form onSubmit={submit} className="w-full max-w-md bg-[#F8F7F2] border-2 border-black p-6 space-y-5 shadow-xl"><div><div className="text-[10px] font-bold uppercase tracking-[0.2em]">Session complete</div><h2 className="font-serif text-3xl italic mt-1">How did that session go?</h2><p className="text-xs text-black/60 mt-1">{title}</p></div>{ratingRow('Focus', focusRating, setFocusRating)}{ratingRow('Difficulty', difficultyRating, setDifficultyRating)}{ratingRow('Progress', progressRating, setProgressRating)}<label className="block text-[10px] font-bold uppercase tracking-[0.18em]">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Optional reflection" className="mt-2 w-full resize-none bg-white border border-black px-3 py-2 text-xs font-normal normal-case tracking-normal" /></label>{error && <p className="text-xs font-bold">{error}</p>}<button disabled={isSaving} className="w-full bg-black text-white border border-black py-3 text-[10px] font-bold uppercase tracking-[0.2em] disabled:opacity-50">{isSaving ? 'Saving...' : 'Save feedback'}</button></form></div>;
};
