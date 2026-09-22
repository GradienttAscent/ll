import React, { useState } from 'react';
import { X, FileUp, FileText, Loader2 } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcademicUpdated: () => Promise<void>;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onAcademicUpdated }) => {
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<'Past Paper' | 'Syllabus'>('Past Paper');
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
    <div className="fixed inset-0 z-50 bg-[#1C1B1F]/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#EDE7F3] shadow-xl max-w-lg w-full p-6 sm:p-8 space-y-6 relative animate-scale-in">

        <div className="flex items-center justify-between border-b border-[#EDE7F3] pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EDE7F6] text-[#461599] flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#5E35B1]" />
            </div>
            <div>
              <h3 className="font-serif text-2xl italic font-normal text-[#1C1B1F]">
                Ingest Document &amp; Extract
              </h3>
              <p className="text-[11px] text-[#7B7484]">Upload past papers or syllabus for topic mapping</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#EDE7F3] hover:border-[#D8CCE8] text-[#7B7484] hover:text-[#1C1B1F] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Document Title</label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. CS301_Final_Exam_2025.txt"
              className="w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] px-3.5 py-2.5 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Document Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDocType('Past Paper')}
                className={`py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all ${
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
                className={`py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all ${
                  docType === 'Syllabus'
                    ? 'bg-[#5E35B1] text-white border-[#5E35B1] shadow-2xs'
                    : 'bg-[#FAF8FC] text-[#55524E] border-[#EDE7F3] hover:border-[#D8CCE8]'
                }`}
              >
                Course Syllabus
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484]">Content / Text Outline</label>
            <div className="relative rounded-xl border border-dashed border-[#D8CCE8] bg-[#FDFBFE] hover:bg-[#F9F5FD] p-4 text-center transition-colors">
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
                <FileUp className="w-5 h-5 mx-auto text-[#5E35B1]" />
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#461599]">
                  {uploadedFile ? uploadedFile.name : 'Choose PDF or TXT file'}
                </span>
                <span className="block text-[10px] text-[#7B7484]">Drag and drop or browse from computer</span>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste questions or syllabus chapters directly here..."
              rows={4}
              className="w-full rounded-xl bg-[#FAF8FC] border border-[#EDE7F3] p-3 text-xs text-[#1C1B1F] focus:outline-none focus:border-[#5E35B1] font-mono"
            />
          </div>

          <div className="pt-4 border-t border-[#EDE7F3] flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border border-[#EDE7F3] hover:border-[#D8CCE8] text-[#55524E] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="bg-[#5E35B1] hover:bg-[#461599] text-white rounded-xl px-6 py-2.5 font-bold text-[11px] uppercase tracking-[0.16em] flex items-center space-x-2 transition-all shadow-xs hover:shadow disabled:opacity-50 active:scale-98"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#CEB8FF]" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 text-[#CEB8FF]" />
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

