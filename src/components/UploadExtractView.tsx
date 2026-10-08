import React, { useEffect, useRef, useState } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem, WhatToStudyItem } from '../types';
import { FileUp, FileText, CheckCircle2, ArrowRight, Loader2, BookOpen, Calendar, Clock, ExternalLink, X, Plus } from 'lucide-react';

interface UploadExtractViewProps {
  papers: PastPaper[];
  topics: ExtractedTopic[];
  questions: QuestionItem[];
  onAcademicUpdated: () => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;
}

export const UploadExtractView: React.FC<UploadExtractViewProps> = ({
  papers,
  topics,
  questions,
  onAcademicUpdated,
  setActiveTab,
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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const uploadFormRef = useRef<HTMLDivElement>(null);

  const toggleUploadForm = () => {
    setShowUploadForm((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          uploadFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      return next;
    });
  };

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
  const demoFileNames = ['syll2.pdf', 'mid sem 2025.pdf', 'lect3.agile sw dev', 'lect4.req eng'];
  const uploadedDemoFileCount = new Set(
    papers.flatMap((paper) => demoFileNames.filter((name) => paper.title.toLowerCase().includes(name))),
  ).size;
  const hasPartialDemoPack = uploadedDemoFileCount > 0 && uploadedDemoFileCount < 3;

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

  const fileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });

  const handleRunAnalysis = async () => {
    if (uploadedFiles.length === 0 && !inputText.trim() && !selectedPaper) {
      alert('Please select files to upload, enter document content, or select an uploaded paper.');
      return;
    }
    if (fileError) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      if (uploadedFiles.length > 0) {
        let totalQuestions = 0;
        const processed: { name: string }[] = [];
        const failed: { name: string; error: string }[] = [];

        for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i];
          setUploadProgressMsg(`Processing file ${i + 1} of ${uploadedFiles.length}: ${file.name}...`);
          try {
            const title = uploadedFiles.length === 1 && docName.trim() ? docName.trim() : file.name;
            const res = await fetch('/api/academic-documents/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                docType,
                base64: await fileAsBase64(file),
                mimeType: file.type || undefined,
                fileName: file.name,
              }),
            });
            const json = await res.json();
            if (!res.ok) {
              failed.push({ name: file.name, error: json.error || 'Failed to extract document' });
            } else {
              totalQuestions += json.analysis?.createdQuestionCount || 0;
              processed.push({ name: file.name });
            }
          } catch (err: any) {
            failed.push({ name: file.name, error: err.message || 'Network error' });
          }
        }

        if (failed.length > 0 && processed.length === 0) {
          throw new Error(`Failed to upload files: ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`);
        }

        setAnalysisResult({
          title: failed.length > 0 ? 'Documents partially saved' : 'Academic documents saved',
          summary: `${processed.length} of ${uploadedFiles.length} document${uploadedFiles.length > 1 ? 's' : ''} saved successfully (${totalQuestions} total questions indexed).${failed.length > 0 ? ` Failed: ${failed.map((f) => f.name).join(', ')}` : ''}`,
        });
      } else {
        const contentToAnalyze = inputText || selectedPaper?.parsedContent || '';
        const nameToAnalyze = docName || selectedPaper?.title || 'Academic Paper';

        const res = await fetch('/api/academic-documents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: nameToAnalyze,
            docType,
            content: contentToAnalyze,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unable to persist academic document.');
        const analysis = json.analysis;
        setAnalysisResult({
          title: 'Academic document saved',
          summary: `${analysis.createdQuestionCount} questions were persisted from the uploaded text. Topic evidence and marks were calculated from those stored questions.`,
        });
      }

      await onAcademicUpdated();
      await fetchWhatToStudy();
      setInputText('');
      setUploadedFiles([]);
      setDocName('');
      setShowUploadForm(false);
    } catch (err: any) {
      console.error('Failed to run document analysis:', err);
      alert(err.message || 'Error analyzing document. Please try again.');
    } finally {
      setIsAnalyzing(false);
      setUploadProgressMsg('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      setUploadedFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
        const filtered = files.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));
        return [...prev, ...filtered];
      });
      setSelectedPaper(null);
      setFileError('');
      setInputText('');
      if (files.length === 1 && !docName) {
        setDocName(files[0].name);
      }
    }
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setUploadedFiles([]);
    setDocName('');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    if (files.length > 0) {
      setUploadedFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
        const filtered = files.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));
        return [...prev, ...filtered];
      });
      setSelectedPaper(null);
      setFileError('');
      setInputText('');
      if (files.length === 1 && !docName) {
        setDocName(files[0].name);
      }
    }
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
            onClick={toggleUploadForm}
            className={`rounded-lg px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-all shadow-2xs active:scale-98 flex items-center gap-1.5 ${
              showUploadForm
                ? 'bg-[#5B21B6] text-white border border-[#5B21B6]'
                : 'bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] dark:hover:bg-[#7C3AED] text-white'
            }`}
          >
            {showUploadForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showUploadForm ? 'Close Upload Form' : 'Upload Material'}</span>
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
      {/* UPLOAD & INGESTION FORM (MOVED TO TOP FOR IMMEDIATE VISIBILITY) */}
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
            {/* Document Type Selector (3 Types) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">
                Document Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDocType('Past Paper')}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    docType === 'Past Paper'
                      ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-[#6D28D9] dark:border-[#8B5CF6] shadow-2xs'
                      : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                  }`}
                >
                  Past Question Paper
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('Lecture Slides')}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    docType === 'Lecture Slides'
                      ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-[#6D28D9] dark:border-[#8B5CF6] shadow-2xs'
                      : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                  }`}
                >
                  Lecture Slides / PPT / Notes
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('Syllabus')}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    docType === 'Syllabus'
                      ? 'bg-[#6D28D9] dark:bg-[#8B5CF6] text-white border-[#6D28D9] dark:border-[#8B5CF6] shadow-2xs'
                      : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                  }`}
                >
                  Course Syllabus
                </button>
              </div>
            </div>

            {/* Document Title */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">
                Document Title {uploadedFiles.length > 1 ? '(Optional batch prefix)' : ''}
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder={uploadedFiles.length > 1 ? 'Optional (defaults to individual file names)' : 'e.g. 2024 End Semester Exam, OS Unit 4 Slides, Course Syllabus...'}
                className="w-full text-xs px-3 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] placeholder:text-[#9E94AB] focus:outline-none focus:border-[#6D28D9]"
              />
            </div>

            {/* File Upload Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">
                  Upload PDF / PPTX / Text Files
                </label>
                {uploadedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFiles}
                    className="text-[10px] text-red-500 hover:text-red-600 font-semibold transition"
                  >
                    Clear All ({uploadedFiles.length})
                  </button>
                )}
              </div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-4 rounded-xl border border-dashed text-center transition-colors ${
                  isDragging
                    ? 'border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6]/50 dark:bg-[#251E30]/50'
                    : 'border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC] dark:bg-[#1D1A21]'
                }`}
              >
                <input
                  type="file"
                  id="academic-file-input"
                  onChange={handleFileUpload}
                  accept=".pdf,.txt,.pptx,.docx"
                  multiple
                  className="hidden"
                />
                <label
                  htmlFor="academic-file-input"
                  className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-xs font-semibold text-[#17151A] dark:text-[#F5F3F7] hover:border-[#D8CCE8] shadow-2xs transition"
                >
                  <FileUp className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#8B5CF6]" />
                  <span>{uploadedFiles.length > 0 ? '+ Add More Files' : 'Choose Files (Multiple PDFs, PPTXs, TXT)'}</span>
                </label>
                <p className="text-[10px] text-[#7B7484] dark:text-[#807A87] mt-1.5">
                  Select one or multiple past papers, lecture slides, or syllabi (or drag &amp; drop here)
                </p>

                {uploadedFiles.length > 0 && (
                  <div className="mt-3.5 space-y-1.5 text-left max-h-48 overflow-y-auto pr-1">
                    {uploadedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-[#17151A] border border-[#EDE7F3] dark:border-[#302B35] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <FileText className="w-3.5 h-3.5 shrink-0 text-[#6D28D9] dark:text-[#8B5CF6]" />
                          <span className="truncate text-[#17151A] dark:text-[#F5F3F7] font-medium text-[11px]" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-[10px] text-[#7B7484] dark:text-[#807A87] shrink-0 font-mono">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-[#7B7484] hover:text-red-500 transition"
                          title="Remove file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="text-[10px] text-[#7B7484] dark:text-[#807A87] text-right font-medium pt-1">
                      Total: {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} ({(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)} MB)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content Textarea (Optional if uploading file) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7B7484] dark:text-[#807A87]">
                Or Paste Content Directly
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste exam questions, slide text, or syllabus units here..."
                rows={5}
                className="w-full text-xs font-mono p-3 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] text-[#17151A] dark:text-[#F5F3F7] placeholder:text-[#9E94AB] focus:outline-none focus:border-[#6D28D9]"
              />
            </div>

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
                disabled={isAnalyzing || (uploadedFiles.length === 0 && !inputText.trim())}
                className="px-4 py-2 rounded-lg bg-[#6D28D9] dark:bg-[#8B5CF6] hover:bg-[#5B21B6] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadProgressMsg || 'Analyzing...'}</span>
                  </>
                ) : (
                  <span>
                    {uploadedFiles.length > 1
                      ? `Save & Analyze (${uploadedFiles.length} Files)`
                      : 'Save & Analyze'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>
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
                          Appeared {item.appearanceCount} times{item.importanceScore ? ` • Score ${item.importanceScore}%` : ''}
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

      {/* ========================================================================= */}
      {/* 3. TOPIC WEIGHTAGE & QUESTION BANK (SUPPORTING VIEWS) */}
      {/* ========================================================================= */}
      {!hasPartialDemoPack && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
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

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {questions.length === 0 ? (
              <p className="text-xs text-[#7B7484] dark:text-[#A9A3AE] py-4">No questions extracted yet.</p>
            ) : (
              questions.slice(0, 8).map((q) => (
                <div key={q.id} className="p-2.5 rounded-xl bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] space-y-1">
                  <div className="flex items-center justify-between text-[9.5px] uppercase tracking-wider text-[#7B7484] dark:text-[#807A87]">
                    <span className="font-semibold text-[#6D28D9] dark:text-[#8B5CF6]">{q.topic || 'General'}</span>
                    <span>{q.questionNumber ? `Q${q.questionNumber} ` : ''}&bull; {q.marks} Marks</span>
                  </div>
                  <p className="text-xs text-[#17151A] dark:text-[#F5F3F7] line-clamp-2">
                    {q.questionText}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>}

      {/* ========================================================================= */}
      {/* 4. MODAL: SOURCE MATERIAL / SLIDE VIEWER */}
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
