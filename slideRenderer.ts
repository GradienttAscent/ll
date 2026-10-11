import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDataDirectory } from './db';
import type { DocumentRow, DocumentPageRecord } from './services';

const execFileAsync = promisify(execFile);
export const SLIDE_RENDERER_VERSION = 'libreoffice-pdftoppm-v2';

export interface RenderedSlideImage {
  data: Buffer;
  contentType: 'image/png';
}

export class SlideRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlideRenderError';
  }
}

const renderJobs = new Map<string, Promise<RenderedSlideImage>>();
const conversionJobs = new Map<string, Promise<string>>();

function sourceHash(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function slideRenderCacheKey(data: Buffer | Uint8Array): string {
  return `${sourceHash(data)}-${SLIDE_RENDERER_VERSION}`;
}

function cacheDir(data: Buffer | Uint8Array): string {
  const dir = path.join(getDataDirectory(), 'slides', slideRenderCacheKey(data));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function libreOfficeBinary(): string {
  return process.env.LAZYLIFT_LIBREOFFICE_BIN || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');
}

function pdftoppmBinary(): string {
  return process.env.LAZYLIFT_PDFTOPPM_BIN || 'pdftoppm';
}

function cachedPng(cachePath: string): RenderedSlideImage | null {
  if (!fs.existsSync(cachePath) || fs.statSync(cachePath).size <= 200) return null;
  return { data: fs.readFileSync(cachePath), contentType: 'image/png' };
}

async function convertPptxToPdf(cachePath: string, pptxData: Buffer): Promise<string> {
  const pdfPath = path.join(cachePath, 'presentation.pdf');
  if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100) return pdfPath;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazylift-pptx-'));
  const tmpPptx = path.join(tmpDir, 'presentation.pptx');
  try {
    fs.writeFileSync(tmpPptx, pptxData);
    await execFileAsync(
      libreOfficeBinary(),
      ['--headless', '--nologo', '--nodefault', '--nolockcheck', '--convert-to', 'pdf', '--outdir', tmpDir, tmpPptx],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }
    );
    const converted = path.join(tmpDir, 'presentation.pdf');
    if (!fs.existsSync(converted) || fs.statSync(converted).size <= 100) {
      throw new SlideRenderError('LibreOffice did not produce a PDF for this presentation.');
    }
    fs.copyFileSync(converted, pdfPath);
    return pdfPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SlideRenderError(`Unable to render this PowerPoint presentation (${message}).`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Converts a PPTX once per source hash and renderer version. */
export async function getOrConvertPptxToPdf(_documentId: string, pptxData: Buffer | Uint8Array): Promise<string> {
  const data = Buffer.isBuffer(pptxData) ? pptxData : Buffer.from(pptxData);
  const dir = cacheDir(data);
  const key = `${sourceHash(data)}:${SLIDE_RENDERER_VERSION}`;
  const existing = conversionJobs.get(key);
  if (existing) return existing;

  const job = convertPptxToPdf(dir, data).finally(() => conversionJobs.delete(key));
  conversionJobs.set(key, job);
  return job;
}

async function renderPdfPage(pdfPath: string, pageNumber: number, output: string, thumbnail: boolean): Promise<RenderedSlideImage> {
  const cached = cachedPng(output);
  if (cached) return cached;

  const tmpPrefix = path.join(os.tmpdir(), `lazylift-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await execFileAsync(
      pdftoppmBinary(),
      ['-png', '-f', String(pageNumber), '-l', String(pageNumber), '-r', thumbnail ? '72' : '150', pdfPath, tmpPrefix],
      { timeout: thumbnail ? 15_000 : 30_000, maxBuffer: 1024 * 1024 }
    );
    const generated = fs.readdirSync(path.dirname(tmpPrefix)).find((file) => file.startsWith(path.basename(tmpPrefix)) && file.endsWith('.png'));
    if (!generated) throw new SlideRenderError(`No visual image was produced for slide ${pageNumber}.`);
    const generatedPath = path.join(path.dirname(tmpPrefix), generated);
    fs.copyFileSync(generatedPath, output);
    const result = cachedPng(output);
    if (!result) throw new SlideRenderError(`The rendered image for slide ${pageNumber} is invalid.`);
    return result;
  } catch (error) {
    if (error instanceof SlideRenderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SlideRenderError(`Unable to create a visual image for slide ${pageNumber} (${message}).`);
  } finally {
    for (const file of fs.readdirSync(path.dirname(tmpPrefix))) {
      if (file.startsWith(path.basename(tmpPrefix))) fs.rmSync(path.join(path.dirname(tmpPrefix), file), { force: true });
    }
  }
}

/**
 * Renders the original PDF/PPTX page to PNG. It never manufactures a visual slide from
 * extracted text: callers must present an explicit error and optional text-only fallback.
 */
export async function renderSlideImage(
  doc: DocumentRow,
  _pages: DocumentPageRecord[],
  slideNumber: number,
  rawFileData?: Buffer | Uint8Array | null,
  thumbnail = false
): Promise<RenderedSlideImage> {
  if (!rawFileData || rawFileData.length === 0) {
    throw new SlideRenderError('The original presentation file is unavailable, so this slide cannot be rendered visually.');
  }
  const fileData = Buffer.isBuffer(rawFileData) ? rawFileData : Buffer.from(rawFileData);
  const isPdf = doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.title);
  const isPptx = doc.mimeType?.includes('presentation') || doc.mimeType?.includes('powerpoint') || /\.(pptx|ppt)$/i.test(doc.title);
  if (!isPdf && !isPptx) throw new SlideRenderError('Visual rendering is available only for PDF and PowerPoint source files.');

  const dir = cacheDir(fileData);
  const output = path.join(dir, `${thumbnail ? 'thumbnail' : 'slide'}-${slideNumber}.png`);
  const cached = cachedPng(output);
  if (cached) return cached;

  const key = `${sourceHash(fileData)}:${SLIDE_RENDERER_VERSION}:${thumbnail ? 'thumbnail' : 'slide'}:${slideNumber}`;
  const existing = renderJobs.get(key);
  if (existing) return existing;

  const job = (async () => {
    let pdfPath: string;
    if (isPdf) {
      pdfPath = path.join(dir, 'source.pdf');
      if (!fs.existsSync(pdfPath)) fs.writeFileSync(pdfPath, fileData);
    } else {
      pdfPath = await getOrConvertPptxToPdf(doc.id, fileData);
    }
    return renderPdfPage(pdfPath, slideNumber, output, thumbnail);
  })().finally(() => renderJobs.delete(key));
  renderJobs.set(key, job);
  return job;
}
