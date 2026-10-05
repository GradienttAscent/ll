import React, { useState } from 'react';
import { X, FileUp, FileText, Loader2 } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcademicUpdated: () => Promise<void>;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onAcademicUpdated }) => {
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus' | 'Lecture Slides'>('Past Paper');
  const [content, setContent] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileAsBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) {
      alert('Please enter a document title.');
      return;
    }

    setIsProcessing(true);

    try {
      const res = await fetch(uploadedFile ? '/api/academic-documents/upload' : '/api/academic-documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadedFile
          ? { title: uploadedFile.name, docType, base64: await fileAsBase64(uploadedFile), mimeType: uploadedFile.type || undefined }
          : { title: docName, docType, content }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save academic document.');
      await onAcademicUpdated();
      onClose();
      alert(`Document saved. ${json.analysis.createdQuestionCount} new questions were identified.`);
    } catch (err) {
      console.error('Error uploading paper:', err);
      alert('Failed to process document.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#17151A] rounded-2xl border border-[#EDE7F3] dark:border-[#302B35] shadow-xl max-w-lg w-full p-6 sm:p-8 space-y-6 relative animate-scale-in">

        <div className="flex items-center justify-between border-b border-[#EDE7F3] dark:border-[#302B35] pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EDE7F6] dark:bg-[#251E30] text-[#6D28D9] dark:text-[#A78BFA] flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#6D28D9] dark:text-[#8B5CF6]" />
            </div>
            <div>
              <h3 className="font-serif text-2xl italic font-normal text-[#17151A] dark:text-[#F5F3F7]">
                Ingest Document &amp; Extract
              </h3>
              <p className="text-[11px] text-[#7B7484] dark:text-[#7A7480] font-sans">Upload past papers, slides, or syllabus for topic mapping</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8] dark:hover:border-[#3E344A] text-[#7B7484] dark:text-[#7A7480] hover:text-[#17151A] dark:hover:text-[#F5F3F7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">Document Title</label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. CS301_Final_Exam_2025.txt"
              className="w-full rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] px-3.5 py-2 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] font-sans transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">Document Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDocType('Past Paper')}
                className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  docType === 'Past Paper'
                    ? 'bg-[#6D28D9] text-white border-[#6D28D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6] shadow-2xs'
                    : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                }`}
              >
                Past Paper
              </button>
              <button
                type="button"
                onClick={() => setDocType('Lecture Slides')}
                className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  docType === 'Lecture Slides'
                    ? 'bg-[#6D28D9] text-white border-[#6D28D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6] shadow-2xs'
                    : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                }`}
              >
                Lecture Slides
              </button>
              <button
                type="button"
                onClick={() => setDocType('Syllabus')}
                className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  docType === 'Syllabus'
                    ? 'bg-[#6D28D9] text-white border-[#6D28D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6] shadow-2xs'
                    : 'bg-[#FAF8FC] dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] border-[#EDE7F3] dark:border-[#302B35] hover:border-[#D8CCE8]'
                }`}
              >
                Syllabus
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">Content / Text Outline</label>
            <div className="relative rounded-xl border border-dashed border-[#D8CCE8] dark:border-[#3E344A] bg-[#FAF8FC] dark:bg-[#1D1A21] hover:bg-[#EDE7F6]/30 dark:hover:bg-[#251E30]/40 p-4 text-center transition-colors">
              <input 
                type="file" 
                accept=".pdf,.txt,.text,text/plain,application/pdf" 
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDocName(file.name);
                  setUploadedFile(file);
                  setContent('');
                }} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              />
              <div className="space-y-1">
                <FileUp className="w-5 h-5 mx-auto text-[#6D28D9] dark:text-[#8B5CF6]" />
                <span className="block text-xs font-medium tracking-wider text-[#6D28D9] dark:text-[#A78BFA]">
                  {uploadedFile ? uploadedFile.name : 'Choose PDF or TXT file'}
                </span>
                <span className="block text-[10px] text-[#7B7484] dark:text-[#7A7480]">Drag and drop or browse from computer</span>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste questions or syllabus chapters directly here..."
              rows={4}
              className="w-full rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] p-3 text-xs text-[#17151A] dark:text-[#F5F3F7] focus:outline-none focus:border-[#6D28D9] dark:focus:border-[#8B5CF6] font-mono transition-colors"
            />
          </div>

          <div className="pt-4 border-t border-[#EDE7F3] dark:border-[#302B35] flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium tracking-wider border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#1D1A21] text-[#55524E] dark:text-[#A9A3AE] hover:bg-[#FAF8FC] dark:hover:bg-[#251E30] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-5 py-2 font-medium text-xs tracking-wider flex items-center space-x-2 transition-colors shadow-xs disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 text-white/80" />
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

