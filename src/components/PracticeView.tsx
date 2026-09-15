import React, { useState } from 'react';
import { QuestionItem, AnswerEvaluation } from '../types';
import { Sparkles, CheckCircle, AlertTriangle, Lightbulb, Clock, Loader2 } from 'lucide-react';

interface PracticeViewProps {
  questions: QuestionItem[];
}

export const PracticeView: React.FC<PracticeViewProps> = ({ questions }) => {
  if (questions.length === 0) {
    return <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8"><div className="border border-black bg-[#F8F7F2] p-8"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/50">Practice</div><h1 className="font-serif text-4xl italic mt-2">No practice questions yet</h1><p className="text-xs text-black/60 mt-3">Analyze previous papers first to generate your academic question set.</p></div></div>;
  }
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionItem>(questions[0]);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [showHint, setShowHint] = useState(false);

  const handleEvaluate = async () => {
    if (!studentAnswer.trim()) {
      alert('Please type or paste your answer before requesting AI feedback.');
      return;
    }

    setIsEvaluating(true);
    setEvaluation(null);

    try {
      const res = await fetch('/api/gemini/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: selectedQuestion.questionText,
          studentAnswer: studentAnswer,
          maxMarks: selectedQuestion.marks,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setEvaluation(json.data);
      }
    } catch (err) {
      console.error('Failed to get answer evaluation:', err);
      alert('Error evaluating answer with Gemini API.');
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
          Solve extracted past exam questions, submit your response, and receive instant AI grading with strength analysis and model solution comparison.
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
                  onClick={() => {
                    setSelectedQuestion(q);
                    setEvaluation(null);
                    setShowHint(false);
                  }}
                  className={`p-4 border transition-all cursor-pointer text-left space-y-2 ${
                    selectedQuestion.id === q.id
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
                  {selectedQuestion.subject}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] border border-black px-3 py-1 text-black">
                  {selectedQuestion.topic}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-black/70">
                <span className="flex items-center space-x-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>~{selectedQuestion.suggestedTimeMinutes}m target</span>
                </span>
                <span className="font-mono font-bold text-black text-xs">{selectedQuestion.marks} Marks</span>
              </div>
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-black leading-snug">
              {selectedQuestion.questionText}
            </h2>

            {/* Hint toggle */}
            <div className="pt-2">
              <button
                onClick={() => setShowHint(!showHint)}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-black border-b border-black pb-0.5 hover:text-black/60 flex items-center space-x-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Concept Hint' : 'View Concept Hint'}</span>
              </button>

              {showHint && (
                <div className="mt-3 text-xs bg-white border border-black p-4 text-black leading-relaxed font-sans">
                  <strong>Concept Hint:</strong> {selectedQuestion.solutionHint || 'Focus on step-by-step logic and explicit boundary condition checks.'}
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
                  {evaluation.modelAnswerSnippet || selectedQuestion.modelAnswer}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};

