/**
 * Utility to extract text content from uploaded files (.pdf, .txt, .md, .csv).
 */

export async function extractFileContent(file: File): Promise<{ name: string; content: string }> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('latin1');
      const rawText = textDecoder.decode(arrayBuffer);

      const matches: string[] = [];
      const tjRegex = /\(([^)]+)\)\s*T[jJ]/g;
      let match: RegExpExecArray | null;

      while ((match = tjRegex.exec(rawText)) !== null) {
        if (match[1]) matches.push(match[1]);
      }

      const arrayTjRegex = /\[([^\]]+)\]\s*TJ/g;
      while ((match = arrayTjRegex.exec(rawText)) !== null) {
        const inner = match[1].replace(/\(([^)]+)\)/g, '$1 ');
        matches.push(inner);
      }

      let extracted = matches.join(' ').replace(/\\\(|\\\)/g, '').replace(/\s+/g, ' ').trim();

      if (!extracted || extracted.length < 30) {
        const asciiStrings = rawText.match(/[A-Za-z0-9\s.,?!:;()\-\/]{4,}/g) || [];
        extracted = asciiStrings
          .filter((s) => !s.includes('obj') && !s.includes('endobj') && !s.includes('stream') && !s.includes('xref') && !s.includes('Font'))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (!extracted || extracted.length < 20) throw new Error('No readable PDF text was found.');
      return { name: file.name, content: extracted };
    } catch (err) {
      console.error('PDF text extraction error:', err);
      throw new Error('This PDF could not be read. Please upload a text-based PDF or try again with OCR enabled.');
    }
  }

  // Text file (.txt, .md, .csv, etc.)
  try {
    const text = await file.text();
    return { name: file.name, content: text };
  } catch (err) {
    return { name: file.name, content: '' };
  }
}
