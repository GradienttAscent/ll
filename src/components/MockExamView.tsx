import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QuestionItem, MockExamRecord } from '../types';
import { Clock, RotateCcw, ChevronRight, ChevronLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

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
      <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">
        <div className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-8 sm:p-12 shadow-2xs text-center">
          <h1 className="font-serif text-3xl sm:text-4xl italic text-[#17151A] dark:text-[#F5F3F7]">No mock exam questions available yet</h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-3">Analyze previous papers in Upload &amp; Extract before starting a mock exam.</p>
        </div>
      </div>
    );
  }

  const timerLow = !examSubmitted && timeLeftSeconds > 0 && timeLeftSeconds <= 60;
  const answeredCount = Object.values(answers).filter((answer) => Boolean((answer as string).trim())).length;

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-fade-in pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-[#EDE7F3] dark:border-[#302B35] pb-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            Timed Mock Examination
          </h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 max-w-xl font-sans">
            Simulate real exam conditions under a timed environment using extracted questions. All answers are evaluated with detailed feedback on submission.
          </p>
        </div>

        {examStarted && !examSubmitted && (
          <div className="flex items-center space-x-2.5 bg-[#6D28D9] dark:bg-[#8B5CF6] text-white px-4 py-2.5 rounded-lg border border-[#5B21B6] dark:border-[#7C3AED] font-mono text-sm font-semibold shadow-xs self-start sm:self-auto">
            <Clock className={`w-4 h-4 ${timerLow ? 'animate-pulse text-amber-300' : 'text-white/80'}`} />
            <span className={timerLow ? 'text-amber-300' : 'text-white'}>{formatTimer(timeLeftSeconds)}</span>
          </div>
        )}
      </div>

      {!examStarted ? (
        /* Exam Pre-Start Screen */
        <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-8 sm:p-12 text-center space-y-8 max-w-2xl mx-auto shadow-2xs">
          <div className="space-y-3">
            <h2 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Ready for your Timed Mock Exam?
            </h2>
            <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] leading-relaxed font-sans max-w-md mx-auto">
              This mock exam consists of {questions.length} questions extracted from your analyzed papers
              (Total: {totalMax} Marks, Time Limit: {Math.round(totalDurationSeconds / 60)} Minutes).
            </p>
          </div>

          <div className="bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-6 text-left space-y-3 text-xs text-[#17151A] dark:text-[#F5F3F7] font-sans">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6D28D9] dark:text-[#A78BFA]">Exam Instructions:</div>
            <ul className="list-disc list-inside space-y-2 text-[#55524E] dark:text-[#A9A3AE]">
              <li>Timer will start immediately upon clicking &ldquo;Begin Mock Exam&rdquo;.</li>
              <li>You can navigate back and forth between questions anytime.</li>
              <li>The exam auto-submits when the timer reaches 00:00.</li>
              <li>Every question is graded with diagnostic feedback saved to your History.</li>
            </ul>
          </div>

          <button
            onClick={handleStartExam}
            className="w-full bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white py-3 rounded-lg font-medium text-xs tracking-wider transition-colors shadow-xs"
          >
            Begin Mock Exam
          </button>
        </div>
      ) : examSubmitted && examReport ? (
        /* Exam Results Report Screen */
        <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-8 sm:p-10 space-y-8 animate-fade-in shadow-xs">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-[#EDE7F3] dark:border-[#302B35] pb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
                Exam Results &amp; Grade Report
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7] mt-1">
                Mock Exam Summary
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480] mt-1">
                {examReport.answeredCount} of {questions.length} questions answered &bull; Saved to your History
              </p>
            </div>

            <div className="flex items-center space-x-6 bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-5 shadow-2xs">
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#7B7484] dark:text-[#7A7480] block">Score</span>
                <span className="font-serif text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">{examReport.totalScore}/{examReport.totalMax}</span>
              </div>
              <div className="h-10 w-px bg-[#EDE7F3] dark:bg-[#302B35]"></div>
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#7B7484] dark:text-[#7A7480] block">Percentage</span>
                <span className="font-serif text-3xl italic font-normal text-[#6D28D9] dark:text-[#A78BFA] font-bold">{examReport.percentage}%</span>
              </div>
              <div className="h-10 w-px bg-[#EDE7F3] dark:bg-[#302B35]"></div>
              <div className="text-center">
                <span className="text-[9px] uppercase font-bold tracking-widest text-[#7B7484] dark:text-[#7A7480] block">Grade</span>
                <span className="font-serif text-3xl italic font-normal text-[#6D28D9] dark:text-[#A78BFA] font-bold">{examReport.grade}</span>
              </div>
            </div>
          </div>

          {/* Feedback & Advice Box */}
          <div className="bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#A78BFA]">
              <span>Exam Feedback &amp; Advice</span>
            </div>
            <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] leading-relaxed font-sans">
              {examReport.advice || 'No overall feedback was generated for this exam.'}
            </p>
          </div>

          {/* Per-question Grading */}
          <div className="space-y-6">
            <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Question-by-Question Grading
            </h3>
            <div className="space-y-4">
              {examReport.perQuestion.map((item) => (
                <div key={item.id} className="bg-white dark:bg-[#17151A] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-4 border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
                    <div>
                      <span className="font-mono text-[10px] font-medium text-white bg-[#6D28D9] dark:bg-[#8B5CF6] px-2.5 py-0.5 rounded mr-2">
                        Q{item.position}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">{item.topicName}</span>
                    </div>
                    <span className="font-mono text-xs font-medium bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] border border-[#D8CCE8] dark:border-[#3E344A] px-3 py-1 rounded-lg">
                      {item.score}/{item.maxMarks} marks
                    </span>
                  </div>
                  <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] leading-relaxed font-sans">
                    <span className="font-bold">Question:</span> {item.questionText}
                  </p>
                  {item.feedback && (
                    <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] leading-relaxed font-sans border-l-2 border-[#6D28D9]/40 dark:border-[#8B5CF6]/40 pl-3">
                      {item.feedback}
                    </p>
                  )}
                  {item.strengths.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">Strengths</div>
                      <ul className="space-y-1">
                        {item.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.improvements.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Areas to Improve</div>
                      <ul className="space-y-1">
                        {item.improvements.map((improvement, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans">
                            <span className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 text-center text-[10px] font-bold">!</span>
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
            <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Topic-wise Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {examReport.topicBreakdown?.map((tb, idx) => (
                <div key={idx} className="bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-5 flex items-center justify-between shadow-2xs">
                  <div>
                    <div className="text-xs font-serif italic text-[#17151A] dark:text-[#F5F3F7] font-bold">{tb.topic}</div>
                    <div className="text-[9px] uppercase tracking-widest text-[#7B7484] dark:text-[#7A7480] mt-1">Mastery: {tb.mastery}</div>
                  </div>
                  <span className="font-mono text-xs font-medium text-[#6D28D9] dark:text-[#A78BFA] bg-[#EDE7F6] dark:bg-[#251E30] border border-[#D8CCE8] dark:border-[#3E344A] px-3 py-1 rounded-lg">
                    {tb.score}/{tb.maxMarks}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-[#EDE7F3] dark:border-[#302B35] flex justify-between">
            <button
              onClick={handleStartExam}
              className="bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white px-5 py-2.5 rounded-lg text-xs font-medium tracking-wider flex items-center space-x-2 transition-colors shadow-xs"
            >
              <RotateCcw className="w-4 h-4 text-white/80" />
              <span>Retake Mock Exam</span>
            </button>
          </div>

        </div>
      ) : (
        /* Active Exam Question Workspace */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left: Question Navigation Matrix */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-4 shadow-2xs">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
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
                      className={`p-3 rounded-lg border text-center transition-all ${
                        isCurrent
                          ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-transparent font-bold shadow-2xs'
                          : isAnswered
                          ? 'bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] border-[#D8CCE8] dark:border-[#3E344A] font-medium'
                          : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#7B7484] dark:text-[#7A7480] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E344A]'
                      }`}
                    >
                      <div className="text-xs">Q{idx + 1}</div>
                      <div className="text-[9px] font-mono opacity-80">{q.marks}M</div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 text-center font-mono text-[10px] text-[#7B7484] dark:text-[#7A7480] border-t border-[#EDE7F3] dark:border-[#302B35]">
                {answeredCount} of {questions.length} answered
              </div>

              <div className="pt-3">
                <button
                  onClick={submitExam}
                  disabled={submitting}
                  className="w-full bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white disabled:opacity-60 rounded-lg py-2.5 font-medium text-xs tracking-wider transition-colors flex items-center justify-center space-x-2 shadow-xs"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                      <span>Grading...</span>
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
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-red-800 dark:text-red-300 text-xs font-mono p-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 sm:p-8 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
                <span className="font-mono text-xs font-medium text-white bg-[#6D28D9] dark:bg-[#8B5CF6] px-3 py-1 rounded-lg">
                  Question {currentIndex + 1} of {questions.length} ({currentQ.marks} Marks)
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">{currentQ.topic}</span>
              </div>

              <h3 className="font-serif text-2xl sm:text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7] leading-snug">
                {currentQ.questionText}
              </h3>
            </div>

            <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 sm:p-8 space-y-3 shadow-2xs">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">Your Written Response</label>
              <textarea
                value={answers[currentQ.id] || ''}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your exam solution here..."
                rows={9}
                className="w-full bg-[#FAF8FC] dark:bg-[#1D1A21] rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#6D28D9] dark:focus:ring-[#8B5CF6] font-mono leading-relaxed transition-colors"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                className="bg-white dark:bg-[#1D1A21] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] text-[#17151A] dark:text-[#F5F3F7] px-4 py-2 text-xs font-medium flex items-center space-x-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] disabled:opacity-40 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4 text-[#7B7484] dark:text-[#7A7480]" />
                <span>Previous</span>
              </button>

              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="bg-white dark:bg-[#1D1A21] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] text-[#17151A] dark:text-[#F5F3F7] px-4 py-2 text-xs font-medium flex items-center space-x-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] disabled:opacity-40 transition-colors shadow-2xs"
              >
                <span>Next Question</span>
                <ChevronRight className="w-4 h-4 text-[#7B7484] dark:text-[#7A7480]" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};