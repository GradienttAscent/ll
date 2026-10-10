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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileAsBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  };

  const inferDocTypeFromFileName = (fileName: string, defaultType: 'Past Paper' | 'Syllabus' | 'Lecture Slides'): 'Past Paper' | 'Syllabus' | 'Lecture Slides' => {
    const normalized = fileName.replace(/[_\.\-]+/g, ' ').toLowerCase();
    const lower = fileName.toLowerCase();
    if (/\.(pptx?|key|odp)$/i.test(lower) || /\b(?:ppt|pptx|slides?|lecture|deck|presentation|notes?)\b/i.test(normalized) || /^(?:trees?|unit\s*\d|chapter\s*\d|module\s*\d|lec(?:ture)?\s*\d)/i.test(normalized)) {
      return 'Lecture Slides';
    }
    if (/\b(?:syllabus|curriculum|curricula|modality|modalities|course\s*(?:outline|structure|plan|scheme))\b/i.test(normalized)) {
      return 'Syllabus';
    }
    const isSubjectTesting = /\bsoftware\s+testing\b/i.test(normalized);
    if (!isSubjectTesting && /\b(?:exam|examination|end\s*sem|mid\s*sem|midterm|question\s*paper|pyq|quiz|test|makeup)\b/i.test(normalized)) {
      return 'Past Paper';
    }
    return defaultType;
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      setUploadedFiles((prev) => {
        const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
        const fresh = files.filter((f) => !existing.has(`${f.name}-${f.size}`));
        return [...prev, ...fresh];
      });
      setContent('');
      if (files.length === 1 && !docName) {
        setDocName(files[0].name);
        setDocType(inferDocTypeFromFileName(files[0].name, 'Past Paper'));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadedFiles.length === 0 && !content.trim()) {
      alert('Please select files to upload or paste text content.');
      return;
    }

    if (uploadedFiles.length === 0 && !docName.trim()) {
      alert('Please enter a document title.');
      return;
    }

    setIsProcessing(true);

    try {
      if (uploadedFiles.length > 0) {
        let totalQuestions = 0;
        const processed: { name: string; method: string }[] = [];
        const failed: { name: string; error: string }[] = [];

        for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i];
          setProcessingMsg(`Processing ${i + 1} of ${uploadedFiles.length}: ${file.name}...`);
          try {
            const title = uploadedFiles.length === 1 && docName.trim() ? docName.trim() : file.name;
            const res = await fetch('/api/academic-documents/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                fileName: file.name,
                docType: inferDocTypeFromFileName(file.name, docType),
                base64: await fileAsBase64(file),
                mimeType: file.type || undefined,
              }),
            });
            const json = await res.json();
            if (!res.ok) {
              failed.push({ name: file.name, error: json.error || 'Failed to process file' });
            } else {
              totalQuestions += json.analysis?.createdQuestionCount || 0;
              const method = json.analysis?.document?.extractionMethod || json.analysis?.extractionMethod || 'embedded-pdf-text';
              processed.push({ name: file.name, method });
            }
          } catch (err: any) {
            failed.push({ name: file.name, error: err.message || 'Upload error' });
          }
        }

        if (failed.length > 0 && processed.length === 0) {
          throw new Error(`Failed to upload: ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`);
        }

        await onAcademicUpdated();
        onClose();
        const methodSummary = processed.map((p) => `${p.name} (${p.method})`).join(', ');
        alert(
          failed.length > 0
            ? `Partially completed: ${processed.length} of ${uploadedFiles.length} files saved (${totalQuestions} questions; ${methodSummary}). Failed: ${failed.map((f) => f.name).join(', ')}`
            : `Successfully uploaded ${processed.length} document${processed.length > 1 ? 's' : ''}. ${totalQuestions} questions indexed [Extraction: ${methodSummary}].`
        );
      } else {
        const res = await fetch('/api/academic-documents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: docName, docType, content }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save academic document.');
        await onAcademicUpdated();
        onClose();
        alert(`Document saved. ${json.analysis.createdQuestionCount} new questions were identified.`);
      }
    } catch (err: any) {
      console.error('Error uploading document(s):', err);
      alert(err.message || 'Failed to process document(s).');
    } finally {
      setIsProcessing(false);
      setProcessingMsg('');
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
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
              Document Title {uploadedFiles.length > 1 ? '(Optional batch prefix)' : ''}
            </label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder={uploadedFiles.length > 1 ? 'Optional (defaults to individual file names)' : 'e.g. CS301_Final_Exam_2025.txt'}
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
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7B7484] dark:text-[#7A7480]">
                Upload PDF / PPTX / TXT File(s)
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
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files || []) as File[];
                if (files.length > 0) {
                  setUploadedFiles((prev) => {
                    const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
                    return [...prev, ...files.filter((f) => !existing.has(`${f.name}-${f.size}`))];
                  });
                  setContent('');
                  if (files.length === 1 && !docName) {
                    setDocName(files[0].name);
                  }
                }
              }}
              className={`relative rounded-xl border border-dashed transition-colors p-4 text-center ${
                isDragging
                  ? 'border-[#6D28D9] dark:border-[#8B5CF6] bg-[#EDE7F6]/40 dark:bg-[#251E30]/50'
                  : 'border-[#D8CCE8] dark:border-[#3E344A] bg-[#FAF8FC] dark:bg-[#1D1A21] hover:bg-[#EDE7F6]/30 dark:hover:bg-[#251E30]/40'
              }`}
            >
              <input 
                type="file" 
                multiple
                accept=".pdf,.txt,.text,text/plain,application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.docx" 
                onChange={handleFileChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              />
              <div className="space-y-1">
                <FileUp className="w-5 h-5 mx-auto text-[#6D28D9] dark:text-[#8B5CF6]" />
                <span className="block text-xs font-medium tracking-wider text-[#6D28D9] dark:text-[#A78BFA]">
                  {uploadedFiles.length > 0 ? '+ Add More Files' : 'Choose PDF, PPTX, or TXT file(s)'}
                </span>
                <span className="block text-[10px] text-[#7B7484] dark:text-[#7A7480]">
                  Select multiple files or drag and drop from computer
                </span>
              </div>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {uploadedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#FAF8FC] dark:bg-[#1D1A21] border border-[#EDE7F3] dark:border-[#302B35] text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-[#6D28D9] dark:text-[#8B5CF6]" />
                      <span className="truncate text-[#17151A] dark:text-[#F5F3F7] text-[11px]" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[10px] text-[#7B7484] dark:text-[#7A7480] shrink-0 font-mono">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1 rounded text-[#7B7484] hover:text-red-500 transition"
                      title="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="text-[10px] text-[#7B7484] dark:text-[#7A7480] text-right font-medium">
                  {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} ({(uploadedFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB total)
                </div>
              </div>
            )}

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste questions or syllabus chapters directly here..."
              rows={3}
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
              disabled={isProcessing || (uploadedFiles.length === 0 && !content.trim())}
              className="bg-[#6D28D9] hover:bg-[#5B21B6] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] text-white rounded-lg px-5 py-2 font-medium text-xs tracking-wider flex items-center space-x-2 transition-colors shadow-xs disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                  <span>{processingMsg || 'Analyzing...'}</span>
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 text-white/80" />
                  <span>
                    {uploadedFiles.length > 1
                      ? `Analyze Documents (${uploadedFiles.length})`
                      : 'Analyze Document'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

