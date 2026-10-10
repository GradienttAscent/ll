import { readZipEntries } from './pptxParser';
import type { StructuredPage, StructuredExtractionResult } from './structuredParser';

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export interface DocxBlock {
  text: string;
  isHeading: boolean;
  headingText?: string;
  hasPageBreak: boolean;
}

/**
 * Extracts structured sections and plain text from an OpenXML Word (.docx) buffer.
 * Operates purely on-device and deterministically using Node's standard zlib.
 */
export function extractDocxDocument(buffer: Buffer): StructuredExtractionResult {
  const entries = readZipEntries(buffer);
  const docXml = entries.get('word/document.xml')?.toString('utf8');
  if (!docXml) {
    throw new Error('Invalid DOCX file: word/document.xml not found.');
  }

  // Extract blocks (<w:p> and <w:tbl>) in physical document order
  const blockRegex = /<w:(p|tbl)\b[^>]*>([\s\S]*?)<\/w:\1>/gi;
  let match: RegExpExecArray | null;
  const blocks: DocxBlock[] = [];

  while ((match = blockRegex.exec(docXml)) !== null) {
    const tag = match[1];
    const content = match[2];

    if (tag === 'p') {
      const hasPageBreak = /<w:br\b[^>]*w:type="page"|<w:lastRenderedPageBreak/i.test(content);
      const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(content);
      const style = styleMatch ? styleMatch[1] : '';
      const isHeading = /^heading\d*$/i.test(style) || /^title$/i.test(style);

      const runParts: string[] = [];
      const itemRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>/gi;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        if (itemMatch[0].startsWith('<w:tab')) {
          runParts.push('    ');
        } else if (itemMatch[0].startsWith('<w:br')) {
          runParts.push('\n');
        } else if (itemMatch[1]) {
          runParts.push(decodeXmlEntities(itemMatch[1]));
        }
      }
      const text = runParts.join('').trim();
      if (text || hasPageBreak) {
        blocks.push({
          text,
          isHeading,
          headingText: isHeading ? text : undefined,
          hasPageBreak,
        });
      }
    } else if (tag === 'tbl') {
      const rows: string[] = [];
      const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRegex.exec(content)) !== null) {
        const trContent = trMatch[1];
        const cells: string[] = [];
        const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
        let tcMatch: RegExpExecArray | null;
        while ((tcMatch = tcRegex.exec(trContent)) !== null) {
          const tcContent = tcMatch[1];
          const cellTexts: string[] = [];
          const tRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>/gi;
          let tMatch: RegExpExecArray | null;
          while ((tMatch = tRegex.exec(tcContent)) !== null) {
            cellTexts.push(decodeXmlEntities(tMatch[1]));
          }
          cells.push(cellTexts.join('').trim());
        }
        if (cells.some((c) => c.length > 0)) {
          rows.push(cells.join(' | '));
        }
      }
      if (rows.length > 0) {
        blocks.push({
          text: rows.join('\n'),
          isHeading: false,
          hasPageBreak: false,
        });
      }
    }
  }

  if (blocks.length === 0) {
    return {
      pages: [{ pageNumber: 1, heading: 'Document', text: '' }],
      fullText: '',
      extractionMethod: 'docx-sections',
    };
  }

  // Group blocks into structured pages / sections.
  // We break on explicit page breaks or on major headings when accumulated text is substantial.
  const pages: StructuredPage[] = [];
  let currentPageBlocks: string[] = [];
  let currentHeading = '';
  let pageNumber = 1;

  const flushPage = () => {
    if (currentPageBlocks.length > 0) {
      const pageText = currentPageBlocks.join('\n\n').trim();
      if (pageText) {
        pages.push({
          pageNumber: pageNumber++,
          heading: currentHeading || `Section ${pages.length + 1}`,
          text: pageText,
        });
      }
      currentPageBlocks = [];
      currentHeading = '';
    }
  };

  for (const block of blocks) {
    if (block.hasPageBreak) {
      flushPage();
    } else if (block.isHeading && block.headingText) {
      // If we already have accumulated text for a section, start a new structured section on heading
      if (currentPageBlocks.length > 0) {
        flushPage();
      }
      currentHeading = block.headingText;
    }

    if (block.text) {
      if (!currentHeading && block.isHeading) {
        currentHeading = block.text;
      }
      currentPageBlocks.push(block.text);
    }
  }
  flushPage();

  if (pages.length === 0) {
    const rawAll = blocks.map((b) => b.text).filter(Boolean).join('\n\n');
    pages.push({
      pageNumber: 1,
      heading: 'Document',
      text: rawAll,
    });
  }

  const fullText = pages.map((p) => p.text).join('\n\f\n').trim();

  return {
    pages,
    fullText,
    extractionMethod: 'docx-sections',
  };
}
