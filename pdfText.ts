import { inflateSync, inflateRawSync } from 'zlib';

function decodePdfString(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfHexString(value: string): string {
  const cleaned = value.replace(/[^0-9A-Fa-f]/g, '');
  if (!cleaned) return '';
  const padded = cleaned.length % 2 === 1 ? cleaned + '0' : cleaned;
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    bytes.push(parseInt(padded.slice(i, i + 2), 16) || 0);
  }
  // Check for UTF-16BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const chars: string[] = [];
    for (let i = 2; i < bytes.length; i += 2) {
      chars.push(String.fromCharCode((bytes[i] << 8) | (bytes[i + 1] || 0)));
    }
    return chars.join('');
  }
  // Check for 2-byte UTF-16BE with null high bytes
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] >= 32 && bytes[1] <= 126) {
    const chars: string[] = [];
    for (let i = 0; i < bytes.length; i += 2) {
      chars.push(String.fromCharCode((bytes[i] << 8) | (bytes[i + 1] || 0)));
    }
    return chars.join('');
  }
  return Buffer.from(bytes).toString('latin1');
}

/** Parses elements inside a TJ array: literal strings (...) and hex strings <...>. */
function parseTjArray(source: string): string {
  const tokenRegex = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>/g;
  const parts: string[] = [];
  for (const match of source.matchAll(tokenRegex)) {
    const token = match[0];
    if (token.startsWith('(')) {
      parts.push(decodePdfString(token.slice(1, -1)));
    } else if (token.startsWith('<')) {
      parts.push(decodePdfHexString(token.slice(1, -1)));
    }
  }
  return parts.join('');
}

// Text-positioning operators that begin a new line inside a PDF text object.
const PDF_LINE_BREAK = /\b(?:Td|TD|Tm|T\*|ET)\b/g;

/** Groups text operators into physical lines so question-paper structure is preserved. */
export function pdfLineSegments(source: string): string[] {
  // Normalize lexical newlines outside of literal strings (...) into spaces so raw PostScript/PDF
  // line wrapping does not fragment text runs into artificial single-token lines.
  let cleanSource = '';
  let inParen = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' && (i === 0 || source[i - 1] !== '\\')) inParen++;
    else if (ch === ')' && inParen > 0 && (i === 0 || source[i - 1] !== '\\')) inParen--;

    if (inParen === 0 && (ch === '\r' || ch === '\n')) {
      cleanSource += ' ';
    } else {
      cleanSource += ch;
    }
  }

  // Replace text-positioning operators with line breaks, preserving same-line text runs:
  // - Tm (a b c d e f Tm): breaks a line if vertical position f shifts beyond line threshold
  // - Td / TD (tx ty Td): breaks a line if vertical displacement ty is non-zero
  // - Standalone ET / Td / TD / Tm: breaks a line unconditionally
  let lastY: number | null = null;
  const marked = cleanSource.replace(
    /(?:(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm)|(?:(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD))|\bET\b|\b(?:Td|TD|Tm)\b/g,
    (match, _a, _b, _c, _d, _e, f, _tx, ty) => {
      if (f !== undefined) {
        const y = parseFloat(f);
        if (lastY === null || Math.abs(lastY - y) > 6) {
          lastY = y;
          return '\n';
        }
        lastY = y;
        return ' ';
      }
      if (ty !== undefined) {
        const dy = parseFloat(ty);
        if (Math.abs(dy) > 0.1) {
          lastY = null;
          return '\n';
        }
        return ' ';
      }
      lastY = null;
      return '\n';
    }
  );

  // Match all PDF text extraction operators:
  // - Literal string: `(...) Tj`
  // - Hex string: `<...> Tj`
  // - TJ array: `[...] TJ`
  const combined = /\((?:\\.|[^\\)])*\)\s*Tj|<[0-9A-Fa-f\s]*>\s*Tj|\[((?:\\.|[^\\\]])*)\]\s*TJ/g;
  const runs: Array<{ text: string; index: number }> = [];

  for (const match of marked.matchAll(combined)) {
    const rawMatch = match[0];
    let text = '';
    if (rawMatch.startsWith('[')) {
      text = parseTjArray(match[1] ?? '');
    } else if (rawMatch.startsWith('(')) {
      const strContent = rawMatch.replace(/\s*Tj$/, '').slice(1, -1);
      text = decodePdfString(strContent);
    } else if (rawMatch.startsWith('<')) {
      const hexContent = rawMatch.replace(/\s*Tj$/, '').slice(1, -1);
      text = decodePdfHexString(hexContent);
    }
    if (text) {
      runs.push({ text, index: match.index ?? 0 });
    }
  }

  const pending: Array<{ text: string; line: number }> = [];
  for (const run of runs) {
    const line = (marked.slice(0, run.index).match(/\n/g) || []).length;
    pending.push({ text: run.text, line });
  }

  const byLine = new Map<number, string>();
  for (const item of pending) {
    const existing = byLine.get(item.line) || '';
    byLine.set(item.line, `${existing}${item.text}`);
  }

  return [...byLine.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, text]) => text.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Heuristics that flag extractions which lost their layout/structure. The worst offender
 * seen in production is "word-per-line" text: a scanned/vector PDF whose embedded runs
 * produce one token per physical line. Such text has no sentence structure to anchor the
 * question-number splitter and silently fabricates phantom questions, so callers should
 * force the AI OCR path instead of parsing it directly.
 */
