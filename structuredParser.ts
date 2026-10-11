import { extractPdfPages, extractionIsLowQuality } from './pdfText';
import { extractPptxSlides, readZipEntries } from './pptxParser';
import { extractDocxDocument } from './docxParser';

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
 * Extracts printable ASCII / UTF-16LE text strings from legacy binary Office files (.ppt, .doc).
 */
function extractLegacyOfficeText(payload: Buffer): StructuredExtractionResult {
  const latin = payload.toString('latin1');
  const asciiMatches = latin.match(/[\x20-\x7E\t\r\n]{5,}/g) || [];
  const cleanAscii = asciiMatches
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && !/^[0-9\s.,;:]+$/.test(s) && /[A-Za-z]/.test(s));

  // Also extract UTF-16LE strings (common in PPT binary streams)
  const utf16Strings: string[] = [];
  let curChars: number[] = [];
  for (let i = 0; i < payload.length - 1; i += 2) {
    const code = payload.readUInt16LE(i);
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
      curChars.push(code);
    } else {
      if (curChars.length >= 4) {
        utf16Strings.push(String.fromCharCode(...curChars).trim());
      }
      curChars = [];
    }
  }
  if (curChars.length >= 4) {
    utf16Strings.push(String.fromCharCode(...curChars).trim());
  }

  const combined = Array.from(new Set([...cleanAscii, ...utf16Strings]))
    .filter((s) => s.length >= 6 && /[A-Za-z]/.test(s))
    .join('\n');

  if (!combined) {
    return {
      pages: [{ pageNumber: 1, heading: 'Legacy Office Document', text: '' }],
      fullText: '',
      extractionMethod: 'legacy-office-text',
    };
  }

  return {
    pages: [{ pageNumber: 1, heading: 'Legacy Office Document', text: combined }],
    fullText: combined,
    extractionMethod: 'legacy-office-text',
  };
}

/**
 * Extracts structured pages, slides, or sections from any supported academic document format
 * completely locally and deterministically (zero external AI dependencies).
 */
export function extractStructuredDocument(
  payload: Buffer,
  filename: string,
  mimeType?: string
): StructuredExtractionResult {
  if (!payload || payload.length === 0) {
    return {
      pages: [{ pageNumber: 1, heading: 'Empty Document', text: '' }],
      fullText: '',
      extractionMethod: 'utf8-text',
    };
  }

  const lowerName = (filename || '').toLowerCase();
  const isPdfMagic = payload.length >= 5 && payload.subarray(0, 5).toString('utf8') === '%PDF-';
  const isZipMagic = payload.length >= 4 && payload.subarray(0, 4).toString('binary') === 'PK\x03\x04';
  const isOle2Magic = payload.length >= 8 && payload[0] === 0xd0 && payload[1] === 0xcf && payload[2] === 0x11 && payload[3] === 0xe0;

  // 1. PDF Detection
  const isPdf =
    mimeType === 'application/pdf' ||
    lowerName.endsWith('.pdf') ||
    isPdfMagic;

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
      pages: pages.length > 0 ? pages : [{ pageNumber: 1, heading: 'Page 1', text: '' }],
      fullText,
      extractionMethod: 'embedded-pdf-text',
    };
  }

  // 2. OpenXML ZIP Detection (PPTX / DOCX)
  if (isZipMagic || lowerName.endsWith('.pptx') || lowerName.endsWith('.docx') || /openxmlformats/i.test(mimeType || '')) {
    const zipEntries = readZipEntries(payload);

    const hasWordDoc = zipEntries.has('word/document.xml') || Array.from(zipEntries.keys()).some((k) => k.startsWith('word/'));
    const hasPpt = zipEntries.has('ppt/presentation.xml') || Array.from(zipEntries.keys()).some((k) => k.startsWith('ppt/'));

    const isDocx =
      hasWordDoc ||
      lowerName.endsWith('.docx') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const isPptx =
      hasPpt ||
      lowerName.endsWith('.pptx') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

    if (isDocx && !hasPpt) {
      return extractDocxDocument(payload);
    }

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

    // If zip had word document, try docx extraction
    if (hasWordDoc) {
      return extractDocxDocument(payload);
    }
  }

  // 3. Legacy Binary Office format (.ppt, .doc)
  if (isOle2Magic || /\.(ppt|doc)$/i.test(lowerName)) {
    return extractLegacyOfficeText(payload);
  }

  // 4. Plain text / Markdown / Syllabus / Notes
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
    pages: pages.length > 0 ? pages : [{ pageNumber: 1, heading: 'Document Notes', text: '' }],
    fullText: rawText,
    extractionMethod: 'utf8-text',
  };
}
