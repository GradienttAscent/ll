import React, { useState } from 'react';
import { PastPaper, ExtractedTopic, QuestionItem } from '../types';
import { FileUp, Sparkles, FileText, CheckCircle2, BarChart3, ArrowRight, BookOpen, Loader2 } from 'lucide-react';

interface UploadExtractViewProps {
  papers: PastPaper[];
  topics: ExtractedTopic[];
  questions: QuestionItem[];
  onAddPaper: (paper: PastPaper) => void;
  onQuestionsExtracted: (newQuestions: QuestionItem[], newTopics: ExtractedTopic[]) => void;
  setActiveTab: (tab: string) => void;
}

export const UploadExtractView: React.FC<UploadExtractViewProps> = ({
  papers,
  topics,
  questions,
  onQuestionsExtracted,
  setActiveTab
}) => {
  const [selectedPaper, setSelectedPaper] = useState<PastPaper | null>(papers[0] || null);
  const [inputText, setInputText] = useState('');
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus'>('Past Paper');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const handleRunAnalysis = async () => {
    if (!inputText.trim() && !selectedPaper) {
      alert('Please enter document content or select an uploaded paper.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    const contentToAnalyze = inputText || selectedPaper?.parsedContent || '';
    const nameToAnalyze = docName || selectedPaper?.title || 'Academic Paper';

    try {
      const res = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentName: nameToAnalyze,
          documentType: docType,
          content: contentToAnalyze,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setAnalysisResult(json.data);

        // Convert extracted questions to QuestionItem format
        if (json.data.extractedQuestions && json.data.extractedQuestions.length > 0) {
          const newQuestions: QuestionItem[] = json.data.extractedQuestions.map((q: any, i: number) => ({
            id: `ext-${Date.now()}-${i}`,
            subject: 'Algorithms (CS301)',
            topic: q.topic || 'General Algorithms',
            questionText: q.question || 'Extracted question from paper',
            marks: q.marks || 10,
            year: nameToAnalyze,
            type: (q.type as any) || 'Subjective',
            suggestedTimeMinutes: q.suggestedTimeMinutes || 15,
            modelAnswer: 'See practice view for AI step-by-step guidance.',
          }));

          const newTopics: ExtractedTopic[] = json.data.topics || [];
          onQuestionsExtracted(newQuestions, newTopics);
        }
      }
    } catch (err) {
      console.error('Failed to run AI document analysis:', err);
      alert('Error analyzing document. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSimulatedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setInputText(text || `Sample content extracted from ${file.name}: CS301 Algorithms past paper questions covering Dijkstra, Dynamic Programming knapsack, and Big O notation.`);
      };
      reader.readAsText(file);
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
            setDocName('CS301_Spring_2026_Sample.pdf');
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
                placeholder="e.g. CS301_Final_2025.pdf"
                className="w-full bg-white border border-black/30 px-3 py-2 text-xs text-black focus:outline-none focus:border-black font-sans"
              />
            </div>

            {/* File Drag and Drop zone */}
            <div className="border border-dashed border-black hover:bg-black/5 p-6 text-center bg-white transition-colors cursor-pointer relative group">
              <input
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                onChange={handleSimulatedFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileUp className="w-6 h-6 text-black mx-auto mb-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider text-black">Drop PDF, DOC, or TXT</div>
              <div className="text-[9px] uppercase tracking-widest text-black/50 mt-1">Supports files up to 25MB</div>
            </div>

            {/* Raw Text Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Or Paste Document Text</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste questions or syllabus outline here..."
                rows={5}
                className="w-full bg-white border border-black/30 p-3 text-xs text-black focus:outline-none focus:border-black font-mono leading-relaxed"
              />
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
                  <span>Analyzing with Gemini...</span>
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
                  Based on occurrence frequency in CS301 past papers from 2021&ndash;2025.
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
                      <span>{t.frequencyCount} past questions</span>
                      <span className="font-bold text-black font-mono">{t.weightage}% weight</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-black/10 h-1">
                    <div
                      className="h-full bg-black transition-all duration-700"
                      style={{
                        width: `${t.weightage * 2.5}%`,
                      }}
                    ></div>
                  </div>
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
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

