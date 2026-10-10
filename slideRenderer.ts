import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDataDirectory } from './db';
import type { DocumentRow, DocumentPageRecord } from './services';

const execFileAsync = promisify(execFile);

export interface RenderedSlideImage {
  data: Buffer;
  contentType: 'image/png' | 'image/svg+xml';
}

function getSlidesDir(documentId: string): string {
  const dir = path.join(getDataDirectory(), 'slides', documentId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Creates an attractive 16:9 SVG visual representation of a slide as a resilient fallback.
 */
export function generateSvgSlideFallback(heading: string, text: string, slideNumber: number, totalSlides: number, docTitle: string): Buffer {
  const safeTitle = escapeXml(docTitle || 'Presentation');
  const safeHeading = escapeXml(heading || `Slide ${slideNumber}`);
  
  // Format body text: take first 8-10 non-empty lines, wrap nicely
  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== heading.trim())
    .slice(0, 10);

  const bodySvg = lines.map((line, idx) => {
    const isBullet = line.startsWith('•') || line.startsWith('-') || /^[A-Z0-9\s—]+:/.test(line);
    const bulletPrefix = isBullet ? '' : '• ';
    const cleanLine = escapeXml(line.slice(0, 95));
    const yPos = 240 + (idx * 38);
    const fill = isBullet ? '#d8c9ff' : '#e2dee6';
    const fontWeight = isBullet ? '600' : '400';
    return `<text x="80" y="${yPos}" fill="${fill}" font-size="22" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="${fontWeight}">${bulletPrefix}${cleanLine}</text>`;
  }).join('\n    ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14111a"/>
      <stop offset="50%" stop-color="#1c1824"/>
      <stop offset="100%" stop-color="#120f18"/>
    </linearGradient>
    <linearGradient id="purpleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1280" height="720" fill="url(#bg)"/>
  
  <!-- Subtle border -->
  <rect x="20" y="20" width="1240" height="680" rx="16" fill="none" stroke="#2d2638" stroke-width="2"/>

  <!-- Top Accent Bar -->
  <rect x="40" y="40" width="1200" height="4" rx="2" fill="url(#purpleGlow)"/>

  <!-- Header Section -->
  <text x="80" y="95" fill="#a78bfa" font-size="14" font-weight="700" letter-spacing="1.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">LAZYLIFT VERIFIED SOURCE &middot; ACADEMIC LECTURE SLIDE</text>
  
  <!-- Slide Badge -->
  <rect x="1100" y="70" width="100" height="32" rx="8" fill="#292036" stroke="#4c3d64" stroke-width="1"/>
  <text x="1150" y="91" fill="#c4b5fd" font-size="14" font-weight="700" text-anchor="middle" font-family="monospace">SLIDE ${slideNumber}</text>

  <!-- Heading -->
  <text x="80" y="165" fill="#f5f3f7" font-size="34" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">${safeHeading}</text>

  <!-- Divider Line -->
  <line x1="80" y1="195" x2="1200" y2="195" stroke="#332a40" stroke-width="1"/>

  <!-- Body Content -->
  <g>
    ${bodySvg}
  </g>

  <!-- Footer -->
  <line x1="80" y1="640" x2="1200" y2="640" stroke="#2b2336" stroke-width="1"/>
  <text x="80" y="670" fill="#7b7484" font-size="14" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">${safeTitle}</text>
  <text x="1200" y="670" fill="#7b7484" font-size="14" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">Slide ${slideNumber} of ${totalSlides}</text>
</svg>`;

  return Buffer.from(svg, 'utf8');
}

/**
 * Converts a PPTX document payload to a PDF and caches it.
 */
export async function getOrConvertPptxToPdf(docId: string, pptxData: Buffer | Uint8Array): Promise<string | null> {
  const slidesDir = getSlidesDir(docId);
  const cachedPdfPath = path.join(slidesDir, 'converted.pdf');

  if (fs.existsSync(cachedPdfPath) && fs.statSync(cachedPdfPath).size > 100) {
    return cachedPdfPath;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `pptx-conv-${docId}-`));
  const tmpPptxPath = path.join(tmpDir, 'source.pptx');
  const pptxBuffer = Buffer.isBuffer(pptxData) ? pptxData : Buffer.from(pptxData);

  try {
    fs.writeFileSync(tmpPptxPath, pptxBuffer);
    // Use soffice / libreoffice headless conversion
    await execFileAsync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, tmpPptxPath], { timeout: 20000 });
    const tmpPdfPath = path.join(tmpDir, 'source.pdf');
    if (fs.existsSync(tmpPdfPath) && fs.statSync(tmpPdfPath).size > 100) {
      fs.copyFileSync(tmpPdfPath, cachedPdfPath);
      return cachedPdfPath;
    }
    return null;
  } catch (err) {
    console.warn(`[slideRenderer] PPTX to PDF conversion failed for ${docId}:`, (err as Error).message);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

/**
 * Extracts a PNG slide image using pdftoppm from a PDF file.
 */
export async function extractPngFromPdf(pdfPath: string, pageNumber: number, outPngPath: string): Promise<boolean> {
  const tmpPrefix = path.join(os.tmpdir(), `ppm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  try {
    // pdftoppm -png -f <page> -l <page> -r 150 <pdf> <prefix>
    await execFileAsync('pdftoppm', ['-png', '-f', String(pageNumber), '-l', String(pageNumber), '-r', '150', pdfPath, tmpPrefix], { timeout: 15000 });
    
    // pdftoppm outputs files named like <prefix>-1.png or <prefix>-01.png
    const dir = path.dirname(tmpPrefix);
    const base = path.basename(tmpPrefix);
    const generated = fs.readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith('.png'));

    if (generated.length > 0) {
      const generatedPath = path.join(dir, generated[0]);
      fs.copyFileSync(generatedPath, outPngPath);
      try { fs.unlinkSync(generatedPath); } catch {}
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[slideRenderer] pdftoppm failed for page ${pageNumber}:`, (err as Error).message);
    return false;
  }
}

/**
 * Retrieves or renders the slide image for a given document and slide number.
 * Always succeeds by providing either a native high-res PNG or an SVG vector slide graphic.
 */
export async function renderSlideImage(
  doc: DocumentRow,
  pages: DocumentPageRecord[],
  slideNumber: number,
  rawFileData?: Buffer | Uint8Array | null
): Promise<RenderedSlideImage> {
  const fileData = rawFileData ? (Buffer.isBuffer(rawFileData) ? rawFileData : Buffer.from(rawFileData)) : null;
  const slidesDir = getSlidesDir(doc.id);
  const cachedPngPath = path.join(slidesDir, `slide-${slideNumber}.png`);

  if (fs.existsSync(cachedPngPath) && fs.statSync(cachedPngPath).size > 200) {
    return {
      data: fs.readFileSync(cachedPngPath),
      contentType: 'image/png',
    };
  }

  const isPdf = doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.title);
  const isPptx = doc.mimeType?.includes('presentation') || doc.mimeType?.includes('powerpoint') || /\.(pptx|ppt)$/i.test(doc.title);

  if (fileData && fileData.length > 0) {
    if (isPdf) {
      const tmpPdf = path.join(slidesDir, 'source.pdf');
      if (!fs.existsSync(tmpPdf)) {
        fs.writeFileSync(tmpPdf, fileData);
      }
      const ok = await extractPngFromPdf(tmpPdf, slideNumber, cachedPngPath);
      if (ok && fs.existsSync(cachedPngPath)) {
        return { data: fs.readFileSync(cachedPngPath), contentType: 'image/png' };
      }
    } else if (isPptx) {
      const pdfPath = await getOrConvertPptxToPdf(doc.id, fileData);
      if (pdfPath) {
        const ok = await extractPngFromPdf(pdfPath, slideNumber, cachedPngPath);
        if (ok && fs.existsSync(cachedPngPath)) {
          return { data: fs.readFileSync(cachedPngPath), contentType: 'image/png' };
        }
      }
    }
  }

  // Resilient fallback: Generate clean vector SVG slide graphic
  const page = pages.find((p) => p.pageNumber === slideNumber) || pages[0];
  const heading = page?.heading || `Slide ${slideNumber}`;
  const text = page?.text || '';
  const totalSlides = Math.max(pages.length, ...pages.map((p) => p.pageNumber));

  const svgBuffer = generateSvgSlideFallback(heading, text, slideNumber, totalSlides, doc.title);
  return {
    data: svgBuffer,
    contentType: 'image/svg+xml',
  };
}
