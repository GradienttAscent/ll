import React, { useEffect, useRef, useState } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem, WhatToStudyItem } from '../types';
import { FileUp, FileText, CheckCircle2, ArrowRight, Loader2, BookOpen, Calendar, Clock, ExternalLink, X, Plus } from 'lucide-react';
import { filterQuestionBank } from '../utils/questionBankFilters';

interface UploadExtractViewProps {
  papers: PastPaper[];
  topics: ExtractedTopic[];
  questions: QuestionItem[];
  onAcademicUpdated: () => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
  openUploaderRequest?: number;
}

export const UploadExtractView: React.FC<UploadExtractViewProps> = ({
  papers,
  topics,
  questions,
  onAcademicUpdated,
  setActiveTab,
  openUploaderRequest,
}) => {
  const [whatToStudyItems, setWhatToStudyItems] = useState<WhatToStudyItem[]>([]);
  const [isLoadingWts, setIsLoadingWts] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<PastPaper | null>(papers[0] || null);
  const [inputText, setInputText] = useState('');
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus' | 'Lecture Slides'>('Past Paper');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [fileError, setFileError] = useState('');
  const [materialFiles, setMaterialFiles] = useState<Record<'syllabus' | 'lecture' | 'past_paper', File[]>>({ syllabus: [], lecture: [], past_paper: [] });
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [materialAnalysis, setMaterialAnalysis] = useState<any>(null);
  const [sourceLocation, setSourceLocation] = useState<any>(null);
  const [questionFilter, setQuestionFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [paperFilter, setPaperFilter] = useState('');
  const [marksFilter, setMarksFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const uploadFormRef = useRef<HTMLElement | null>(null);

  // Source Slide Viewer Modal State
  const [activeSourceItem, setActiveSourceItem] = useState<WhatToStudyItem | null>(null);

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
  const visibleQuestions = filterQuestionBank(questions, { topic: questionFilter, year: yearFilter, paper: paperFilter, marks: marksFilter, difficulty: difficultyFilter, source: sourceFilter });

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
  }, [papers.length, questions.length, topics.length]);

  useEffect(() => {
    if (openUploaderRequest) setShowUploadForm(true);
  }, [openUploaderRequest]);

  useEffect(() => {
    if (showUploadForm) uploadFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showUploadForm]);

  useEffect(() => {
    fetch('/api/materials/analysis').then(async (response) => response.ok ? response.json() : null)
      .then((data) => setMaterialAnalysis(data?.analysis || null)).catch(() => setMaterialAnalysis(null));
  }, [papers.length, questions.length, topics.length]);

  const openOccurrence = async (occurrence: any) => {
    const document = materialAnalysis?.documents?.find((item: any) => item.id === occurrence.documentId);
    if (!document) return;
    if (document.mimeType === 'application/pdf') {
      const response = await fetch(`/api/documents/${document.id}/file`);
      if (!response.ok) throw new Error('Unable to open the selected PDF page.');
      const pdfUrl = URL.createObjectURL(await response.blob());
      setSourceLocation({ document, location: { ...occurrence, locationStart: occurrence.locationStart, locationEnd: occurrence.locationEnd }, pdfUrl });
      return;
    }
    const response = await fetch(`/api/materials/${document.id}/locations`);
    const data = await response.json();
    const location = data.locations?.find((item: any) => item.locationStart === occurrence.locationStart) || data.locations?.[0];
    if (location?.locationType === 'slide') {
      const rendered = await fetch(`/api/materials/${document.id}/slides/${location.locationStart}.svg`);
      if (!rendered.ok) throw new Error('Unable to render the selected slide.');
      setSourceLocation({ document, location, slideUrl: URL.createObjectURL(await rendered.blob()) });
    } else setSourceLocation({ document, location });
  };

  const fileAsBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  };

  const handleRunAnalysis = async () => {
    const allFiles = Object.values(materialFiles).flat();
    if (allFiles.length === 0) {
      alert('Choose at least one course material file.');
      return;
    }
    if (fileError) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const res = await fetch('/api/materials/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: await Promise.all((['syllabus', 'lecture', 'past_paper'] as const).flatMap((category) => materialFiles[category].map(async (file) => ({ title: file.name, category, base64: await fileAsBase64(file), mimeType: file.type || undefined })))) }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to persist academic document.');
      const analysis = json.analysis;
      setAnalysisResult({
        title: 'Academic document saved',
        summary: `${json.results.filter((item: any) => item.reparsed).length} new files analyzed; ${json.results.filter((item: any) => item.status === 'duplicate').length} duplicates skipped.`,
      });
      await onAcademicUpdated();
      await fetchWhatToStudy();
      setInputText('');
      setMaterialFiles({ syllabus: [], lecture: [], past_paper: [] });
      setDocName('');
      setShowUploadForm(false);
    } catch (err) {
      console.error('Failed to run AI document analysis:', err);
      alert(err instanceof Error ? err.message : 'Unable to analyze the selected materials.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (category: 'syllabus' | 'lecture' | 'past_paper', files: FileList | null) => {
    if (!files) return;
    setMaterialFiles((current) => ({ ...current, [category]: [...current[category], ...Array.from(files)] }));
    setFileError('');
  };

  const handleScheduleStudySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingItem) return;

    setIsScheduling(true);
    try {
      // Find or create topic ID
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
            LL analyzes your syllabus, lecture PPTs/PDFs, and previous exams together to identify what is most worth studying, with direct traceability back to the professor&apos;s original slides.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-all shadow-2xs active:scale-98 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Material</span>
          </button>
        </div>
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

      {analysisResult && (
        <div className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21] p-4 text-xs text-[#17151A] dark:text-[#F5F3F7] flex items-center justify-between animate-fade-in">
          <div>
            <strong className="font-semibold block">{analysisResult.title}</strong>
            <span className="text-[#55524E] dark:text-[#A9A3AE] text-[11px]">{analysisResult.summary}</span>
          </div>
          <button
            onClick={() => setAnalysisResult(null)}
            className="text-[#7B7484] hover:text-[#17151A] p-1"
          >
            <X className="w-3.5 h-3.5" />
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
            Based on your syllabus, lecture material and previous exams.
          </p>
        </div>

        {isLoadingWts ? (
          <div className="py-16 text-center rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A]">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#7B7484] dark:text-[#A9A3AE]">
              <Loader2 className="w-4 h-4 animate-spin text-[#6D28D9] dark:text-[#8B5CF6]" />
              Analyzing exam repetitions and lecture slides...
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
                Provide your course syllabus, lecture slides (PPT/PDF), and previous question papers to generate ranked study priorities with exact slide mappings.
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => setShowUploadForm(true)}
                className="px-4 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] text-[10px] font-bold uppercase tracking-wider hover:border-[#D8CCE8] transition"
              >
                Upload Your Material
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {whatToStudyItems.map((item, index) => {
              const itemNumber = String(index + 1).padStart(2, '0');
              const isHighPriority = item.priorityTag === 'HIGH PRIORITY';
              const isRepeated = item.priorityTag === 'REPEATED FREQUENTLY';
              const isMultiYear = item.priorityTag === 'APPEARED ACROSS MULTIPLE YEARS';

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] p-6 shadow-2xs hover:border-[#D8CCE8] dark:hover:border-[#4B4454] transition-all space-y-5"
                >
                  {/* Top Bar: Number, Title, Priority Tag */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-[#7B7484] dark:text-[#807A87]">
                          {itemNumber}
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
                          Appeared {item.appearanceCount} times
                        </span>
                      </div>
                      <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                        {item.conceptTitle}
                      </h3>
                      <div className="text-[11px] font-sans text-[#55524E] dark:text-[#A9A3AE]">
                        {item.unitTopic}
                      </div>
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
                        Past-Paper Evidence ({item.occurrences.length})
                      </div>
                      <div className="space-y-1.5">
                        {item.occurrences.map((occ, oIdx) => (
                          <div
                            key={oIdx}
                            className="flex items-baseline justify-between text-xs gap-2"
                          >
                            <span className="font-mono text-[11px] font-semibold text-[#17151A] dark:text-[#F5F3F7]">
                              {occ.label}
                            </span>
                            <span className="text-[10px] text-[#7B7484] dark:text-[#807A87] shrink-0">
                              {occ.marks} marks
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
                            {item.lectureSource.documentTitle}
                          </div>
                          <div className="text-[11px] font-mono font-semibold text-[#6D28D9] dark:text-[#8B5CF6]">
                            {item.lectureSource.slideRange} &middot; {item.lectureSource.sectionTitle}
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
        )}
      </section>

      {materialAnalysis && materialAnalysis.topics?.length > 0 && (
        <section className="space-y-4">
          <div className="border-b border-[#EDE7F3] dark:border-[#302B35] pb-3"><h2 className="font-serif text-2xl italic">Topic to Source/Page Map</h2><p className="text-xs text-[#7B7484]">Every deterministic occurrence. Best Match is highlighted; possible matches remain visible.</p></div>
          {materialAnalysis.topics.map((topic: any) => <div key={topic.id} className="rounded-xl border border-[#EDE7F3] dark:border-[#302B35] p-4 space-y-2">
            <div className="flex justify-between"><strong>{topic.name}</strong><span className="text-xs">Priority {topic.priority}/100 · {topic.trend}</span></div>
            <div className="flex flex-wrap gap-2">{topic.occurrences.map((occurrence: any) => <button key={occurrence.id || `${occurrence.documentId}-${occurrence.locationStart}`} onClick={() => void openOccurrence(occurrence)} className={`text-xs rounded border px-2 py-1 ${occurrence.isBestMatch ? 'border-[#6D28D9] text-[#6D28D9]' : 'border-[#EDE7F3]'}`}>
              {occurrence.title} · {occurrence.locationType === 'section' ? `${occurrence.sectionTitle || 'Section'} · Paragraphs` : occurrence.locationType === 'slide' ? 'Slide' : occurrence.locationType === 'line' ? 'Lines' : 'Page'} {occurrence.locationStart}{occurrence.locationEnd !== occurrence.locationStart ? `–${occurrence.locationEnd}` : ''} {occurrence.isBestMatch ? '[Best Match]' : occurrence.confidence < .7 ? `Possible match · ${Math.round(occurrence.confidence * 100)}%` : ''}
            </button>)}</div>
          </div>)}
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2. UPLOAD & INGESTION FORM (COLLAPSIBLE OR ACCORDION) */}
      {/* ========================================================================= */}
      {showUploadForm && (
        <section ref={uploadFormRef} className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] p-6 space-y-5 shadow-2xs animate-fade-in">
          <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
            <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
              Upload Academic Material
            </h3>
            <button
              onClick={() => setShowUploadForm(false)}
              className="text-[#7B7484] hover:text-[#17151A] p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {([['syllabus', 'Course Syllabus', '.pdf,.jpg,.jpeg,.png'], ['lecture', 'Lecture Materials', '.pdf,.ppt,.pptx,.docx,.txt,.jpg,.jpeg,.png'], ['past_paper', 'Past Papers', '.pdf,.jpg,.jpeg,.png']] as const).map(([category, label, accept]) => (
              <div className="space-y-1.5" key={category}>
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">{label}</label>
                <input id={`material-${category}`} type="file" multiple accept={accept} onChange={(event) => handleFileUpload(category, event.target.files)} className="sr-only" />
                <label htmlFor={`material-${category}`} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#6D28D9] bg-[#F5F0FF] px-3 py-2 text-xs font-bold text-[#5B21B6] hover:bg-[#EDE7F6] dark:bg-[#251E30] dark:text-[#C4B5FD]">
                  <FileUp className="w-4 h-4" /> Choose files
                </label>
                <p className="text-[10px] text-[#7B7484]">{category === 'syllabus' ? 'PDF, JPG or PNG' : accept.replaceAll('.', '').replaceAll(',', ', ').toUpperCase()}</p>
                {materialFiles[category].length > 0 && <p className="text-[10px] text-[#7B7484]">{materialFiles[category].map((file) => file.name).join(', ')}</p>}
              </div>
            ))}


            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="px-3 py-1.5 text-xs text-[#7B7484] hover:text-[#17151A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={isAnalyzing || (Object.values(materialFiles) as File[][]).every((files) => files.length === 0)}
                className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition"
              >
                {isAnalyzing ? 'Analyzing...' : 'Save & Analyze'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. TOPIC WEIGHTAGE & QUESTION BANK (SUPPORTING VIEWS) */}
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
            <p className="text-[10px] text-[#7B7484] mt-1">Priority /100 = syllabus weightage 25% + PYQ frequency 25% + PYQ marks 25% + recurrence 15% + lecture coverage 10%.</p>
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
                {questions.length} individual exam questions stored
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
          <div className="grid grid-cols-2 gap-2"><select aria-label="Filter topic" value={questionFilter} onChange={(event) => setQuestionFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2">
            <option value="">All topics</option>{[...new Set(questions.map((question) => question.topic))].map((topic) => <option key={topic} value={topic}>{topic}</option>)}
          </select><select aria-label="Filter year" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2"><option value="">All years</option>{[...new Set(questions.map((question) => question.year).filter(Boolean))].map((year) => <option key={year} value={year}>{year}</option>)}</select><select aria-label="Filter paper" value={paperFilter} onChange={(event) => setPaperFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2"><option value="">All papers</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select><select aria-label="Filter marks" value={marksFilter} onChange={(event) => setMarksFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2"><option value="">All marks</option>{[...new Set(questions.map((question) => String(question.marks)))].map((marks) => <option key={marks} value={marks}>{marks} marks</option>)}</select><select aria-label="Filter difficulty" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2"><option value="">All difficulty</option>{[...new Set(questions.map((question) => question.type))].map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}</select><select aria-label="Filter source" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="text-xs rounded border border-[#EDE7F3] p-2"><option value="">All sources</option><option value="past_paper">Real PYQ</option><option value="ai_generated">AI Generated</option></select></div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {visibleQuestions.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-4">No questions extracted yet.</p>
            ) : (
              visibleQuestions.slice(0, 50).map((q) => (
                <div key={q.id} className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1">
                  <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    <span className="font-semibold text-[#6D28D9] dark:text-[#8B5CF6]">{q.topic || 'General'} · {q.sourceType === 'ai_generated' ? 'AI Generated' : 'Real PYQ'}</span>
                    <span>{q.questionNumber ? `Q${q.questionNumber}${q.subpart ? `(${q.subpart})` : ''} ` : ''}&bull; {q.marks} Marks {q.year ? `· ${q.year}` : ''} {q.pageNumber ? `· p.${q.pageNumber}` : ''}</span>
                  </div>
                  <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] line-clamp-2">
                    {q.questionText}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL: SOURCE MATERIAL / SLIDE VIEWER */}
      {/* ========================================================================= */}
      {sourceLocation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="max-w-3xl w-full max-h-[80vh] overflow-auto bg-white dark:bg-[#17151A] rounded-xl p-6 space-y-3">
          <div className="flex justify-between"><div><strong>{sourceLocation.document.title}</strong><p className="text-xs">{sourceLocation.location.locationType === 'slide' ? 'Slide' : sourceLocation.location.locationType === 'line' ? 'Lines' : 'Page'} {sourceLocation.location.locationStart}{sourceLocation.location.locationEnd !== sourceLocation.location.locationStart ? `–${sourceLocation.location.locationEnd}` : ''}</p></div><button onClick={() => { if (sourceLocation.pdfUrl) URL.revokeObjectURL(sourceLocation.pdfUrl); setSourceLocation(null); }}>Close</button></div>
          {sourceLocation.pdfUrl ? <iframe title={`PDF page ${sourceLocation.location.locationStart}`} className="w-full h-[65vh] rounded-lg border border-[#EDE7F3]" src={`${sourceLocation.pdfUrl}#page=${sourceLocation.location.locationStart}`} /> : sourceLocation.location.locationType === 'slide' ? <img className="w-full rounded-lg border border-[#EDE7F3]" alt={`Rendered slide ${sourceLocation.location.locationStart}`} src={sourceLocation.slideUrl} /> : <div className={sourceLocation.location.locationType === 'section' ? 'border-l-4 border-[#6D28D9] bg-[#FAF8FC] p-4' : ''}><p className="text-xs font-semibold mb-2">{sourceLocation.location.sectionTitle || ''}{sourceLocation.location.locationType === 'section' ? ` · Paragraphs ${sourceLocation.location.locationStart}–${sourceLocation.location.locationEnd}` : ''}</p><pre className="whitespace-pre-wrap text-xs leading-relaxed">{sourceLocation.location.text}</pre></div>}
        </div></div>
      )}
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
                  {activeSourceItem.lectureSource.documentTitle}
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

              {activeSourceItem.lectureSource.documentId && (
                <div className="flex items-center justify-between text-xs text-[#7B7484] pt-1">
                  <span>Studying from professor&apos;s verified material.</span>
                  <a
                    href={`/api/documents/${activeSourceItem.lectureSource.documentId}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#6D28D9] dark:text-[#8B5CF6] hover:underline font-semibold text-[11px]"
                  >
                    <span>Open full document stream</span>
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
            onSubmit={handleScheduleStudySubmit}
            className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl max-w-md w-full p-6 sm:p-7 space-y-5 relative"
          >
            <div className="flex items-start justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-3">
              <div>
                <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                  Schedule Study
                </h3>
                <p className="text-xs text-[#55524E] dark:text-[#A9A3AE] font-sans mt-0.5">
                  Adds a study block to your personal calendar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingItem(null)}
                className="text-[#7B7484] hover:text-[#17151A] p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Target Concept & Slides */}
              <div className="p-3 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9] dark:text-[#8B5CF6]">
                  Concept &amp; Source
                </div>
                <div className="text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7]">
                  {schedulingItem.conceptTitle}
                </div>
                {schedulingItem.lectureSource.mapped && (
                  <div className="text-[11px] font-mono text-[#55524E] dark:text-[#A9A3AE]">
                    {schedulingItem.lectureSource.documentTitle} &middot; {schedulingItem.lectureSource.slideRange}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                  Study Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                  required
                />
              </div>

              {/* Time & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    Duration
                  </label>
                  <select
                    value={scheduleDuration}
                    onChange={(e) => setScheduleDuration(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9]"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={120}>120 minutes</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-[#EDE7F3] dark:border-[#302B35] pt-4 flex items-center justify-end gap-2">
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
                className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition shadow-2xs"
              >
                {isScheduling ? 'Adding...' : 'Schedule Event'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
