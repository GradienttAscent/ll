import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QuestionItem, MockExamRecord } from '../types';
import { Layers, Clock, Award, RotateCcw, ChevronRight, ChevronLeft, Sparkles, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

interface MockExamViewProps {
  questions: QuestionItem[];
}

const MIN_DURATION_SECONDS = 15 * 60;
const MAX_DURATION_SECONDS = 180 * 60;

export const MockExamView: React.FC<MockExamViewProps> = ({ questions }) => {
  const [examStarted, setExamStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(MIN_DURATION_SECONDS);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examReport, setExamReport] = useState<MockExamRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);

  const totalDurationSeconds = useMemo(() => {
    const minutes = questions.reduce((sum, q) => sum + (Number(q.suggestedTimeMinutes) || 15), 0);
    const clamped = Math.max(MIN_DURATION_SECONDS, Math.min(MAX_DURATION_SECONDS, Math.round(minutes) * 60));
    return clamped;
  }, [questions]);

  const totalMax = useMemo(() => questions.reduce((sum, q) => sum + q.marks, 0), [questions]);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (examStarted && !examSubmitted && !submitting && timeLeftSeconds > 0) {
      timer = setInterval(() => {
        setTimeLeftSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [examStarted, examSubmitted, submitting, timeLeftSeconds]);

  const submitExam = useCallback(async () => {
    if (submittingRef.current || examSubmitted) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        examName: 'Timed Mock Examination',
        durationSeconds: totalDurationSeconds,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        questions: questions.map((q, index) => ({
          questionText: q.questionText,
          topicName: q.topic,
          marks: q.marks,
          suggestedTimeMinutes: q.suggestedTimeMinutes,
          answer: answersRef.current[q.id] || '',
        })),
      };
      const response = await fetch('/api/mock-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to submit mock exam.');
      }
      setExamReport(json.mockExam as MockExamRecord);
      setExamSubmitted(true);
      setTimeLeftSeconds(0);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit mock exam. Check that GEMINI_API_KEY is configured.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [examSubmitted, questions, totalDurationSeconds, startedAt]);

  useEffect(() => {
    if (examStarted && !examSubmitted && timeLeftSeconds === 0 && !submittingRef.current && !submitting) {
      setSubmitError(null);
      submitExam();
    }
  }, [examStarted, examSubmitted, timeLeftSeconds, submitting, submitExam]);

  const formatTimer = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQ = questions[currentIndex] || questions[0];

  const handleStartExam = () => {
    setExamStarted(true);
    setExamSubmitted(false);
    setExamReport(null);
    setSubmitError(null);
    setAnswers({});
    setCurrentIndex(0);
    setStartedAt(Date.now());
    setTimeLeftSeconds(totalDurationSeconds);
  };

  const handleAnswerChange = (text: string) => {
    setAnswers((prev) => ({ ...prev, [currentQ.id]: text }));
  };

  if (questions.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8">
        <div className="border border-black bg-[#F8F7F2] p-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/50">Mock Exam</div>
          <h1 className="font-serif text-4xl italic mt-2">No mock exam questions available yet</h1>
          <p className="text-xs text-black/60 mt-3">Analyze previous papers before starting a mock exam.</p>
        </div>
      </div>
    );
  }

  const timerLow = !examSubmitted && timeLeftSeconds > 0 && timeLeftSeconds <= 60;
  const answeredCount = Object.values(answers).filter((answer) => Boolean((answer as string).trim())).length;

  return (
    <div className="max-w-5xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Gemini-Graded Timed Mode</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            CS301 Timed Mock Examination
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
            Simulate real exam pressure under timed conditions using extracted university past questions. Answers are graded by Gemini AI on submission.
          </p>
        </div>

        {examStarted && !examSubmitted && (
          <div className="flex items-center space-x-2 bg-black text-white px-5 py-3 border border-black font-mono text-sm font-bold self-start sm:self-auto">
            <Clock className={`w-4 h-4 text-white ${timerLow ? 'animate-pulse text-red-300' : ''}`} />
            <span className={timerLow ? 'text-red-300' : ''}>{formatTimer(timeLeftSeconds)}</span>
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
              This mock exam consists of {questions.length} questions extracted from your analyzed papers
              (Total: {totalMax} Marks, Time Limit: {Math.round(totalDurationSeconds / 60)} Minutes).
            </p>
          </div>

          <div className="bg-white border border-black p-6 text-left space-y-3 text-xs text-black font-sans">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Exam Instructions:</div>
            <ul className="list-disc list-inside space-y-2 text-black/80">
              <li>Timer will start immediately upon clicking &ldquo;Begin Mock Exam&rdquo;.</li>
              <li>You can navigate back and forth between questions anytime.</li>
              <li>The exam auto-submits when the timer reaches 00:00.</li>
              <li>Gemini AI will grade every question and return a full report that is saved to your History.</li>
            </ul>
          </div>

          <button
            onClick={handleStartExam}
            className="w-full bg-black hover:bg-white hover:text-black border border-black text-white py-4 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
          >
            Begin Mock Exam Now
          </button>
        </div>
      ) : examSubmitted && examReport ? (
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
              <p className="text-[10px] uppercase tracking-widest text-black/50 mt-1">
                {examReport.answeredCount} of {questions.length} questions answered &bull; Evaluated by Gemini AI &bull; Saved to your History
              </p>
            </div>

            <div className="flex items-center space-x-6 bg-white border border-black p-5">
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-black/60 block">Score</span>
                <span className="font-serif text-3xl italic font-normal text-black">{examReport.totalScore}/{examReport.totalMax}</span>
              </div>
              <div className="h-10 w-px bg-black"></div>
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-black/60 block">Percentage</span>
                <span className="font-serif text-3xl italic font-normal text-black">{examReport.percentage}%</span>
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
              <span>Gemini AI Advice</span>
            </div>
            <p className="text-xs text-black/80 leading-relaxed font-sans">
              {examReport.advice || 'No overall feedback was generated for this exam.'}
            </p>
          </div>

          {/* Per-question Grading */}
          <div className="space-y-6">
            <h3 className="font-serif text-2xl italic font-normal text-black">
              Question-by-Question Grading
            </h3>
            <div className="space-y-4">
              {examReport.perQuestion.map((item) => (
                <div key={item.id} className="bg-white border border-black p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4 border-b border-black pb-3">
                    <div>
                      <span className="font-mono text-[10px] font-bold text-white bg-black px-2.5 py-0.5 mr-2">
                        Q{item.position}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">{item.topicName}</span>
                    </div>
                    <span className="font-mono text-xs font-bold bg-[#F8F7F2] border border-black px-3 py-1">
                      {item.score}/{item.maxMarks} marks
                    </span>
                  </div>
                  <p className="text-xs text-black/90 leading-relaxed font-sans">
                    <span className="font-bold text-black">Question:</span> {item.questionText}
                  </p>
                  {item.feedback && (
                    <p className="text-xs text-black/80 leading-relaxed font-sans border-l-2 border-black/20 pl-3">
                      {item.feedback}
                    </p>
                  )}
                  {item.strengths.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Strengths</div>
                      <ul className="space-y-1">
                        {item.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-xs text-black/80 font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5 text-black/70 mt-0.5 shrink-0" />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.improvements.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Areas to Improve</div>
                      <ul className="space-y-1">
                        {item.improvements.map((improvement, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-xs text-black/80 font-sans">
                            <span className="w-3.5 h-3.5 text-black/70 mt-0.5 shrink-0 text-center text-[8px]">!</span>
                            <span>{improvement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Topic-wise Breakdown */}
          <div className="space-y-4">
            <h3 className="font-serif text-2xl italic font-normal text-black">
              Topic-wise Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {examReport.topicBreakdown?.map((tb, idx) => (
                <div key={idx} className="bg-white border border-black p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-serif italic text-black">{tb.topic}</div>
                    <div className="text-[9px] uppercase tracking-widest text-black/50 mt-1">Mastery level: {tb.mastery}</div>
                  </div>
                  <span className="font-mono text-xs font-bold text-white bg-black border border-black px-3 py-1">
                    {tb.score}/{tb.maxMarks}
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

          {/* Left: Question Navigation Matrix */}
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

              <div className="pt-3 text-center font-mono text-[10px] text-black/60 border-t border-black">
                {answeredCount} of {questions.length} answered
              </div>

              <div className="pt-3">
                <button
                  onClick={submitExam}
                  disabled={submitting}
                  className="w-full bg-black hover:bg-white hover:text-black disabled:hover:bg-black disabled:hover:text-white text-white disabled:opacity-60 border border-black py-3 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Grading with Gemini...</span>
                    </>
                  ) : (
                    <span>Submit &amp; Finish Exam</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Active Exam Question and Answer Box */}
          <div className="lg:col-span-9 space-y-6">
            {submitError && (
              <div className="bg-red-50 border border-black text-red-800 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

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