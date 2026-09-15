import React, { useState, useEffect } from 'react';
import { QuestionItem } from '../types';
import { Layers, Clock, Award, RotateCcw, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

interface MockExamViewProps {
  questions: QuestionItem[];
}

export const MockExamView: React.FC<MockExamViewProps> = ({ questions }) => {
  if (questions.length === 0) {
    return <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8"><div className="border border-black bg-[#F8F7F2] p-8"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/50">Mock Exam</div><h1 className="font-serif text-4xl italic mt-2">No mock exam questions available yet</h1><p className="text-xs text-black/60 mt-3">Analyze previous papers before starting a mock exam.</p></div></div>;
  }
  const [examStarted, setExamStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(45 * 60); // 45 minutes
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examReport, setExamReport] = useState<any>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (examStarted && !examSubmitted && timeLeftSeconds > 0) {
      timer = setInterval(() => {
        setTimeLeftSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [examStarted, examSubmitted, timeLeftSeconds]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQ = questions[currentIndex] || questions[0];

  const handleStartExam = () => {
    setExamStarted(true);
    setExamSubmitted(false);
    setExamReport(null);
    setTimeLeftSeconds(45 * 60);
  };

  const handleAnswerChange = (text: string) => {
    setAnswers((prev) => ({ ...prev, [currentQ.id]: text }));
  };

  const handleSubmitExam = () => {
    setExamSubmitted(true);
    
    // Calculate simulated overall grade report
    const totalMax = questions.reduce((acc, q) => acc + q.marks, 0);
    let answeredCount = 0;
    Object.values(answers).forEach((val) => {
      if ((val as string)?.trim()) answeredCount++;
    });

    const calculatedScore = Math.min(totalMax, Math.round(answeredCount * (totalMax / questions.length) * 0.85));
    const percentage = Math.round((calculatedScore / totalMax) * 100);

    setExamReport({
      totalScore: calculatedScore,
      totalMax: totalMax,
      percentage: percentage,
      grade: percentage >= 85 ? 'A' : percentage >= 70 ? 'B' : 'C',
      answeredCount: answeredCount,
      totalQuestions: questions.length,
      topicBreakdown: [
        { topic: 'Graph Algorithms', score: '9/10', mastery: 'High' },
        { topic: 'Dynamic Programming', score: '10/12', mastery: 'High' },
        { topic: 'Big O Analysis', score: '6/8', mastery: 'Moderate' },
        { topic: 'Heap Operations', score: '7/10', mastery: 'Moderate' },
      ],
      aiAdvice: 'Strong performance on core algorithms! Focus on double-checking Master Theorem regularity conditions to secure an A+ on final exam day.'
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Simulated Exam Mode</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            CS301 Timed Mock Examination
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
            Simulate real exam pressure under timed conditions using extracted university past questions.
          </p>
        </div>

        {examStarted && !examSubmitted && (
          <div className="flex items-center space-x-2 bg-black text-white px-5 py-3 border border-black font-mono text-sm font-bold self-start sm:self-auto">
            <Clock className="w-4 h-4 text-white animate-pulse" />
            <span>{formatTimer(timeLeftSeconds)}</span>
          </div>
        )}
      </div>

      {!examStarted ? (
        /* Exam Pre-Start Screen */
        <div className="bg-[#F8F7F2] border border-black p-8 sm:p-12 text-center space-y-8 max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-black text-white border border-black flex items-center justify-center mx-auto">
            <Award className="w-8 h-8" />
          </div>

          <div className="space-y-3">
            <h2 className="font-serif text-3xl sm:text-4xl italic font-normal text-black">
              Ready for your Timed Mock Exam?
            </h2>
            <p className="text-xs text-black/70 leading-relaxed font-sans max-w-md mx-auto">
              This mock exam consists of 4 high-yield questions extracted from recent past papers (Total: 40 Marks, Time Limit: 45 Minutes).
            </p>
          </div>

          <div className="bg-white border border-black p-6 text-left space-y-3 text-xs text-black font-sans">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Exam Instructions:</div>
            <ul className="list-disc list-inside space-y-2 text-black/80">
              <li>Timer will start immediately upon clicking &ldquo;Begin Mock Exam&rdquo;.</li>
              <li>You can navigate back and forth between questions anytime.</li>
              <li>Gemini AI will evaluate all written solutions upon final submission.</li>
            </ul>
          </div>

          <button
            onClick={handleStartExam}
            className="w-full bg-black hover:bg-white hover:text-black border border-black text-white py-4 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
          >
            Begin Mock Exam Now
          </button>
        </div>
      ) : examSubmitted ? (
        /* Exam Results Report Screen */
        <div className="bg-[#F8F7F2] border-2 border-black p-8 sm:p-10 space-y-8 animate-fade-in">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-black pb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                Exam Results &amp; Grade Report
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl italic font-normal text-black">
                Mock Exam Summary
              </h2>
            </div>

            <div className="flex items-center space-x-6 bg-white border border-black p-5">
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-black/60 block">Score</span>
                <span className="font-serif text-3xl italic font-normal text-black">{examReport.totalScore}/{examReport.totalMax}</span>
              </div>
              <div className="h-10 w-px bg-black"></div>
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-black/60 block">Grade</span>
                <span className="font-serif text-3xl italic font-normal text-black">{examReport.grade}</span>
              </div>
            </div>
          </div>

          {/* AI Advice Box */}
          <div className="bg-white border border-black p-6 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-black">
              <Sparkles className="w-4 h-4" />
              <span>Prototype Exam Note</span>
            </div>
            <p className="text-xs text-black/80 leading-relaxed font-sans">
              This prototype report is not stored or AI-evaluated. {examReport.aiAdvice}
            </p>
          </div>

          {/* Topic-wise Breakdown */}
          <div className="space-y-4">
            <h3 className="font-serif text-2xl italic font-normal text-black">
              Illustrative Prototype Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {examReport.topicBreakdown.map((tb: any, idx: number) => (
                <div key={idx} className="bg-white border border-black p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-serif italic text-black">{tb.topic}</div>
                    <div className="text-[9px] uppercase tracking-widest text-black/50 mt-1">Mastery level: {tb.mastery}</div>
                  </div>
                  <span className="font-mono text-xs font-bold text-white bg-black border border-black px-3 py-1">
                    {tb.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-black flex justify-between">
            <button
              onClick={handleStartExam}
              className="bg-black hover:bg-white hover:text-black text-white px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center space-x-2 border border-black transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake Mock Exam</span>
            </button>
          </div>

        </div>
      ) : (
        /* Active Exam Question Workspace */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: Question Navigation Matrix (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-[#F8F7F2] border border-black p-6 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
                Question Navigator
              </div>

              <div className="grid grid-cols-2 gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(answers[q.id]?.trim());
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`p-3 border text-center transition-all ${
                        isCurrent
                          ? 'bg-black text-white border-black font-bold'
                          : isAnswered
                          ? 'bg-white text-black border-black/80 font-bold'
                          : 'bg-white text-black/60 border-black/30 hover:border-black'
                      }`}
                    >
                      <div className="text-xs">Q{idx + 1}</div>
                      <div className="text-[9px] font-mono opacity-80">{q.marks}M</div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-black">
                <button
                  onClick={handleSubmitExam}
                  className="w-full bg-black hover:bg-white hover:text-black text-white border border-black py-3 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
                >
                  Submit &amp; Finish Exam
                </button>
              </div>
            </div>
          </div>

          {/* Right: Active Exam Question and Answer Box (9 cols) */}
          <div className="lg:col-span-9 space-y-6">
            <div className="bg-[#F8F7F2] border border-black p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between border-b border-black pb-4">
                <span className="font-mono text-xs font-bold text-white bg-black px-3 py-1">
                  Question {currentIndex + 1} of {questions.length} ({currentQ.marks} Marks)
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">{currentQ.topic}</span>
              </div>

              <h3 className="font-serif text-2xl sm:text-3xl italic font-normal text-black leading-snug">
                {currentQ.questionText}
              </h3>
            </div>

            <div className="bg-[#F8F7F2] border border-black p-6 sm:p-8 space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Your Written Response</label>
              <textarea
                value={answers[currentQ.id] || ''}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your exam solution here..."
                rows={9}
                className="w-full bg-white border border-black/30 p-4 text-xs text-black focus:outline-none focus:border-black font-mono leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                className="bg-[#F8F7F2] hover:bg-white text-black px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center space-x-1.5 border border-black disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="bg-[#F8F7F2] hover:bg-white text-black px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center space-x-1.5 border border-black disabled:opacity-40 transition-colors"
              >
                <span>Next Question</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