export function extractionIsLowQuality(text: string): boolean {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return true;

  // Unprintable control codes (e.g. font glyph substitution or binary extraction corruptions)
  const controlChars = (normalized.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  if (controlChars > 5 && controlChars / normalized.length > 0.03) {
    return true;
  }

  const nonWhitespace = normalized.replace(/\s/g, '');
  const printableAlnum = (nonWhitespace.match(/[A-Za-z0-9]/g) || []).length;
  if (nonWhitespace.length > 30 && printableAlnum / nonWhitespace.length < 0.35) {
    return true;
  }

  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  // Documents with few physical lines are either well-formed single-line papers (pasted
  // text) or short fragments; neither should be forced through OCR blindly.
  if (lines.length < 10) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const singleTokenLines = lines.filter((line) => !/\s/.test(line.trim())).length;
  const avgTokensPerLine = tokens.length / lines.length;
  const singleTokenRatio = singleTokenLines / lines.length;
  const sentenceStops = (normalized.match(/[.!?](?=\s|["')\]]|$)/g) || []).length;

  // If a document has rich text structure (e.g. multiple full sentence terminators and substantial length),
  // it is not low-quality character soup even if vertical layout has narrow columns or short lines.
  if (sentenceStops >= 5 && normalized.length > 500) {
    return false;
  }

  // Word-per-line breakdown: the overwhelming majority of lines are a lone token.
  if (avgTokensPerLine < 2.5 && singleTokenRatio > 0.5) return true;
  // A long run of text with zero sentence terminators is unreadable character soup.
  if (sentenceStops === 0 && normalized.length > 1200) return true;
  return false;
}

export interface PdfPage {
  pageNumber: number;
  text: string;
}

/**
 * Extracts structured physical pages from a PDF.
 * Each page retains its 1-indexed pageNumber and clean text.
 */
export function extractPdfPages(payload: Buffer): PdfPage[] {
  const raw = payload.toString('latin1');
  const streamPattern = /([^]*?)stream\r?\n([^]*?)endstream/g;
  const decodedStreams: string[] = [];

  for (const match of raw.matchAll(streamPattern)) {
    const dictHeader = match[1].slice(-2048);
    const isFlate = /FlateDecode/i.test(dictHeader);
    const rawStream = match[2];

    if (isFlate) {
      let decompressed: string | null = null;
      const streamBuf = Buffer.from(rawStream, 'latin1');
      try {
        decompressed = inflateSync(streamBuf).toString('latin1');
      } catch {
        try {
          decompressed = inflateRawSync(streamBuf).toString('latin1');
        } catch {
          const trimmed = Buffer.from(rawStream.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1');
          try {
            decompressed = inflateSync(trimmed).toString('latin1');
          } catch {
            try {
              decompressed = inflateRawSync(trimmed).toString('latin1');
            } catch {
              /* ignore uncompressed or unsupported filter */
            }
          }
        }
      }
      if (decompressed) {
        decodedStreams.push(decompressed);
      }
    } else {
      // Uncompressed stream
      decodedStreams.push(rawStream);
    }
  }

  if (decodedStreams.length === 0) {
    decodedStreams.push(raw);
  }

  const pageCandidates: string[] = [];
  for (const stream of decodedStreams) {
    const lines = pdfLineSegments(stream);
    const pageText = lines.join('\n').trim();
    if (pageText) {
      pageCandidates.push(pageText);
    }
  }

  if (pageCandidates.length === 0) {
    const allLines = decodedStreams.flatMap(pdfLineSegments);
    const fullText = allLines.join('\n').trim();
    if (fullText) pageCandidates.push(fullText);
  }

  // If streams produced no usable text, also check raw content for uncompressed text blocks
  if (pageCandidates.length === 0 || pageCandidates.every((c) => c.length < 20)) {
    const rawLines = pdfLineSegments(raw);
    const rawText = rawLines.join('\n').trim();
    if (rawText.length >= 20) {
      pageCandidates.length = 0;
      pageCandidates.push(rawText);
    }
  }

  const resultPages: PdfPage[] = [];
  let pageNum = 1;
  for (const candidate of pageCandidates) {
    if (candidate.includes('\f')) {
      const parts = candidate.split('\f').map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        resultPages.push({ pageNumber: pageNum++, text: part });
      }
    } else {
      resultPages.push({ pageNumber: pageNum++, text: candidate });
    }
  }

  return resultPages.length > 0 ? resultPages : [{ pageNumber: 1, text: '' }];
}

/** Extracts embedded PDF text only. Preserves form-feed page boundaries. */
export function extractPdfText(payload: Buffer): string {
  const pages = extractPdfPages(payload);
  const text = pages.map((p) => p.text).filter(Boolean).join('\n\f\n').trim();
  if (text.length < 20) throw new Error('No readable text was found in this PDF. Upload a text-based PDF or configure GEMINI_API_KEY for OCR analysis.');
  return text;
}
