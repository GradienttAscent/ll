import React, { useState } from 'react';
import { X, FileUp, Sparkles, Loader2 } from 'lucide-react';
import { PastPaper, PersistedTopic } from '../types';
import { extractFileContent } from '../utils/pdfExtractor';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaperUploaded: (paper: PastPaper) => void;
  onTopicsSaved: (topics: PersistedTopic[]) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onPaperUploaded, onTopicsSaved }) => {
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus'>('Past Paper');
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) {
      alert('Please enter a document title.');
      return;
    }

    setIsProcessing(true);

    try {
      // Call Gemini API to extract key topics
      const res = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentName: docName,
          documentType: docType,
          content: content || `Extracted text from ${docName}`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to analyze document.');
      const topicsResponse = await fetch('/api/topics/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: json.data?.topics || [] }),
      });
      const savedTopics = await topicsResponse.json();
      if (!topicsResponse.ok) throw new Error(savedTopics.error || 'Unable to save extracted topics.');
      onTopicsSaved(savedTopics.topics);
      const extractedCount = json.data?.extractedQuestions?.length || 5;

      const newPaper: PastPaper = {
        id: `paper-${Date.now()}`,
        title: docName.endsWith('.txt') ? docName : `${docName}.txt`,
        courseCode: 'CS301',
        semester: 'Spring 2026',
        year: '2026',
        fileSize: '1.5 MB',
        uploadDate: 'Just now',
        topicsCount: json.data?.topics?.length || 4,
        extractedQuestionsCount: extractedCount,
        parsedContent: content || `Extracted text for ${docName}`,
      };

      onPaperUploaded(newPaper);
      onClose();
      alert(`Topics extracted and saved. ${extractedCount} practice questions were identified.`);
    } catch (err) {
      console.error('Error uploading paper:', err);
      alert('Failed to process document.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FDFDFC] border border-black max-w-lg w-full p-6 sm:p-8 space-y-6 relative">
        
        <div className="flex items-center justify-between border-b border-black pb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-black" />
            <h3 className="font-serif text-2xl italic font-normal text-black">
              Ingest Document &amp; Extract
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 border border-black/20 hover:border-black text-black transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Document Title</label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. CS301_Final_Exam_2025.txt"
              className="w-full bg-[#F8F7F2] border border-black/30 px-3.5 py-2.5 text-xs text-black focus:outline-none focus:border-black font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Document Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDocType('Past Paper')}
                className={`py-2.5 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                  docType === 'Past Paper'
                    ? 'bg-black text-white border-black'
                    : 'bg-[#F8F7F2] text-black border-black/30 hover:border-black'
                }`}
              >
                Past Question Paper
              </button>
              <button
                type="button"
                onClick={() => setDocType('Syllabus')}
                className={`py-2.5 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                  docType === 'Syllabus'
                    ? 'bg-black text-white border-black'
                    : 'bg-[#F8F7F2] text-black border-black/30 hover:border-black'
                }`}
              >
                Course Syllabus
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">Upload PDF / TXT File or Paste Content</label>
            <div className="relative border border-dashed border-black bg-[#F8F7F2] hover:bg-black/5 p-3 text-center transition-colors cursor-pointer mb-2">
              <input
                type="file"
                accept=".pdf,.txt,.text,text/plain,application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setDocName(file.name);
                    const { content: fileText } = await extractFileContent(file);
                    setContent(fileText);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-black flex items-center justify-center gap-2">
                <FileUp className="w-3.5 h-3.5" />
                <span>Choose PDF or TXT File</span>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste questions / syllabus chapters here..."
              rows={3}
              className="w-full bg-[#F8F7F2] border border-black/30 p-3 text-xs text-black focus:outline-none focus:border-black font-mono"
            />
          </div>

          <div className="pt-4 border-t border-black flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider border border-black/20 hover:border-black text-black transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="bg-black text-white border border-black hover:bg-white hover:text-black px-6 py-2.5 font-bold text-[11px] uppercase tracking-[0.2em] flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4" />
                  <span>Analyze Document</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

