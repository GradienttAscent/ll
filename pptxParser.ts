import { inflateRawSync } from 'zlib';

export interface PptxSlide {
  slideNumber: number;
  title: string;
  text: string;
}

/**
 * Reads entries from a ZIP buffer (e.g. .pptx or .docx) using standard ZIP format and Node zlib.
 * Does not depend on any third-party npm packages.
 */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  if (!buffer || buffer.length < 22) {
    return entries;
  }

  // Find End of Central Directory record (search backwards from end of file for PK\x05\x06)
  let eocdOffset = -1;
  const maxSearch = Math.min(buffer.length, 65536 + 22);
  const startSearch = buffer.length - 22;

  for (let i = startSearch; i >= buffer.length - maxSearch; i--) {
    if (i >= 0 && i + 4 <= buffer.length && buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    // If EOCD not found, try reading sequentially via local headers
    let offset = 0;
    while (offset + 30 <= buffer.length) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
      const compMethod = buffer.readUInt16LE(offset + 8);
      const compSize = buffer.readUInt32LE(offset + 18);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
      const dataOffset = offset + 30 + nameLen + extraLen;

      if (compSize > 0 && dataOffset + compSize <= buffer.length) {
        const compressed = buffer.subarray(dataOffset, dataOffset + compSize);
        let decompressed: Buffer;
        if (compMethod === 0) {
          decompressed = compressed;
        } else if (compMethod === 8) {
          try {
            decompressed = inflateRawSync(compressed);
          } catch {
            decompressed = Buffer.alloc(0);
          }
        } else {
          decompressed = Buffer.alloc(0);
        }
        entries.set(name, decompressed);
        offset = dataOffset + compSize;
      } else {
        offset = dataOffset;
      }
    }
    return entries;
  }

  const cdEntriesCount = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let currentCd = cdOffset;
  for (let i = 0; i < cdEntriesCount && currentCd + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(currentCd) !== 0x02014b50) break;

    const compMethod = buffer.readUInt16LE(currentCd + 10);
    const compSize = buffer.readUInt32LE(currentCd + 20);
    const uncompSize = buffer.readUInt32LE(currentCd + 24);
    const nameLen = buffer.readUInt16LE(currentCd + 28);
    const extraLen = buffer.readUInt16LE(currentCd + 30);
    const commentLen = buffer.readUInt16LE(currentCd + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentCd + 42);
    const filename = buffer.toString('utf8', currentCd + 46, currentCd + 46 + nameLen);

    currentCd += 46 + nameLen + extraLen + commentLen;

    if (compSize === 0 && uncompSize === 0) continue; // directory or empty file

    // From local header offset, skip 30 + localNameLen + localExtraLen
    if (localHeaderOffset + 30 <= buffer.length) {
      const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      if (dataStart + compSize <= buffer.length) {
        const rawData = buffer.subarray(dataStart, dataStart + compSize);
        try {
          if (compMethod === 0) {
            entries.set(filename, rawData);
          } else if (compMethod === 8) {
            entries.set(filename, inflateRawSync(rawData));
          }
        } catch {
          // Skip unreadable stream
        }
      }
    }
  }

  return entries;
}

/**
 * Extracts plain text from OpenXML slide XML.
 * Extracts paragraphs and runs inside <a:t> tags.
 */
function extractSlideXmlText(xml: string): { title: string; text: string } {
  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    const textRuns: string[] = [];
    const tRegex = /<a:t\b[^>]*>([^<]*)<\/a:t>/gi;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      const decoded = tMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      textRuns.push(decoded);
    }
    const line = textRuns.join('').trim();
    if (line) paragraphs.push(line);
  }

  if (paragraphs.length === 0) {
    // Fallback: search all <a:t>
    const fallbackRuns: string[] = [];
    const tRegex = /<a:t\b[^>]*>([^<]*)<\/a:t>/gi;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(xml)) !== null) {
      fallbackRuns.push(tMatch[1]);
    }
    const combined = fallbackRuns.join(' ').trim();
    return { title: combined.slice(0, 60), text: combined };
  }

  // Try to find explicit title placeholder shape
  let slideTitle = '';
  const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi;
  let spMatch: RegExpExecArray | null;
  while ((spMatch = spRegex.exec(xml)) !== null) {
    const spContent = spMatch[1];
    if (/<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(spContent)) {
      const titleRuns: string[] = [];
      const tRegex = /<a:t\b[^>]*>([^<]*)<\/a:t>/gi;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(spContent)) !== null) {
        titleRuns.push(
          tMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
        );
      }
      const t = titleRuns.join('').trim();
      if (t) {
        slideTitle = t;
        break;
      }
    }
  }

  const title = slideTitle || paragraphs[0] || '';
  const text = paragraphs.join('\n');
  return { title, text };
}

/**
 * Extracts slides from a PPTX buffer, returning structured slides in slide-number order.
 */
export function extractPptxSlides(buffer: Buffer): PptxSlide[] {
  const entries = readZipEntries(buffer);
  const slideEntries: Array<{ num: number; xml: string }> = [];

  for (const [path, content] of entries.entries()) {
    const match = /ppt\/slides\/slide(\d+)\.xml$/i.exec(path);
    if (match) {
      slideEntries.push({
        num: parseInt(match[1], 10),
        xml: content.toString('utf8'),
      });
    }
  }

  slideEntries.sort((a, b) => a.num - b.num);

  return slideEntries.map((entry) => {
    const { title, text } = extractSlideXmlText(entry.xml);
    return {
      slideNumber: entry.num,
      title: title || `Slide ${entry.num}`,
      text: text || `Slide ${entry.num}`,
    };
  });
}
