import React, { useEffect, useState } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem, WhatToStudyItem, WhatToStudySourceMapping } from '../types';
import { FileUp, ArrowRight, Loader2, BookOpen, Calendar, ExternalLink, X } from 'lucide-react';

interface UploadExtractViewProps {
  papers: PastPaper[];
  topics: ExtractedTopic[];
  questions: QuestionItem[];
  onAcademicUpdated: () => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload?: () => void;
}

interface ActiveQuestionViewerData {
  questionText: string;
  questionNumber?: string;
  subpart?: string;
  paperTitle?: string;
  marks?: number;
  pageNumber?: number | null;
  topicName?: string;
  conceptTitle?: string;
  lectureSource: WhatToStudySourceMapping;
  parentItem?: WhatToStudyItem;
}

export const UploadExtractView: React.FC<UploadExtractViewProps> = ({
  topics,
  questions,
  onAcademicUpdated,
  setActiveTab,
  onOpenUpload,
}) => {
  const [whatToStudyItems, setWhatToStudyItems] = useState<WhatToStudyItem[]>([]);
  const [isLoadingWts, setIsLoadingWts] = useState(false);

  // Source Slide Viewer Modal State (for concept-level study)
  const [activeSourceItem, setActiveSourceItem] = useState<WhatToStudyItem | null>(null);

  // Question-to-Slide Navigation Modal State (when clicking any individual question)
  const [activeQuestionViewer, setActiveQuestionViewer] = useState<ActiveQuestionViewerData | null>(null);

  // Schedule Study Modal State
  const [schedulingItem, setSchedulingItem] = useState<WhatToStudyItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 10);
  });
  const [scheduleTime, setScheduleTime] = useState('19:00');
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState('');

  const hasSyllabusTopics = topics.some((topic) => topic.syllabusEvidence);

  const fetchWhatToStudy = async () => {
    setIsLoadingWts(true);
    try {
      const res = await fetch('/api/academic/what-to-study');
      if (res.ok) {
        const data = await res.json();
        setWhatToStudyItems(data.whatToStudy || []);
      }
    } catch (err) {
      console.error('Failed to load what to study ranking:', err);
    } finally {
      setIsLoadingWts(false);
    }
  };

  useEffect(() => {
    void fetchWhatToStudy();
  }, [questions.length, topics.length]);

  const groupedHierarchy = React.useMemo(() => {
    const map = new Map<string, WhatToStudyItem[]>();
    for (const item of whatToStudyItems) {
      const parent = item.unitTopic?.trim() || 'Curriculum Topics';
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(item);
    }
    return Array.from(map.entries()).map(([parentTopic, items]) => {
      const totalQuestions = items.reduce((s, it) => s + it.occurrences.length, 0);
      const totalMarks = items.reduce((s, it) => s + it.occurrences.reduce((ms, o) => ms + o.marks, 0), 0);
      return {
        parentTopic,
        items,
        totalQuestions,
        totalMarks,
      };
    });
  }, [whatToStudyItems]);

  const handleOpenQuestionSource = (
    q: {
      id?: string;
      text?: string;
      questionText?: string;
      questionNumber?: string;
      subpart?: string;
      marks?: number;
      pageNumber?: number | null;
      paperTitle?: string | null;
      topic?: string;
    },
    parentItem?: WhatToStudyItem
  ) => {
    const text = (q.text || q.questionText || '').trim();
    let lectureSource: WhatToStudySourceMapping = {
      mapped: false,
      unmappedReason: 'Source location not confidently mapped.',
    };
    let conceptTitle = parentItem?.conceptTitle;
    let topicName = q.topic || parentItem?.unitTopic;
    let matchedItem = parentItem;

    if (parentItem) {
      lectureSource = parentItem.lectureSource;
    } else {
      for (const item of whatToStudyItems) {
        const match = item.occurrences.find((o) => (q.id && o.questionId === q.id) || o.questionText === text);
        if (match) {
          lectureSource = item.lectureSource;
          conceptTitle = item.conceptTitle;
          topicName = topicName || item.unitTopic;
          matchedItem = item;
          break;
        }
      }
    }

    setActiveQuestionViewer({
      questionText: text,
      questionNumber: q.questionNumber,
      subpart: q.subpart,
      paperTitle: q.paperTitle || undefined,
      marks: q.marks,
      pageNumber: q.pageNumber,
      topicName,
      conceptTitle,
      lectureSource,
      parentItem: matchedItem,
    });
  };

  const handleScheduleStudySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingItem) return;

    setIsScheduling(true);
    try {
      let topicId = schedulingItem.topicId;
      if (!topicId) {
        const firstTopic = topics[0];
        topicId = firstTopic?.id;
      }
      if (!topicId) {
        const createTopicRes = await fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: schedulingItem.unitTopic || 'General Study', priority: 5, weightage: 10 }),
        });
        const createdTopicData = await createTopicRes.json();
        topicId = createdTopicData.topics[0].id;
      }

      const slideSuffix = schedulingItem.lectureSource.mapped && schedulingItem.lectureSource.slideRange
        ? ` (${schedulingItem.lectureSource.slideRange})`
        : '';
      const title = `${schedulingItem.conceptTitle}${slideSuffix}`;

      const res = await fetch('/api/schedule-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          title,
          date: scheduleDate,
          startTime: scheduleTime,
          durationMinutes: scheduleDuration,
          completed: false,
          blockType: 'study',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to schedule study block.');
      }

      setScheduleSuccessMsg(`Scheduled: ${title} on ${scheduleDate} at ${scheduleTime}`);
      setSchedulingItem(null);
      setTimeout(() => setScheduleSuccessMsg(''), 5000);
      await onAcademicUpdated();
    } catch (err: any) {
      alert(err.message || 'Unable to schedule study session.');
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#EDE7F3] dark:border-[#302B35] pb-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            Past Paper Extraction &amp; Topic Weightage
          </h1>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] mt-1.5 max-w-2xl font-sans">
            Teacher Intelligence analyzes your uploaded syllabus, lecture PPTs/PDFs, and previous exams together to identify what is most worth studying, with direct traceability back to the professor&apos;s original slides.
          </p>
        </div>

        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-all shadow-2xs active:scale-98 flex items-center gap-1.5 shrink-0"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload Academic Documents</span>
          </button>
        )}
      </div>

      {scheduleSuccessMsg && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between animate-fade-in">
          <span>{scheduleSuccessMsg}</span>
          <button
            onClick={() => setActiveTab('calendar')}
            className="text-[10px] font-bold uppercase tracking-wider underline hover:opacity-80"
          >
            View on Calendar &rarr;
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PRIMARY EXPERIENCE: WHAT TO STUDY */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
          <h2 className="font-serif text-2xl sm:text-3xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
            What to Study
          </h2>
          <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans mt-0.5">
            Ranked by exam repetition frequency, question marks, and grounded against verified lecture slides. Click any question to navigate directly to its lecture PPT slide.
          </p>
        </div>

        {isLoadingWts ? (
          <div className="py-16 text-center rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A]">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#7B7484] dark:text-[#A9A3AE]">
              <Loader2 className="w-4 h-4 animate-spin text-[#6D28D9] dark:text-[#8B5CF6]" />
              Synthesizing Teacher Intelligence and matching lecture slides...
            </div>
          </div>
        ) : whatToStudyItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-8 sm:p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] flex items-center justify-center mx-auto text-[#6D28D9] dark:text-[#8B5CF6]">
              <BookOpen className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="font-serif text-xl italic text-[#17151A] dark:text-[#F5F3F7]">
                No Academic Materials Analyzed Yet
              </h3>
              <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] leading-relaxed">
                Upload your course syllabus, lecture slides (PPT/PDF), and previous question papers to generate ranked study priorities with exact slide mappings.
              </p>
            </div>
            {onOpenUpload && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={onOpenUpload}
                  className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#5B21B6] transition flex items-center gap-1.5"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Upload Academic Documents</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {groupedHierarchy.map((group, gIdx) => {
              const groupNumber = String(gIdx + 1).padStart(2, '0');

              return (
                <div key={group.parentTopic} className="space-y-4">
                  {/* Parent Topic Header */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35]">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-[#6D28D9] dark:text-[#8B5CF6]">
                        {groupNumber}
                      </span>
                      <div>
                        <h3 className="font-serif text-xl sm:text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                          {group.parentTopic}
                        </h3>
                        <p className="text-[11px] font-sans text-[#7B7484] dark:text-[#807A87]">
                          {group.items.length} examinable concept{group.items.length === 1 ? '' : 's'} &middot; {group.totalQuestions} past exam questions ({group.totalMarks} marks)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Child Concepts grouped hierarchically */}
                  <div className="space-y-4 pl-3 sm:pl-6 border-l-2 border-[#EDE7F3] dark:border-[#302B35] ml-3 sm:ml-4">
                    {group.items.map((item, index) => {
                      const isLast = index === group.items.length - 1;
                      const branchSymbol = isLast ? '└──' : '├──';
                      const isHighPriority = item.priorityTag === 'HIGH PRIORITY';
                      const isRepeated = item.priorityTag === 'REPEATED FREQUENTLY';
                      const isMultiYear = item.priorityTag === 'APPEARED ACROSS MULTIPLE YEARS';

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 shadow-2xs hover:border-[#D8CCE8] dark:hover:border-[#4B4454] transition-all space-y-5"
                        >
                          {/* Top Bar: Branch Connector, Concept Title, Priority Tag */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[#6D28D9] dark:text-[#8B5CF6]">
                                  {branchSymbol}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                  isHighPriority
                                    ? 'bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#8B5CF6] border-[#D8CCE8] dark:border-[#4B4454]'
                                    : isRepeated
                                    ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                                    : isMultiYear
                                    ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/40'
                                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                                }`}>
                                  {item.priorityTag}
                                </span>
                                <span className="text-[11px] font-sans font-medium text-[#7B7484] dark:text-[#A9A3AE]">
                                  Appeared {item.appearanceCount} times{item.distinctYearsCount > 1 ? ` across ${item.distinctYearsCount} exams` : ''}{item.averageMarks ? ` • Avg ${item.averageMarks} marks` : ''}
                                </span>
                              </div>
                              <h4 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7] pl-5">
                                {item.conceptTitle}
                              </h4>
                            </div>

                            {/* Action Buttons */}
                            <div className="shrink-0 flex items-center gap-2 pt-1 sm:pt-0">
                              {item.lectureSource.mapped && (
                                <button
                                  onClick={() => setActiveSourceItem(item)}
                                  className="px-3.5 py-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] text-[#17151A] dark:text-[#F5F3F7] text-[10px] font-bold uppercase tracking-wider transition shadow-2xs"
                                >
                                  Open Source
                                </button>
                              )}
                              <button
                                onClick={() => setSchedulingItem(item)}
                                className="px-3.5 py-1.5 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white text-[10px] font-bold uppercase tracking-wider transition shadow-2xs flex items-center gap-1.5"
                              >
                                <Calendar className="w-3 h-3" />
                                <span>Schedule Study</span>
                              </button>
                            </div>
                          </div>

                          {/* Mid: Exam Occurrences Evidence & Lecture Material Mapping */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            {/* Column 1: Actual Previous Paper Occurrences */}
                            <div className="p-3.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-2">
                              <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                                Past-Paper Evidence ({item.occurrences.length}) &middot; Click to view slide
                              </div>
                              <div className="space-y-1.5">
                                {item.occurrences.map((occ, oIdx) => (
                                  <div
                                    key={oIdx}
                                    onClick={() => handleOpenQuestionSource({
                                      id: occ.questionId,
                                      questionText: occ.questionText,
                                      questionNumber: occ.questionNumber,
                                      subpart: occ.subpart,
                                      marks: occ.marks,
                                      pageNumber: occ.pageNumber,
                                      paperTitle: occ.paperTitle,
                                    }, item)}
                                    className="flex items-baseline justify-between text-xs gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-[#251E30] cursor-pointer transition border border-transparent hover:border-[#D8CCE8] dark:hover:border-[#4B4454] group"
                                    title="Click to view question & navigate directly to PPT slide"
                                  >
                                    <div className="flex items-baseline gap-2 min-w-0 pr-2">
                                      <span className="font-mono text-[11px] font-semibold text-[#6D28D9] dark:text-[#8B5CF6] group-hover:underline shrink-0">
                                        {occ.label}
                                      </span>
                                      <span className="text-[11px] text-[#55524E] dark:text-[#A9A3AE] truncate">
                                        {occ.questionText}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#7B7484] dark:text-[#807A87] shrink-0 font-mono">
                                      {occ.pageNumber ? `p.${occ.pageNumber} · ` : ''}{occ.marks} marks
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Column 2: Exact Professor Lecture Material / Slide Mapping */}
                            <div className="p-3.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1.5">
                              <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                                Study From
                              </div>
                              {item.lectureSource.mapped ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7]">
                                    {item.lectureSource.documentFileName || item.lectureSource.documentTitle} &middot; {item.lectureSource.slideRange}
                                  </div>
                                  <div className="text-[11px] font-mono font-semibold text-[#6D28D9] dark:text-[#8B5CF6]">
                                    {item.lectureSource.sectionTitle}
                                  </div>
                                  {item.lectureSource.slideSnippet && (
                                    <p className="text-[10.5px] text-[#55524E] dark:text-[#A9A3AE] line-clamp-2 italic pt-0.5">
                                      &ldquo;{item.lectureSource.slideSnippet}&rdquo;
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] italic pt-1">
                                  {item.lectureSource.unmappedReason || 'Source location not confidently mapped.'}
                                </p>
                              )}
                            </div>

                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 2. TOPIC WEIGHTAGE & QUESTION BANK (SUPPORTING VIEWS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Topic Weightage Section */}
        <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-4 shadow-2xs">
          <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
            <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Topic Weightage &amp; Trend Analysis
            </h3>
            <p className="text-xs text-[#7B7484] dark:text-[#807A87] font-sans mt-0.5">
              {hasSyllabusTopics
                ? 'Derived from course syllabus and past exam evidence.'
                : 'PYQ frequency trends. Uploading a syllabus will align these with course units.'}
            </p>
          </div>

          <div className="space-y-3">
            {topics.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-4">No topics mapped yet.</p>
            ) : (
              topics.slice(0, 6).map((t) => (
                <div key={t.id} className="p-3 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-serif text-lg italic text-[#17151A] dark:text-[#F5F3F7]">{t.name}</span>
                    <span className="text-[10px] font-mono text-[#7B7484] dark:text-[#807A87]">
                      {t.frequencyCount} questions &middot; {t.priorityScore}/10 priority
                    </span>
                  </div>
                  <div className="w-full bg-[#EDE7F6] dark:bg-[#251E30] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6D28D9] dark:bg-[#8B5CF6] rounded-full"
                      style={{ width: `${(t.priorityScore || 0) * 10}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Extracted Question Bank Preview */}
        <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
            <div>
              <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                Extracted Question Bank
              </h3>
              <p className="text-xs text-[#7B7484] dark:text-[#807A87] font-sans mt-0.5">
                {questions.length} individual exam questions stored &middot; Click any question to navigate to slide
              </p>
            </div>
            <button
              onClick={() => setActiveTab('practice')}
              className="text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#EDE7F3] dark:border-[#302B35] px-2.5 py-1 text-[#6D28D9] dark:text-[#8B5CF6] hover:bg-[#FAF8FC] dark:hover:bg-[#1D1A21] transition flex items-center gap-1"
            >
              <span>Practice</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {questions.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-4">No questions extracted yet.</p>
            ) : (
              questions.slice(0, 8).map((q) => (
                <div
                  key={q.id}
                  onClick={() => handleOpenQuestionSource(q)}
                  className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1 hover:border-[#6D28D9] dark:hover:border-[#8B5CF6] cursor-pointer transition group"
                  title="Click to view question & navigate directly to PPT slide"
                >
                  <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    <span className="font-semibold text-[#6D28D9] dark:text-[#8B5CF6] group-hover:underline">{q.topic || 'General'}</span>
                    <span>{q.questionNumber ? `Q${q.questionNumber} ` : ''}&bull; {q.marks} Marks</span>
                  </div>
                  <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] line-clamp-2">
                    {q.questionText}
                  </p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-[#7B7484]">
                    <span>{q.paperTitle || 'Previous Exam Paper'}</span>
                    <span className="text-[#6D28D9] dark:text-[#8B5CF6] font-medium flex items-center gap-0.5">
                      View Lecture Slide &rarr;
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL: QUESTION-TO-SLIDE DIRECT NAVIGATION VIEWER */}
      {/* ========================================================================= */}
      {activeQuestionViewer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl max-w-2xl w-full p-6 sm:p-8 space-y-6 relative max-h-[85vh] flex flex-col">
            
            <div className="flex items-start justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
                  Question &middot; PPT Slide Navigation
                </span>
                <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                  {activeQuestionViewer.conceptTitle || activeQuestionViewer.topicName || 'Exam Question'}
                </h3>
                <p className="text-xs text-[#55524E] dark:text-[#A9A3AE]">
                  {activeQuestionViewer.paperTitle || 'Exam Paper'} {activeQuestionViewer.pageNumber ? `(Page ${activeQuestionViewer.pageNumber})` : ''} &bull; {activeQuestionViewer.marks} marks
                </p>
              </div>
              <button
                onClick={() => setActiveQuestionViewer(null)}
                className="text-[#7B7484] hover:text-[#17151A] p-1.5 rounded-lg border border-transparent hover:border-[#EDE7F3]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              
              {/* Question Text Box */}
              <div className="p-4 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                  Exam Question {activeQuestionViewer.questionNumber ? `Q${activeQuestionViewer.questionNumber}${activeQuestionViewer.subpart ? `(${activeQuestionViewer.subpart})` : ''}` : ''}
                </div>
                <div className="text-xs text-[#17151A] dark:text-[#F5F3F7] font-sans leading-relaxed font-medium">
                  {activeQuestionViewer.questionText}
                </div>
              </div>

              {/* Direct PPT / Lecture Slide Section */}
              <div className="p-4 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] space-y-3 font-sans">
                <div className="text-xs font-bold text-[#17151A] dark:text-[#F5F3F7] flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Target Lecture PPT / Material
                  </span>
                  {activeQuestionViewer.lectureSource.mapped && (
                    <span className="font-mono text-[10px] font-bold text-[#6D28D9] dark:text-[#8B5CF6]">
                      {activeQuestionViewer.lectureSource.slideRange}
                    </span>
                  )}
                </div>

                {activeQuestionViewer.lectureSource.mapped ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7]">
                      {activeQuestionViewer.lectureSource.documentFileName || activeQuestionViewer.lectureSource.documentTitle} &middot; {activeQuestionViewer.lectureSource.sectionTitle}
                    </div>
                    {activeQuestionViewer.lectureSource.slideSnippet && (
                      <div className="text-xs text-[#333038] dark:text-[#E2DEE6] whitespace-pre-wrap leading-relaxed font-sans bg-[#FAF8FC] dark:bg-[#17151A] p-3 rounded-lg border border-[#EDE7F3] dark:border-[#302B35]">
                        {activeQuestionViewer.lectureSource.slideSnippet}
                      </div>
                    )}
                    {activeQuestionViewer.lectureSource.documentId && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={`/api/documents/${activeQuestionViewer.lectureSource.documentId}/file${activeQuestionViewer.lectureSource.startSlide ? `#page=${activeQuestionViewer.lectureSource.startSlide}` : ''}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-[#6D28D9] dark:text-[#8B5CF6] hover:underline font-semibold"
                        >
                          <span>Open presentation at {activeQuestionViewer.lectureSource.slideRange || `Slide ${activeQuestionViewer.lectureSource.startSlide}`}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <strong className="block font-semibold">Source location not confidently mapped.</strong>
                    <p className="text-[11px] text-[#55524E] dark:text-[#A9A3AE]">
                      This question does not have a confirmed slide mapping in the uploaded lecture slides. Upload the corresponding lecture presentation (PPT/PDF) to link this question directly to teaching slides.
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveQuestionViewer(null)}
                className="px-4 py-2 text-xs font-medium text-[#7B7484] hover:text-[#17151A]"
              >
                Close
              </button>
              {activeQuestionViewer.parentItem && (
                <button
                  onClick={() => {
                    const item = activeQuestionViewer.parentItem!;
                    setActiveQuestionViewer(null);
                    setSchedulingItem(item);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#5B21B6] transition flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Study for this Material</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: SOURCE MATERIAL / SLIDE VIEWER (CONCEPT LEVEL) */}
      {/* ========================================================================= */}
      {activeSourceItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl max-w-2xl w-full p-6 sm:p-8 space-y-6 relative max-h-[85vh] flex flex-col">
            
            <div className="flex items-start justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
                  {activeSourceItem.lectureSource.slideRange} &middot; Original Lecture Material
                </span>
                <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                  {activeSourceItem.conceptTitle}
                </h3>
                <p className="text-xs text-[#55524E] dark:text-[#A9A3AE]">
                  {activeSourceItem.lectureSource.documentFileName || activeSourceItem.lectureSource.documentTitle}
                </p>
              </div>
              <button
                onClick={() => setActiveSourceItem(null)}
                className="text-[#7B7484] hover:text-[#17151A] p-1.5 rounded-lg border border-transparent hover:border-[#EDE7F3]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Slide Content Box */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="p-4 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] space-y-3 font-sans">
                <div className="text-xs font-bold text-[#17151A] dark:text-[#F5F3F7] flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-2">
                  <span>Section: {activeSourceItem.lectureSource.sectionTitle}</span>
                  <span className="font-mono text-[10px] text-[#6D28D9] dark:text-[#8B5CF6]">
                    {activeSourceItem.lectureSource.slideRange}
                  </span>
                </div>
                <div className="text-xs text-[#333038] dark:text-[#E2DEE6] whitespace-pre-wrap leading-relaxed font-sans">
                  {activeSourceItem.lectureSource.slideSnippet || 'No snippet available.'}
                </div>
              </div>

              {activeSourceItem.occurrences && activeSourceItem.occurrences.length > 0 && (
                <div className="p-4 rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Exam Question Evidence &amp; Traceability ({activeSourceItem.occurrences.length} papers)
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeSourceItem.occurrences.map((occ, i) => (
                      <div key={i} className="text-xs border-b border-[#EDE7F3] dark:border-[#302B35] pb-2 last:border-none">
                        <div className="flex items-center justify-between font-mono font-semibold text-[#6D28D9] dark:text-[#8B5CF6] text-[11px]">
                          <span>{occ.label}</span>
                          <span>{occ.pageNumber ? `Page ${occ.pageNumber} · ` : ''}{occ.marks} marks</span>
                        </div>
                        <p className="text-[11px] text-[#55524E] dark:text-[#A9A3AE] pt-0.5 leading-relaxed">{occ.questionText}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSourceItem.lectureSource.documentId && (
                <div className="flex items-center justify-between text-xs text-[#7B7484] pt-1">
                  <span>Studying from professor&apos;s verified material.</span>
                  <a
                    href={`/api/documents/${activeSourceItem.lectureSource.documentId}/file${activeSourceItem.lectureSource.startSlide ? `#page=${activeSourceItem.lectureSource.startSlide}` : ''}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#6D28D9] dark:text-[#8B5CF6] hover:underline font-semibold text-[11px]"
                  >
                    <span>Open presentation at {activeSourceItem.lectureSource.slideRange || `Slide ${activeSourceItem.lectureSource.startSlide}`}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveSourceItem(null)}
                className="px-4 py-2 text-xs font-medium text-[#7B7484] hover:text-[#17151A]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const target = activeSourceItem;
                  setActiveSourceItem(null);
                  setSchedulingItem(target);
                }}
                className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#5B21B6] transition flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule Study for this Material</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL: SCHEDULE STUDY BLOCK (CONNECTS DIRECTLY TO CALENDAR) */}
      {/* ========================================================================= */}
      {schedulingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={(e) => void handleScheduleStudySubmit(e)}
            className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl max-w-md w-full p-6 space-y-5 relative"
          >
            <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
                  Schedule Focus Study
                </span>
                <h3 className="font-serif text-xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                  {schedulingItem.conceptTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingItem(null)}
                className="text-[#7B7484] hover:text-[#17151A] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                  Target Exam Concept
                </label>
                <div className="p-2.5 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-[#17151A] dark:text-[#F5F3F7] font-medium">
                  {schedulingItem.conceptTitle}
                  {schedulingItem.lectureSource.mapped && (
                    <span className="text-[#6D28D9] dark:text-[#8B5CF6] block text-[11px] font-mono mt-0.5">
                      {schedulingItem.lectureSource.slideRange} &middot; {schedulingItem.lectureSource.sectionTitle}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Duration
                  </label>
                  <select
                    value={scheduleDuration}
                    onChange={(e) => setScheduleDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSchedulingItem(null)}
                className="px-3 py-1.5 text-xs text-[#7B7484] hover:text-[#17151A]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isScheduling}
                className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#5B21B6] transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                <span>{isScheduling ? 'Scheduling...' : 'Add to Calendar'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
