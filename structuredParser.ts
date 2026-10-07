import { extractPdfPages, extractionIsLowQuality } from './pdfText';
import { extractPptxSlides } from './pptxParser';

export interface StructuredPage {
  pageNumber: number;
  heading: string;
  text: string;
}

export interface StructuredExtractionResult {
  pages: StructuredPage[];
  fullText: string;
  extractionMethod: string;
}

/**
 * Extracts structured pages or slides from any supported academic document format
 * completely locally and deterministically (zero external AI dependencies).
 */
export function extractStructuredDocument(
  payload: Buffer,
  filename: string,
  mimeType?: string
): StructuredExtractionResult {
  const lowerName = filename.toLowerCase();
  const isPptx =
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lowerName.endsWith('.pptx');
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');

  if (isPptx) {
    const slides = extractPptxSlides(payload);
    if (slides.length > 0) {
      const pages: StructuredPage[] = slides.map((s) => ({
        pageNumber: s.slideNumber,
        heading: s.title || `Slide ${s.slideNumber}`,
        text: s.text,
      }));
      const fullText = pages.map((p) => `Slide ${p.pageNumber}: ${p.heading}\n${p.text}`).join('\n\f\n');
      return {
        pages,
        fullText,
        extractionMethod: 'pptx-slides',
      };
    }
  }

  if (isPdf) {
    const rawPages = extractPdfPages(payload);
    const pages: StructuredPage[] = rawPages.map((p) => {
      const firstLine = p.text.split('\n')[0]?.replace(/^[#\-*\s]+/, '').trim() || '';
      const heading = firstLine.length > 2 && firstLine.length < 80 ? firstLine : `Page ${p.pageNumber}`;
      return {
        pageNumber: p.pageNumber,
        heading,
        text: p.text,
      };
    });
    const fullText = pages.map((p) => p.text).join('\n\f\n').trim();
    return {
      pages,
      fullText,
      extractionMethod: 'embedded-pdf-text',
    };
  }

  // Plain text / Markdown / Syllabus / Notes
  const rawText = payload.toString('utf8').trim();
  const pages: StructuredPage[] = [];

  if (rawText.includes('\f')) {
    const parts = rawText.split('\f').map((p) => p.trim()).filter(Boolean);
    parts.forEach((part, idx) => {
      const firstLine = part.split('\n')[0]?.replace(/^[#\-*\s]+/, '').trim() || '';
      const heading = firstLine.length > 2 && firstLine.length < 80 ? firstLine : `Page ${idx + 1}`;
      pages.push({ pageNumber: idx + 1, heading, text: part });
    });
  } else if (/^#{1,3}\s+/m.test(rawText)) {
    const sections = rawText.split(/\n(?=#{1,3}\s+)/g).map((s) => s.trim()).filter(Boolean);
    sections.forEach((sec, idx) => {
      const firstLine = sec.split('\n')[0]?.replace(/^[#\-*\s]+/, '').trim() || '';
      pages.push({ pageNumber: idx + 1, heading: firstLine || `Section ${idx + 1}`, text: sec });
    });
  } else {
    // Single page
    const firstLine = rawText.split('\n')[0]?.replace(/^[#\-*\s]+/, '').trim() || '';
    pages.push({
      pageNumber: 1,
      heading: firstLine.length > 2 && firstLine.length < 80 ? firstLine : 'Document Notes',
      text: rawText,
    });
  }

  return {
    pages,
    fullText: rawText,
    extractionMethod: 'utf8-text',
  };
}
