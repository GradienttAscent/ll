function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]!));
}

/** A deterministic, local visual representation of extracted PPTX slide text. */
export function renderSlideSvg(title: string, slideNumber: number, text: string): string {
  const lines = text.replace(/\s+/g, ' ').trim().match(/.{1,62}(?:\s|$)/g) || ['(No readable slide text)'];
  const body = lines.slice(0, 14).map((line, index) => `<text x="88" y="${180 + index * 48}" class="body">${escapeXml(line.trim())}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><style>.title{font:600 38px Arial;fill:#fff}.body{font:28px Arial;fill:#f4efff}.meta{font:20px Arial;fill:#d8c9ff}</style><rect width="1280" height="720" fill="#21113c"/><rect x="0" y="0" width="26" height="720" fill="#8b5cf6"/><text x="88" y="88" class="meta">${escapeXml(title)} · Slide ${slideNumber}</text><text x="88" y="142" class="title">Slide ${slideNumber}</text>${body}</svg>`;
}
