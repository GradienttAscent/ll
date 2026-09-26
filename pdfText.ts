import { inflateSync } from 'zlib';

function decodePdfString(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

// Text-positioning operators that begin a new line inside a PDF text object.
const PDF_LINE_BREAK = /\b(?:Td|TD|Tm|T\*|ET)\b/g;

/** Groups text operators into physical lines so question-paper structure is preserved. */
function pdfLineSegments(source: string): string[] {
  const marked = source.replace(PDF_LINE_BREAK, '\n');
  const combined = /\((?:\\.|[^\\)])*\)\s*Tj|\[((?:\\.|[^\\\]])*)\]\s*TJ/g;
  const runs: Array<{ text: string; index: number }> = [];
  for (const match of marked.matchAll(combined)) {
    const isArray = match[0][0] === '[';
    const text = isArray
      ? [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((item) => decodePdfString(item[0].slice(1, -1))).join('')
      : decodePdfString(match[0].replace(/\s*Tj$/, '').slice(1, -1));
    if (text) runs.push({ text, index: match.index ?? 0 });
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
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  // Documents with few physical lines are either well-formed single-line papers (pasted
  // text) or short fragments; neither should be forced through OCR blindly.
  if (lines.length < 10) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const singleTokenLines = lines.filter((line) => !/\s/.test(line.trim())).length;
  const avgTokensPerLine = tokens.length / lines.length;
  const singleTokenRatio = singleTokenLines / lines.length;
  // Word-per-line breakdown: the overwhelming majority of lines are a lone token.
  if (avgTokensPerLine < 2.5 && singleTokenRatio > 0.5) return true;
  // A long run of text with zero sentence terminators is unreadable character soup.
  const sentenceStops = (normalized.match(/[.!?](?=\s|["')\]]|$)/g) || []).length;
  if (sentenceStops === 0 && normalized.length > 1200) return true;
  return false;
}

/** Extracts embedded PDF text only. Callers must surface failure rather than inventing content. */
export function extractPdfText(payload: Buffer): string {
  const raw = payload.toString('latin1');
  const sources = [raw];
  const streamPattern = /([^]*?)stream\r?\n([^]*?)endstream/g;
  for (const match of raw.matchAll(streamPattern)) {
    if (!/FlateDecode/.test(match[1].slice(-300))) continue;
    try { sources.push(inflateSync(Buffer.from(match[2], 'latin1')).toString('latin1')); } catch { /* Some PDF streams use unsupported filters. */ }
  }
  const lines = sources.flatMap(pdfLineSegments);
  const text = lines.join('\n').trim();
  if (text.length < 20) throw new Error('No readable text was found in this PDF. Upload a text-based PDF or configure GEMINI_API_KEY for OCR analysis.');
  return text;
}
