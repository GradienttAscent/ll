import React, { useState, useEffect } from 'react';
import { QuestionItem, AnswerEvaluation } from '../types';
import { GraduationCap, CheckCircle, CheckCircle2, AlertTriangle, Lightbulb, Clock, Loader2 } from 'lucide-react';

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
      <div className="max-w-5xl mx-auto py-12 px-6 sm:px-8">
        <div className="rounded-3xl border border-[#EDE7F3] bg-gradient-to-br from-white to-[#FAF8FC] p-8 sm:p-12 text-center space-y-4 shadow-2xs">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[9px] uppercase tracking-[0.2em] font-bold text-[#461599]">
            <GraduationCap className="w-3.5 h-3.5 text-[#5E35B1]" /> AI Practice Mode
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl italic text-[#1C1B1F]">
            No practice questions yet
          </h1>
          <p className="text-xs text-[#7B7484] max-w-md mx-auto leading-relaxed">
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
    <div className="max-w-7xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">

      {/* Header */}
      <div className="border-b border-[#EDE7F3] pb-8">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[10px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
          <GraduationCap className="w-3.5 h-3.5 text-[#5E35B1]" />
          <span>Diagnostic Practice &amp; Assessment</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
          Practice &amp; Answer Evaluation
        </h1>
        <p className="text-xs text-[#55524E] mt-2 max-w-xl font-sans">
          Solve extracted past exam questions, submit your response, and receive instant AI grading with strength analysis and model solution comparison. Every evaluation is saved to your study history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Question Selector List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-4 shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
              Select Question ({questions.length})
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {questions.map((q) => (
                <div
                  key={q.id}
                  onClick={() => handleSelectQuestion(q)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2 ${
                    active.id === q.id
                      ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-xs'
                      : 'bg-[#FAF8FC] text-[#1C1B1F] border-[#EDE7F3] hover:border-[#D8CCE8] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wider">
                    <span className={`font-bold px-2 py-0.5 rounded ${active.id === q.id ? 'bg-white/20 text-white' : 'bg-[#EDE7F6] text-[#461599]'}`}>
                      {q.topic}
                    </span>
                    <span className="font-mono opacity-80">{q.marks} Marks</span>
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
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-8 space-y-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE7F3] pb-4">
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-[#5E35B1] text-white px-3 py-1 rounded-md">
                  {active.subject}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] border border-[#D8CCE8] bg-[#EDE7F6] px-3 py-1 rounded-md text-[#461599]">
                  {active.topic}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-[#7B7484]">
                <span className="flex items-center space-x-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-[#5E35B1]" />
                  <span>~{active.suggestedTimeMinutes}m target</span>
                </span>
                <span className="font-mono font-bold text-[#1C1B1F] text-xs">{active.marks} Marks</span>
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-[#1C1B1F] leading-snug">
              {active.questionText}
            </h2>

            {/* Hint toggle */}
            <div className="pt-2">
              <button
                onClick={handleToggleHint}
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5E35B1] hover:text-[#461599] flex items-center space-x-1.5 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Concept Hint' : 'View Concept Hint'}</span>
              </button>

              {showHint && (
                <div className="mt-3 text-xs bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-4 text-[#1C1B1F] leading-relaxed font-sans">
                  {hintLoading ? (
                    <span className="flex items-center gap-2 font-mono text-[#7B7484]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5E35B1]" />
                      Generating concept hint...
                    </span>
                  ) : conceptHint ? (
                    <>
                      <strong className="block mb-1 text-[#461599] font-serif italic text-sm">Concept Hint:</strong>
                      <span className="whitespace-pre-line text-[#55524E]">{conceptHint}</span>
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
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-8 space-y-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
                Your Solution / Explanation
              </label>
              <span className="text-[9px] uppercase tracking-widest text-[#7B7484]">Markdown &amp; Pseudo-code</span>
            </div>

            <textarea
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              placeholder="Write your step-by-step response here (e.g., algorithm steps, proofs, math equations)..."
              rows={7}
              className="w-full bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-4 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-mono leading-relaxed"
            />

            {evaluateError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 p-3 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{evaluateError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="bg-[#5E35B1] text-white hover:bg-[#461599] rounded-xl px-6 py-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center space-x-2 transition-all shadow-xs hover:shadow disabled:opacity-50 active:scale-98"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
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
            <div className="bg-white rounded-2xl border-2 border-[#5E35B1] p-6 sm:p-8 space-y-6 animate-scale-in shadow-md">

              {/* Score header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDE7F3] pb-5">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#5E35B1]">
                    Practice Evaluation Report
                  </div>
                  <h3 className="font-serif text-3xl italic font-normal text-[#1C1B1F]">
                    Answer Assessment
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-[#7B7484] mt-1">
                    Evaluation saved to your study history
                  </p>
                </div>

                <div className="bg-[#FAF8FC] px-6 py-3.5 rounded-2xl border border-[#D8CCE8] text-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest block text-[#7B7484]">Earned Marks</span>
                  <span className="font-serif text-3xl italic font-normal text-[#461599]">
                    {evaluation.score} <span className="text-sm font-normal text-[#7B7484]">/ {evaluation.maxMarks}</span>
                  </span>
                </div>
              </div>

              {/* Feedback paragraph */}
              <div className="text-xs text-[#1C1B1F] bg-[#FAF8FC] p-5 rounded-xl border border-[#EDE7F3] leading-relaxed font-serif italic">
                &ldquo;{evaluation.feedbackText}&rdquo;
              </div>

              {/* Strengths and Improvements grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Strengths */}
                <div className="bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Key Strengths</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#55524E] font-sans">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-emerald-600">&bull;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Areas for Improvement</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#55524E] font-sans">
                    {evaluation.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="font-bold text-amber-600">&bull;</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* Model Answer comparison */}
              <div className="space-y-2 border-t border-[#EDE7F3] pt-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#461599]">
                  Ideal Model Answer Reference
                </div>
                <div className="bg-[#FAF8FC] rounded-xl border border-[#EDE7F3] p-5 text-xs text-[#1C1B1F] font-mono leading-relaxed">
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