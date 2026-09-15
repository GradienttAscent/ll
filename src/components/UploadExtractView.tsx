import React, { useState } from 'react';
import { PastPaper, ExtractedTopic, QuestionItem } from '../types';
import { FileUp, Sparkles, FileText, CheckCircle2, BarChart3, ArrowRight, BookOpen, Loader2 } from 'lucide-react';

interface UploadExtractViewProps {
  papers: PastPaper[];
  topics: ExtractedTopic[];
  questions: QuestionItem[];
  onAcademicUpdated: () => Promise<void>;
  setActiveTab: (tab: string) => void;
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
    <div className="max-w-6xl mx-auto py-10 px-6 sm:px-8 space-y-10 animate-fade-in">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-black pb-8">
        <div>
          <div className="inline-flex items-center space-x-2 border border-black px-3 py-1 text-[9px] uppercase tracking-[0.2em] font-bold text-black mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Document Intelligence</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl italic font-normal text-black">
            Past Paper Extraction &amp; Topic Weightage
          </h1>
          <p className="text-xs text-black/70 mt-2 max-w-xl font-sans">
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
          className="border border-black bg-black text-white hover:bg-white hover:text-black px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors self-start md:self-auto"
        >
          Load Sample Exam Paper
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Input / Upload Box */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-6">
            <h3 className="font-serif text-2xl italic font-normal text-black flex items-center space-x-2">
              <FileUp className="w-4 h-4 text-black" />
              <span>Upload or Paste</span>
            </h3>

            {/* Document Type Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Document Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDocType('Past Paper')}
                  className={`py-2 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    docType === 'Past Paper'
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black/30 hover:border-black'
                  }`}
                >
                  Past Question Paper
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('Syllabus')}
                  className={`py-2 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    docType === 'Syllabus'
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black/30 hover:border-black'
                  }`}
                >
                  Course Syllabus
                </button>
              </div>
            </div>

            {/* Document Title input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Document Name / Code</label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. CS301_Final_2025.txt"
                className="w-full bg-white border border-black/30 px-3 py-2 text-xs text-black focus:outline-none focus:border-black font-sans"
              />
            </div>

            {/* File Drag and Drop zone */}
            <div className="border border-dashed border-black hover:bg-black/5 p-6 text-center bg-white transition-colors cursor-pointer relative group">
              <input
                type="file"
                accept=".pdf,.txt,.text,text/plain,application/pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileUp className="w-6 h-6 text-black mx-auto mb-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider text-black">Upload PDF or TXT file</div>
              <div className="text-[9px] uppercase tracking-widest text-black/50 mt-1">PDF or pasted academic text</div>
            </div>

            {/* Raw Text Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Or Paste Document Text</label>
              <textarea
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); setUploadedFile(null); setIsSampleMode(false); setFileError(''); }}
                placeholder="Paste questions or syllabus outline here..."
                rows={5}
                className="w-full bg-white border border-black/30 p-3 text-xs text-black focus:outline-none focus:border-black font-mono leading-relaxed"
              />
              {fileError && <p className="text-[10px] font-bold text-black">{fileError}</p>}
            </div>

            {/* Run AI Analysis Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="w-full bg-black hover:bg-white hover:text-black text-white border border-black py-3 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving and mapping...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Extract Topics &amp; Questions</span>
                </>
              )}
            </button>
          </div>

          {/* Uploaded Papers History list */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
              Uploaded Papers Archive
            </h4>
            <div className="space-y-2">
              {papers.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPaper(p);
                    setDocName(p.title);
                    setInputText(p.parsedContent || '');
                  }}
                  className={`p-3 border transition-all cursor-pointer flex items-center justify-between ${
                    selectedPaper?.id === p.id
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-black border-black/30 hover:border-black'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-bold uppercase tracking-wider truncate">{p.title}</div>
                      <div className="text-[9px] uppercase tracking-widest opacity-60">{p.semester} &bull; {p.fileSize}</div>
                    </div>
                  </div>
                  <span className="text-[9px] border border-current px-2 py-0.5 font-mono uppercase tracking-widest flex-shrink-0">
                    {p.topicsCount} topics
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Topic Weightage & Trend Analysis Results */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Analysis Header or Result Status */}
          {analysisResult ? (
            <div className="bg-[#F8F7F2] border border-black p-6 space-y-3">
              <div className="flex items-center space-x-2 text-black">
                <CheckCircle2 className="w-5 h-5 text-black" />
                <h3 className="font-serif text-2xl italic">{analysisResult.title || 'AI Document Extraction Complete'}</h3>
              </div>
              <p className="text-xs text-black/80 font-sans leading-relaxed">
                {analysisResult.summary}
              </p>
            </div>
          ) : null}

          {/* Topic Weightage & Frequency Breakdown Chart */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-3xl italic text-black flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-black" />
                  <span>Topic Weightage &amp; Trend Analysis</span>
                </h3>
                <p className="text-xs text-black/60 mt-1">
                  Based on your persisted syllabus and previous-question evidence.
                </p>
              </div>
              <span className="text-[9px] bg-black text-white font-bold px-3 py-1 uppercase tracking-[0.2em]">
                High Yield
              </span>
            </div>

            {/* Visual Topic Bars */}
            <div className="space-y-4">
              {topics.map((t) => (
                <div key={t.id} className="space-y-2 bg-white p-5 border border-black">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-serif text-xl italic text-black">{t.name}</span>
                      {t.highYield && (
                        <span className="text-[8px] bg-black text-white px-2 py-0.5 font-bold uppercase tracking-widest">
                          High Yield
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-black/60">
                      <span>Priority {t.priorityScore}/10</span>
                      <span>{t.frequencyCount} mapped past questions</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-black/10 h-1">
                    <div
                      className="h-full bg-black transition-all duration-700"
                      style={{
                        width: `${(t.priorityScore || 0) * 10}%`,
                      }}
                    ></div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-black/60">
                    <span>PYQ frequency: {t.frequencyCount}</span>
                    <span>Syllabus: {t.syllabusEvidence ? 'Present' : 'Not present'}</span>
                    {t.actualWeightage !== null && t.actualWeightage !== undefined && <span>Declared weightage: {t.actualWeightage}%</span>}
                  </div>
                  {t.reason && <p className="text-[10px] text-black/60">Reason: {t.reason}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Extracted Questions Preview */}
          <div className="bg-[#F8F7F2] border border-black p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-black pb-4">
              <h3 className="font-serif text-3xl italic text-black flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-black" />
                <span>Extracted Question Bank ({questions.length})</span>
              </h3>
              <button
                onClick={() => setActiveTab('practice')}
                className="text-[10px] font-bold uppercase tracking-[0.2em] border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-colors flex items-center space-x-1"
              >
                <span>Practice Session</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id} className="bg-white border border-black p-5 space-y-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="font-bold bg-black text-white px-2.5 py-0.5">
                      {q.topic}
                    </span>
                    <span className="font-mono text-black/60">{q.year} &bull; {q.marks} Marks &bull; {q.suggestedTimeMinutes}m</span>
                  </div>

                  <p className="text-xs font-sans text-black leading-relaxed">
                    {q.questionText}
                  </p>
                  {q.mappingStatus === 'mapped' && q.mappingEvidence && q.mappingEvidence.length > 0 && (
                    <p className="text-[10px] text-black/60">{q.mappingEvidence.join('; ')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

