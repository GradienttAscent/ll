import { inflateSync, inflateRawSync } from 'zlib';

export function decodeAscii85(input: string | Buffer): Buffer {
  const str = typeof input === 'string' ? input : input.toString('latin1');
  const cleaned = str.replace(/<~|~>/g, '').replace(/\s+/g, '');
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned.charCodeAt(i);
    if (c === 122 && count === 0) {
      // 'z' stands for 4 zero bytes
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    tuple = tuple * 85 + (c - 33);
    count++;
    if (count === 5) {
      out.push((tuple >> 24) & 0xff, (tuple >> 16) & 0xff, (tuple >> 8) & 0xff, tuple & 0xff);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 1) {
    for (let i = count; i < 5; i++) {
      tuple = tuple * 85 + 84;
    }
    for (let i = 0; i < count - 1; i++) {
      out.push((tuple >> (24 - i * 8)) & 0xff);
    }
  }
  return Buffer.from(out);
}

export function decodeAsciiHex(input: string | Buffer): Buffer {
  const str = typeof input === 'string' ? input : input.toString('latin1');
  const cleaned = str.replace(/[^0-9A-Fa-f]/g, '');
  const padded = cleaned.length % 2 === 1 ? cleaned + '0' : cleaned;
  return Buffer.from(padded, 'hex');
}

export function parseToUnicodeCMap(cmapText: string): Map<number, string> {
  const map = new Map<number, string>();
  // bfchar: <srcHex> <dstHex>
  const bfcharBlocks = cmapText.matchAll(/\d+\s+beginbfchar([\s\S]*?)endbfchar/gi);
  for (const block of bfcharBlocks) {
    const lines = block[1].matchAll(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g);
    for (const match of lines) {
      const src = parseInt(match[1], 16);
      const dstHex = match[2];
      let str = '';
      for (let i = 0; i < dstHex.length; i += 4) {
        str += String.fromCharCode(parseInt(dstHex.slice(i, i + 4), 16));
      }
      map.set(src, str);
    }
  }

  // bfrange: <startHex> <endHex> <dstStartHex> or <startHex> <endHex> [ <dstHex> ... ]
  const bfrangeBlocks = cmapText.matchAll(/\d+\s+beginbfrange([\s\S]*?)endbfrange/gi);
  for (const block of bfrangeBlocks) {
    const lines = block[1].matchAll(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g);
    for (const match of lines) {
      const start = parseInt(match[1], 16);
      const end = parseInt(match[2], 16);
      if (match[3]) {
        const dstStart = parseInt(match[3], 16);
        for (let code = start; code <= end; code++) {
          map.set(code, String.fromCharCode(dstStart + (code - start)));
        }
      } else if (match[4]) {
        const hexes = [...match[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => m[1]);
        hexes.forEach((hex, idx) => {
          let str = '';
          for (let i = 0; i < hex.length; i += 4) {
            str += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
          }
          map.set(start + idx, str);
        });
      }
    }
  }
  return map;
}

function decodePdfString(value: string, cmap?: Map<number, string>): string {
  const decoded = value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));

  if (!cmap || cmap.size === 0) return decoded;
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    result += cmap.has(code) ? cmap.get(code)! : decoded[i];
  }
  return result;
}

