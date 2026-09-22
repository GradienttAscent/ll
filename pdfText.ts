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
