import React, { useState, useEffect } from 'react';
import { QuestionItem, AnswerEvaluation } from '../types';
import { Sparkles, CheckCircle, AlertTriangle, Lightbulb, Clock, Loader2 } from 'lucide-react';

interface PracticeViewProps {
  questions: QuestionItem[];
}

export const PracticeView: React.FC<PracticeViewProps> = ({ questions }) => {
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionItem | undefined>(questions[0]);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [conceptHint, setConceptHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);

  if (questions.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8">
        <div className="border border-black bg-[#F8F7F2] p-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/50">Practice</div>
          <h1 className="font-serif text-4xl italic mt-2">No practice questions yet</h1>
          <p className="text-xs text-black/60 mt-3">Analyze previous papers first to generate your academic question set.</p>
        </div>
      </div>
    );
  }

  const active = selectedQuestion && questions.some((q) => q.id === selectedQuestion.id)
    ? selectedQuestion
    : questions[0];

  const loadHint = async () => {
    if (conceptHint) return;
    setHintLoading(true);
    setHintError(null);
    try {
      const res = await fetch('/api/practice/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: active.questionText,
          maxMarks: active.marks,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate a concept hint.');
      }
      setConceptHint(json.data.hint as string);
    } catch (err: any) {
      setConceptHint(active.solutionHint || null);
      setHintError(err.message || 'Error generating concept hint with Gemini API.');
    } finally {
      setHintLoading(false);
    }
  };

  const handleToggleHint = () => {
    const next = !showHint;
    setShowHint(next);
    if (next && !conceptHint && !hintLoading) {
      loadHint();
    }
  };

  const handleSelectQuestion = (q: QuestionItem) => {
    setSelectedQuestion(q);
    setEvaluation(null);
    setShowHint(false);
    setEvaluateError(null);
    setConceptHint(null);
    setHintError(null);
  };

  useEffect(() => {
    setConceptHint(null);
    setHintError(null);
    setShowHint(false);
  }, [active.id]);

  const handleEvaluate = async () => {
    if (!studentAnswer.trim()) {
      setEvaluateError('Please type or paste your answer before requesting AI feedback.');
      return;
    }

    setIsEvaluating(true);
    setEvaluation(null);
    setEvaluateError(null);

    try {
      const res = await fetch('/api/practice/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: active.questionText,
          studentAnswer: studentAnswer,
          maxMarks: active.marks,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to evaluate your answer.');
      }
      setEvaluation(json.data as AnswerEvaluation);
    } catch (err: any) {
      setEvaluateError(err.message || 'Error evaluating answer with Gemini API.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">

      {/* Header */}
      <div className="border-b border-black pb-8">
        <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Interactive AI Feedback Engine</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
          Practice &amp; Answer Evaluation
        </h1>
        <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
          Solve extracted past exam questions, submit your response, and receive instant AI grading with strength analysis and model solution comparison. Every evaluation is saved to your study history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Question Selector List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
              Select Question ({questions.length})
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {questions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => handleSelectQuestion(q)}
                  className={`p-4 border transition-all cursor-pointer text-left space-y-2 ${
                    active.id === q.id
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black/30 hover:border-black'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
                    <span className="font-bold border border-current px-2 py-0.5">
                      {q.topic}
                    </span>
                    <span className="font-mono">{q.marks} Marks</span>
                  </div>
                  <div className="text-xs font-serif italic line-clamp-2 leading-tight">
                    {q.questionText}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Workspace & AI Evaluation Area (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Active Question Box */}
          <div className="bg-[#F8F7F2] border border-black p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-4">
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-black text-white px-3 py-1">
                  {active.subject}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] border border-black px-3 py-1 text-black">
                  {active.topic}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-black/70">
                <span className="flex items-center space-x-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>~{active.suggestedTimeMinutes}m target</span>
                </span>
                <span className="font-mono font-bold text-black text-xs">{active.marks} Marks</span>
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-black leading-snug">
              {active.questionText}
            </h2>

            {/* Hint toggle */}
            <div className="pt-2">
              <button
                onClick={handleToggleHint}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-black border-b border-black pb-0.5 hover:text-black/60 flex items-center space-x-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Concept Hint' : 'View Concept Hint'}</span>
              </button>

              {showHint && (
                <div className="mt-3 text-xs bg-white border border-black p-4 text-black leading-relaxed font-sans">
                  {hintLoading ? (
                    <span className="flex items-center gap-2 font-mono text-black/60">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating concept hint with Gemini...
                    </span>
                  ) : conceptHint ? (
                    <>
                      <strong className="block mb-1">Gemini Concept Hint:</strong>
                      <span className="whitespace-pre-line">{conceptHint}</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-2 font-mono text-red-800">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {hintError || 'Concept hint unavailable.'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Student Answer Editor */}
          <div className="bg-[#F8F7F2] border border-black p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                Your Solution / Explanation
              </label>
              <span className="text-[9px] uppercase tracking-widest text-black/40">Markdown &amp; Pseudo-code</span>
            </div>

            <textarea
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              placeholder="Write your step-by-step response here (e.g., algorithm steps, proofs, math equations)..."
              rows={7}
              className="w-full bg-white border border-black/30 p-4 text-xs text-black focus:outline-none focus:border-black font-mono leading-relaxed"
            />

            {evaluateError && (
              <div className="bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{evaluateError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="bg-black text-white hover:bg-white hover:text-black border border-black px-6 py-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Get Practice Evaluation</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Evaluation Report View */}
          {evaluation && (
            <div className="bg-[#F8F7F2] border-2 border-black p-6 sm:p-8 space-y-6 animate-fade-in">

              {/* Score header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50">
                    Practice Evaluation Report
                  </div>
                  <h3 className="font-serif text-3xl italic font-normal text-black">
                    Answer Assessment
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-black/40 mt-1">
                    Gemini AI evaluation saved to your study history
                  </p>
                </div>

                <div className="bg-black text-white px-6 py-3 border border-black text-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest block opacity-70">Earned Marks</span>
                  <span className="font-serif text-3xl italic font-normal">
                    {evaluation.score} <span className="text-sm font-normal opacity-70">/ {evaluation.maxMarks}</span>
                  </span>
                </div>
              </div>

              {/* Feedback paragraph */}
              <div className="text-xs text-black bg-white p-5 border border-black leading-relaxed font-serif italic">
                &ldquo;{evaluation.feedbackText}&rdquo;
              </div>

              {/* Strengths and Improvements grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Strengths */}
                <div className="bg-white border border-black p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-black">
                    <CheckCircle className="w-4 h-4 text-black" />
                    <span>Key Strengths</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-black/80 font-sans">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-black">&bull;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-white border border-black p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-black">
                    <AlertTriangle className="w-4 h-4 text-black" />
                    <span>Areas for Improvement</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-black/80 font-sans">
                    {evaluation.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-black">&bull;</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* Model Answer comparison */}
              <div className="space-y-2 border-t border-black pt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">
                  Ideal Model Answer Reference
                </div>
                <div className="bg-white border border-black p-5 text-xs text-black font-mono leading-relaxed">
                  {evaluation.modelAnswerSnippet || active.modelAnswer}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};