function decodePdfHexString(value: string, cmap?: Map<number, string>): string {
  const cleaned = value.replace(/[^0-9A-Fa-f]/g, '');
  if (!cleaned) return '';

  if (cmap && cmap.size > 0) {
    let result = '';
    const step = cleaned.length % 4 === 0 && cleaned.length >= 4 ? 4 : 2;
    for (let i = 0; i < cleaned.length; i += step) {
      const code = parseInt(cleaned.slice(i, i + step), 16);
      if (cmap.has(code)) {
        result += cmap.get(code)!;
      } else if (code >= 32 && code <= 126) {
        result += String.fromCharCode(code);
      }
    }
    return result;
  }

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
function parseTjArray(source: string, cmap?: Map<number, string>): string {
  const tokenRegex = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>/g;
  const parts: string[] = [];
  for (const match of source.matchAll(tokenRegex)) {
    const token = match[0];
    if (token.startsWith('(')) {
      parts.push(decodePdfString(token.slice(1, -1), cmap));
    } else if (token.startsWith('<')) {
      parts.push(decodePdfHexString(token.slice(1, -1), cmap));
    }
  }
  return parts.join('');
}

function decompressPdfStream(dictHeader: string, rawStream: string): string | null {
  let streamBuf = Buffer.from(rawStream, 'latin1');
  const isAscii85 = /ASCII85Decode/i.test(dictHeader);
  const isAsciiHex = /ASCIIHexDecode/i.test(dictHeader);
  const isFlate = /FlateDecode/i.test(dictHeader);

  if (isAscii85) {
    streamBuf = decodeAscii85(streamBuf);
  } else if (isAsciiHex) {
    streamBuf = decodeAsciiHex(streamBuf);
  }

  if (isFlate) {
    try {
      return inflateSync(streamBuf).toString('latin1');
    } catch {
      try {
        return inflateRawSync(streamBuf).toString('latin1');
      } catch {
        const trimmed = Buffer.from(rawStream.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1');
        try {
          return inflateSync(trimmed).toString('latin1');
        } catch {
          try {
            return inflateRawSync(trimmed).toString('latin1');
          } catch {
            return null;
          }
        }
      }
    }
  }
  return streamBuf.toString('latin1');
}

/** Groups text operators into physical lines so question-paper structure is preserved. */
export function pdfLineSegments(
  source: string,
  fontMap?: Map<string, Map<number, string>> | Map<number, string>
): string[] {
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

  let activeCMap: Map<number, string> | undefined =
    fontMap instanceof Map && !(fontMap.keys().next().value && typeof fontMap.keys().next().value === 'string')
      ? (fontMap as Map<number, string>)
      : undefined;

  const fontResourceMap = fontMap instanceof Map && typeof fontMap.keys().next().value === 'string'
    ? (fontMap as Map<string, Map<number, string>>)
    : undefined;

  // Track fonts and positioning operators
  let lastY: number | null = null;
  const marked = cleanSource.replace(
    /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|(?:(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm)|(?:(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD))|\bET\b|\b(?:Td|TD|Tm)\b/g,
    (match, fontName, _a, _b, _c, _d, _e, f, _tx, ty) => {
      if (fontName) {
        if (fontResourceMap && fontResourceMap.has(fontName)) {
          activeCMap = fontResourceMap.get(fontName);
        }
        return '';
      }
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
        return '';
      }
      lastY = null;
      return '\n';
    }
  );

  const combined = /\((?:\\.|[^\\)])*\)\s*Tj|<[0-9A-Fa-f\s]*>\s*Tj|\[((?:\\.|[^\\\]])*)\]\s*TJ/g;
  const runs: Array<{ text: string; index: number }> = [];

  for (const match of marked.matchAll(combined)) {
    const rawMatch = match[0];
    let text = '';
    if (rawMatch.startsWith('[')) {
      text = parseTjArray(match[1] ?? '', activeCMap);
    } else if (rawMatch.startsWith('(')) {
      const strContent = rawMatch.replace(/\s*Tj$/, '').slice(1, -1);
      text = decodePdfString(strContent, activeCMap);
    } else if (rawMatch.startsWith('<')) {
      const hexContent = rawMatch.replace(/\s*Tj$/, '').slice(1, -1);
      text = decodePdfHexString(hexContent, activeCMap);
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
  if (lines.length < 10) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const singleTokenLines = lines.filter((line) => !/\s/.test(line.trim())).length;
  const avgTokensPerLine = tokens.length / lines.length;
  const singleTokenRatio = singleTokenLines / lines.length;
  const sentenceStops = (normalized.match(/[.!?](?=\s|["')\]]|$)/g) || []).length;

  if (sentenceStops >= 5 && normalized.length > 500) {
    return false;
  }

  if (avgTokensPerLine < 2.5 && singleTokenRatio > 0.5) return true;
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

  // Match all PDF indirect objects
  const objRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  const objects = new Map<number, string>();
  for (const match of raw.matchAll(objRegex)) {
    const id = parseInt(match[1], 10);
    objects.set(id, match[3]);
  }

  // Find all ToUnicode CMaps
  const cmaps = new Map<number, Map<number, string>>();
  const allCMapEntries = new Map<number, string>();

  const scanForCMap = (id: number, body: string) => {
    if (/begincmap/i.test(body)) {
      const cmap = parseToUnicodeCMap(body);
      cmaps.set(id, cmap);
      for (const [k, v] of cmap.entries()) allCMapEntries.set(k, v);
    } else {
      const sm = /stream\r?\n([\s\S]*?)endstream/.exec(body);
      if (sm) {
        const header = body.slice(0, sm.index);
        const dec = decompressPdfStream(header, sm[1]);
        if (dec && /begincmap/i.test(dec)) {
          const cmap = parseToUnicodeCMap(dec);
          cmaps.set(id, cmap);
          for (const [k, v] of cmap.entries()) allCMapEntries.set(k, v);
        }
      }
    }
  };

  for (const [id, body] of objects.entries()) {
    scanForCMap(id, body);
  }

  // Map font objects to their CMap
  const fontToCMap = new Map<number, Map<number, string>>();
  for (const [id, body] of objects.entries()) {
    const toUnicodeMatch = /\/ToUnicode\s+(\d+)\s+\d+\s+R/i.exec(body);
    if (toUnicodeMatch) {
      const cmapId = parseInt(toUnicodeMatch[1], 10);
      const cmap = cmaps.get(cmapId);
      if (cmap) fontToCMap.set(id, cmap);
    }
  }

  // Attempt resolving pages via PDF page tree (/Type /Page)
  const resolvedPages: Array<{ id: number; contents: number[]; fontMap: Map<string, Map<number, string>> }> = [];
  for (const [id, body] of objects.entries()) {
    if (/\/Type\s*\/Page\b/i.test(body)) {
      const contentsMatch = /\/Contents\s+(?:(\d+)\s+\d+\s+R|\[([\s\S]*?)\])/i.exec(body);
      const contents: number[] = [];
      if (contentsMatch) {
        if (contentsMatch[1]) {
          contents.push(parseInt(contentsMatch[1], 10));
        } else if (contentsMatch[2]) {
          for (const ref of contentsMatch[2].matchAll(/(\d+)\s+\d+\s+R/g)) {
            contents.push(parseInt(ref[1], 10));
          }
        }
      }
      const fontMap = new Map<string, Map<number, string>>();
      const fontResMatch = /\/Font\s*<<([\s\S]*?)>>/i.exec(body);
      if (fontResMatch) {
        for (const f of fontResMatch[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)) {
          const fontId = parseInt(f[2], 10);
          const cmap = fontToCMap.get(fontId);
          if (cmap) fontMap.set(f[1], cmap);
        }
      }
      resolvedPages.push({ id, contents, fontMap });
    }
  }

  // If page objects were successfully identified and contain content streams:
  if (resolvedPages.length > 0) {
    const resultPages: PdfPage[] = [];
    let pageNumber = 1;

    for (const pageObj of resolvedPages) {
      const streamTexts: string[] = [];
      for (const contentId of pageObj.contents) {
        const body = objects.get(contentId);
        if (!body) continue;
        const sm = /stream\r?\n([\s\S]*?)endstream/.exec(body);
        if (sm) {
          const header = body.slice(0, sm.index);
          const decomp = decompressPdfStream(header, sm[1]);
          if (decomp) {
            const fontArg = pageObj.fontMap.size > 0 ? pageObj.fontMap : allCMapEntries;
            const lines = pdfLineSegments(decomp, fontArg);
            const joined = lines.join('\n').trim();
            if (joined) streamTexts.push(joined);
          }
        }
      }
      const pageText = streamTexts.join('\n').trim();
      if (pageText) {
        resultPages.push({ pageNumber: pageNumber++, text: pageText });
      }
    }

    if (resultPages.length > 0) {
      return resultPages;
    }
  }

  // Fallback: Scan all streams sequentially
  const streamPattern = /([^]*?)stream\r?\n([^]*?)endstream/g;
  const decodedStreams: string[] = [];

  for (const match of raw.matchAll(streamPattern)) {
    const dictHeader = match[1].slice(-2048);
    // Skip image and binary font streams
    if (/\/Subtype\s*\/Image\b/i.test(dictHeader) || /\/Type\s*\/FontDescriptor\b/i.test(dictHeader)) {
      continue;
    }
    const decomp = decompressPdfStream(dictHeader, match[2]);
    if (decomp) {
      decodedStreams.push(decomp);
    }
  }

  if (decodedStreams.length === 0) {
    decodedStreams.push(raw);
  }

  const pageCandidates: string[] = [];
  for (const stream of decodedStreams) {
    const lines = pdfLineSegments(stream, allCMapEntries);
    const pageText = lines.join('\n').trim();
    if (pageText) {
      pageCandidates.push(pageText);
    }
  }

  if (pageCandidates.length === 0) {
    const allLines = decodedStreams.flatMap((s) => pdfLineSegments(s, allCMapEntries));
    const fullText = allLines.join('\n').trim();
    if (fullText) pageCandidates.push(fullText);
  }

  if (pageCandidates.length === 0 || pageCandidates.every((c) => c.length < 20)) {
    const rawLines = pdfLineSegments(raw, allCMapEntries);
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
