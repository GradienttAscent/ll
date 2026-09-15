import { inflateSync } from 'zlib';

function decodePdfString(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char] || char))
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function textOperators(source: string): string[] {
  const parts: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const array = /\[((?:\\.|[^\\\]])*)\]\s*TJ/g;
  for (const match of source.matchAll(literal)) parts.push(decodePdfString(match[0].replace(/\s*Tj$/, '').slice(1, -1)));
  for (const match of source.matchAll(array)) {
    for (const item of match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) parts.push(decodePdfString(item[0].slice(1, -1)));
  }
  return parts;
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
  const text = sources.flatMap(textOperators).join('\n').replace(/\s+/g, ' ').trim();
  if (text.length < 20) throw new Error('No readable text was found in this PDF. Upload a text-based PDF or configure GEMINI_API_KEY for OCR analysis.');
  return text;
}
