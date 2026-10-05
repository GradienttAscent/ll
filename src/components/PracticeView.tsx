import React, { useState, useEffect } from 'react';
import { QuestionItem, AnswerEvaluation } from '../types';
import { CheckCircle, CheckCircle2, AlertTriangle, Lightbulb, Clock, Loader2 } from 'lucide-react';

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
      <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
        <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-8 sm:p-12 text-center space-y-4 shadow-2xs">
          <h1 className="font-serif text-3xl sm:text-4xl italic text-[#17151A] dark:text-[#F5F3F7]">
            No practice questions yet
          </h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] max-w-md mx-auto leading-relaxed font-sans">
            Upload past exam papers, course notes, or syllabus guides in &ldquo;Past Papers &amp; Topics&rdquo; to automatically extract topic-mapped diagnostic questions.
          </p>
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
      setEvaluateError('Please type or paste your answer before requesting evaluation.');
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
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">

      {/* Header */}
      <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-6">
        <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
          Practice &amp; Answer Evaluation
        </h1>
        <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 max-w-xl font-sans">
          Solve extracted past exam questions, submit your response, and receive structured feedback with strength analysis and model solutions. Evaluations are saved to your study history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Question Selector List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-5 sm:p-6 space-y-4 shadow-2xs">
            <h2 className="font-sans text-sm font-semibold text-[#17151A] dark:text-[#F5F3F7]">
              Select Question ({questions.length})
            </h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {questions.map((q) => {
                const isSelected = active.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => handleSelectQuestion(q)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2 ${
                      isSelected
                        ? 'bg-[#6D28D9] text-white border-[#6D28D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6] shadow-xs'
                        : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#17151A] dark:text-[#F5F3F7] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E344A] hover:bg-white dark:hover:bg-[#251E30]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
                      <span className={`font-medium px-2 py-0.5 rounded ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA]'
                      }`}>
                        {q.topic}
                      </span>
                      <span className="font-mono opacity-80">{q.marks} Marks</span>
                    </div>
                    <div className="text-xs font-serif italic line-clamp-2 leading-tight">
                      {q.questionText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Workspace & AI Evaluation Area (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Active Question Box */}
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 sm:p-8 space-y-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.2em] bg-[#6D28D9] dark:bg-[#8B5CF6] text-white px-3 py-1 rounded-lg">
                  {active.subject}
                </span>
                <span className="text-[9px] font-medium uppercase tracking-[0.2em] border border-[#D8CCE8] dark:border-[#3E344A] bg-[#EDE7F6] dark:bg-[#251E30] px-3 py-1 rounded-lg text-[#6D28D9] dark:text-[#A78BFA]">
                  {active.topic}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-[#7B7484] dark:text-[#7A7480]">
                <span className="flex items-center space-x-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
                  <span>~{active.suggestedTimeMinutes}m target</span>
                </span>
                <span className="font-mono font-bold text-[#17151A] dark:text-[#F5F3F7] text-xs">{active.marks} Marks</span>
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7] leading-snug">
              {active.questionText}
            </h2>

            {/* Hint toggle */}
            <div className="pt-2">
              <button
                onClick={handleToggleHint}
                className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6D28D9] dark:text-[#A78BFA] hover:text-[#5B21B6] dark:hover:text-[#C4B5FD] flex items-center space-x-1.5 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Concept Hint' : 'View Concept Hint'}</span>
              </button>

              {showHint && (
                <div className="mt-3 text-xs bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 text-[#17151A] dark:text-[#F5F3F7] leading-relaxed font-sans">
                  {hintLoading ? (
                    <span className="flex items-center gap-2 font-mono text-[#7B7484] dark:text-[#7A7480]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6D28D9] dark:text-[#8B5CF6]" />
                      Generating concept hint...
                    </span>
                  ) : conceptHint ? (
                    <>
                      <strong className="block mb-1 text-[#6D28D9] dark:text-[#A78BFA] font-serif italic text-sm">Concept Hint:</strong>
                      <span className="whitespace-pre-line text-[#55524E] dark:text-[#A9A3AE]">{conceptHint}</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-2 font-mono text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {hintError || 'Concept hint unavailable.'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Student Answer Editor */}
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 sm:p-8 space-y-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
                Your Solution / Explanation
              </label>
              <span className="text-[9px] uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480]">Markdown &amp; Pseudo-code</span>
            </div>

            <textarea
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              placeholder="Write your step-by-step response here (e.g., algorithm steps, proofs, math equations)..."
              rows={7}
              className="w-full bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#6D28D9] dark:focus:ring-[#8B5CF6] font-mono leading-relaxed transition-colors"
            />

            {evaluateError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 p-3 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{evaluateError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-6 py-2.5 font-medium text-xs tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>Evaluate Answer</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* AI Evaluation Report View */}
          {evaluation && (
            <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#6D28D9] dark:border-[#8B5CF6] p-6 sm:p-8 space-y-6 animate-scale-in shadow-xs">

              {/* Score header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDE7F3] dark:border-[#302B35] pb-5">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#6D28D9] dark:text-[#A78BFA]">
                    Evaluation Report
                  </div>
                  <h3 className="font-serif text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                    Answer Assessment
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480] mt-1">
                    Evaluation saved to your study history
                  </p>
                </div>

                <div className="bg-[#FAF8FC] dark:bg-[#1D1A21] px-6 py-3.5 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] text-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest block text-[#7B7484] dark:text-[#7A7480]">Earned Marks</span>
                  <span className="font-serif text-3xl italic font-normal text-[#6D28D9] dark:text-[#A78BFA]">
                    {evaluation.score} <span className="text-sm font-normal text-[#7B7484] dark:text-[#7A7480]">/ {evaluation.maxMarks}</span>
                  </span>
                </div>
              </div>

              {/* Feedback paragraph */}
              <div className="text-xs text-[#17151A] dark:text-[#F5F3F7] bg-[#FAF8FC] dark:bg-[#1D1A21] p-5 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] leading-relaxed font-serif italic">
                &ldquo;{evaluation.feedbackText}&rdquo;
              </div>

              {/* Strengths and Improvements grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Strengths */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Key Strengths</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">&bull;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-900/40 p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Areas for Improvement</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">
                    {evaluation.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-amber-600 dark:text-amber-400">&bull;</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* Model Answer comparison */}
              <div className="space-y-2 border-t border-[#EDE7F3] dark:border-[#302B35] pt-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6D28D9] dark:text-[#A78BFA]">
                  Ideal Model Answer Reference
                </div>
                <div className="bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-5 text-xs text-[#17151A] dark:text-[#F5F3F7] font-mono leading-relaxed">
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