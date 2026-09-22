import React, { useState } from 'react';
import { ActiveTab, PastPaper, ExtractedTopic, QuestionItem } from '../types';
import { FileUp, FileText, CheckCircle2, BarChart3, ArrowRight, BookOpen, Loader2 } from 'lucide-react';

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
  setActiveTab
}) => {
  const [selectedPaper, setSelectedPaper] = useState<PastPaper | null>(papers[0] || null);
  const [inputText, setInputText] = useState('');
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus'>('Past Paper');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [fileError, setFileError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isSampleMode, setIsSampleMode] = useState(false);
  const hasSyllabusTopics = topics.some((topic) => topic.syllabusEvidence);

  const fileAsBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  };

  const handleRunAnalysis = async () => {
    if (!uploadedFile && !inputText.trim() && !selectedPaper) {
      alert('Please enter document content or select an uploaded paper.');
      return;
    }
    if (fileError) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    const contentToAnalyze = inputText || selectedPaper?.parsedContent || '';
    const nameToAnalyze = docName || selectedPaper?.title || 'Academic Paper';

    try {
      const res = await fetch(uploadedFile ? '/api/academic-documents/upload' : '/api/academic-documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadedFile ? {
          title: uploadedFile.name, docType, base64: await fileAsBase64(uploadedFile), mimeType: uploadedFile.type || undefined,
        } : { title: nameToAnalyze, docType: isSampleMode ? 'Past Paper (Sample)' : docType, content: contentToAnalyze }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to persist academic document.');
      const analysis = json.analysis;
      setAnalysisResult({
        title: 'Academic document saved',
        summary: `${analysis.createdQuestionCount} questions were persisted from ${isSampleMode ? 'the sample paper' : 'the uploaded document'}. Topic evidence and marks were calculated from those stored questions.`,
      });
      await onAcademicUpdated();
    } catch (err) {
      console.error('Failed to run AI document analysis:', err);
      alert('Error analyzing document. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocName(file.name);
      setSelectedPaper(null);
      setUploadedFile(file);
      setIsSampleMode(false);
      setFileError('');
      setInputText('');
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in pb-16">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#EDE7F3] pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#EDE7F6] border border-[#D8CCE8] text-[10px] uppercase tracking-[0.2em] font-bold text-[#461599] mb-3">
            <FileText className="w-3.5 h-3.5 text-[#5E35B1]" />
            <span>Document Analysis &amp; Extraction</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-[#1C1B1F]">
            Past Paper Extraction &amp; Topic Weightage
          </h1>
          <p className="text-xs text-[#55524E] mt-2 max-w-xl font-sans">
            Upload syllabi or previous exam papers to automatically extract questions, calculate topic frequencies, and identify high-yield areas.
          </p>
        </div>

        <button
          onClick={() => {
            setDocName('CS301_Spring_2026_Sample.txt');
            setUploadedFile(null);
            setIsSampleMode(true);
            setInputText(`QUESTION 1 (10 Marks): Explain Dijkstra's shortest path algorithm. Compare time complexity of Binary Heap vs Fibonacci Heap.
QUESTION 2 (12 Marks): Solve 0/1 Knapsack problem using Dynamic Programming memoization. Weights: [2,3,4], Values: [3,4,5], W=5.
QUESTION 3 (8 Marks): Apply Master Theorem to recurrences T(n) = 3T(n/2) + n^2 and T(n) = 2T(n/4) + sqrt(n).`);
          }}
          className="rounded-xl border border-[#D8CCE8] bg-white text-[#461599] hover:bg-[#EDE7F6] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-all shadow-2xs self-start md:self-auto active:scale-98"
        >
          Load Sample Exam Paper
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Input / Upload Box */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-6 shadow-2xs">
            <h3 className="font-serif text-2xl italic font-normal text-[#1C1B1F] flex items-center space-x-2">
              <FileUp className="w-4 h-4 text-[#5E35B1]" />
              <span>Upload or Paste</span>
            </h3>

            {/* Document Type Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Document Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDocType('Past Paper')}
                  className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    docType === 'Past Paper'
                      ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-2xs'
                      : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                  }`}
                >
                  Past Question Paper
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('Syllabus')}
                  className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    docType === 'Syllabus'
                      ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-2xs'
                      : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                  }`}
                >
                  Course Syllabus
                </button>
              </div>
            </div>

            {/* Document Title input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Document Name / Code</label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. CS301_Final_2025.txt"
                className="w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] px-3.5 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-sans"
              />
            </div>

            {/* File Drag and Drop zone */}
            <div className="rounded-xl border border-dashed border-[#D8CCE8] hover:bg-[#FDFBFE] p-6 text-center bg-[#FAF8FC] transition-colors cursor-pointer relative group">
              <input
                type="file"
                accept=".pdf,.txt,.text,text/plain,application/pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileUp className="w-6 h-6 text-[#5E35B1] mx-auto mb-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#461599]">Upload PDF or TXT file</div>
              <div className="text-[9px] uppercase tracking-widest text-[#7B7484] mt-1">PDF or pasted academic text</div>
            </div>

            {/* Raw Text Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Or Paste Document Text</label>
              <textarea
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); setUploadedFile(null); setIsSampleMode(false); setFileError(''); }}
                placeholder="Paste questions or syllabus outline here..."
                rows={5}
                className="w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] p-3 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-mono leading-relaxed"
              />
              {fileError && <p className="text-[10px] font-bold text-red-600">{fileError}</p>}
            </div>

            {/* Run AI Analysis Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="w-full bg-[#5E35B1] hover:bg-[#461599] text-white rounded-xl py-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center space-x-2 transition-all shadow-xs hover:shadow disabled:opacity-50 active:scale-98"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
                  <span>Saving and mapping...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 text-white" />
                  <span>Extract Topics &amp; Questions</span>
                </>
              )}
            </button>
          </div>

          {/* Uploaded Papers History list */}
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 space-y-3 shadow-2xs">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">
              Uploaded Papers Archive
            </h4>
            <div className="space-y-2">
              {papers.length === 0 ? (
                <p className="text-xs text-[#7B7484] py-2">No documents stored yet.</p>
              ) : (
                papers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPaper(p);
                      setDocName(p.title);
                      setInputText(p.parsedContent || '');
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedPaper?.id === p.id
                        ? 'bg-[#EDE7F6] text-[#461599] border-[#CEB8FF]'
                        : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <FileText className="w-4 h-4 shrink-0 text-[#5E35B1]" />
                      <div className="truncate">
                        <div className="text-xs font-bold uppercase tracking-wider truncate text-[#1C1B1F]">{p.title}</div>
                        <div className="text-[9px] uppercase tracking-widest text-[#7B7484]">{p.semester} &bull; {p.fileSize}</div>
                      </div>
                    </div>
                    <span className="text-[9px] rounded-md bg-white border border-[#EDE7F3] px-2 py-0.5 font-mono uppercase tracking-widest shrink-0 text-[#461599]">
                      {p.topicsCount} topics
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Topic Weightage & Trend Analysis Results */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Analysis Header or Result Status */}
          {analysisResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 space-y-2">
              <div className="flex items-center space-x-2 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-serif text-2xl italic font-normal">{analysisResult.title || 'AI Document Extraction Complete'}</h3>
              </div>
              <p className="text-xs text-emerald-800 font-sans leading-relaxed">
                {analysisResult.summary}
              </p>
            </div>
          )}

          {/* Topic Weightage & Frequency Breakdown Chart */}
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-7 space-y-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
              <div>
                <h3 className="font-serif text-3xl italic text-[#1C1B1F] flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-[#5E35B1]" />
                  <span>Topic Weightage &amp; Trend Analysis</span>
                </h3>
                <p className="text-xs text-[#7B7484] mt-1">
                  {hasSyllabusTopics
                    ? 'Based on your persisted syllabus and previous-question evidence.'
                    : 'PYQ-only trends. Uploading a syllabus will align these topics with your course syllabus.'}
                </p>
              </div>
              <span className="text-[9px] rounded-full bg-[#EDE7F6] text-[#461599] border border-[#D8CCE8] font-bold px-3 py-1 uppercase tracking-[0.2em]">
                High Yield
              </span>
            </div>

            {/* Visual Topic Bars */}
            <div className="space-y-4">
              {topics.length === 0 ? (
                <p className="text-xs text-[#7B7484] py-4">No past-paper topics yet. Upload a PYQ to see provisional topic trends, then add a syllabus to align them.</p>
              ) : (
                topics.map((t) => (
                  <div key={t.id} className="space-y-2.5 bg-[#FAF8FC] p-5 rounded-xl border border-[#EDE7F3]">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-serif text-xl italic text-[#1C1B1F]">{t.name}</span>
                        {t.highYield && (
                          <span className="text-[8px] bg-[#5E35B1] text-white px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                            High Yield
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-[#7B7484]">
                        <span>Priority {t.priorityScore}/10</span>
                        <span>{t.frequencyCount} mapped past questions</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-[#EDE7F6] h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#7B1FA2] to-[#5E35B1] rounded-full transition-all duration-700"
                        style={{
                          width: `${(t.priorityScore || 0) * 10}%`,
                        }}
                      ></div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#7B7484]">
                      <span>PYQ frequency: {t.frequencyCount}</span>
                      <span>Syllabus: {t.syllabusEvidence ? 'Present' : 'Not present'}</span>
                      {t.actualWeightage !== null && t.actualWeightage !== undefined && <span>Declared weightage: {t.actualWeightage}%</span>}
                    </div>
                    {t.reason && <p className="text-[10px] text-[#55524E]">Reason: {t.reason}</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Extracted Questions Preview */}
          <div className="bg-white rounded-2xl border border-[#EDE7F3] p-6 sm:p-7 space-y-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
              <h3 className="font-serif text-3xl italic text-[#1C1B1F] flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-[#5E35B1]" />
                <span>Extracted Question Bank ({questions.length})</span>
              </h3>
              <button
                onClick={() => setActiveTab('practice')}
                className="text-[10px] font-bold uppercase tracking-[0.16em] rounded-lg border border-[#D8CCE8] bg-[#EDE7F6] text-[#461599] px-3.5 py-1.5 hover:bg-[#5E35B1] hover:text-white transition-all flex items-center space-x-1"
              >
                <span>Practice Session</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {questions.length === 0 ? (
                <p className="text-xs text-[#7B7484] py-4">No questions extracted yet.</p>
              ) : (
                questions.map((q) => (
                  <div key={q.id} className="bg-[#FAF8FC] border border-[#EDE7F3] rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                      <span className="font-bold bg-[#EDE7F6] text-[#461599] rounded px-2.5 py-0.5 border border-[#D8CCE8]">
                        {q.topic}
                      </span>
                        <span className="font-mono text-[#7B7484]">
                          {q.questionNumber ? `Question ${q.questionNumber}${q.subpart ? `(${q.subpart})` : ''} ` : ''}
                          &bull; {q.marks} Marks &bull; Source: {q.source || 'PYQ'}
                        </span>
                      </div>
                      <p className="text-xs font-sans text-[#1C1B1F] leading-relaxed">
                        {q.questionText}
                      </p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};


