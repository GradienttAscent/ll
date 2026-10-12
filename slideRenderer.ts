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
const FAILURE_BACKOFF_MS = 60_000;

export interface RenderedSlideImage {
  data: Buffer;
  contentType: 'image/png';
}

export class SlideRenderError extends Error {
  constructor(message: string, readonly code = 'render_failed') {
    super(message);
    this.name = 'SlideRenderError';
  }
}

const renderJobs = new Map<string, Promise<RenderedSlideImage>>();
const conversionJobs = new Map<string, Promise<string>>();
const failedJobs = new Map<string, { error: SlideRenderError; expiresAt: number }>();
const executableChecks = new Map<string, Promise<void>>();

function logRenderDiagnostic(stage: string, fields: Record<string, string | number | boolean | undefined>) {
  const details = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  // Deliberately omit request URLs, document names, and authentication tokens.
  console.error(JSON.stringify({ event: 'slide-render', stage, ...details }));
}

function sourceHash(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function slideRenderCacheKey(data: Buffer | Uint8Array): string {
  return `${sourceHash(data)}-${SLIDE_RENDERER_VERSION}`;
}

function cacheDir(data: Buffer | Uint8Array): string {
  try {
    const dir = path.join(getDataDirectory(), 'slides', slideRenderCacheKey(data));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (error) {
    throw classifyRenderError('cache-directory', error);
  }
}

function libreOfficeBinary(): string {
  return process.env.LAZYLIFT_LIBREOFFICE_BIN || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');
}

function pdftoppmBinary(): string {
  return process.env.LAZYLIFT_PDFTOPPM_BIN || 'pdftoppm';
}

function sourceId(data: Buffer | Uint8Array): string {
  return sourceHash(data).slice(0, 12);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function classifyRenderError(stage: string, error: unknown): SlideRenderError {
  if (error instanceof SlideRenderError) return error;
  const code = errorCode(error);
  if (code === 'ENOENT') return new SlideRenderError('The required presentation rendering program is not installed on this server.', 'binary_missing');
  if (code === 'ETIMEDOUT' || (typeof error === 'object' && error !== null && 'killed' in error && error.killed === true)) {
    return new SlideRenderError('Rendering this presentation timed out. Please try again with a smaller presentation.', 'timeout');
  }
  if ((code === 'EACCES' || code === 'EPERM') && stage === 'executable-check') {
    return new SlideRenderError('The presentation rendering program cannot be executed by this server.', 'binary_not_executable');
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENOSPC') {
    return new SlideRenderError('Presentation rendering storage is unavailable on this server.', 'storage_unavailable');
  }
  return stage === 'conversion'
    ? new SlideRenderError('Unable to convert this PowerPoint presentation.', 'conversion_failed')
    : new SlideRenderError('Unable to create a visual image for this slide.', 'render_failed');
}

async function ensureExecutable(binary: string, label: string): Promise<void> {
  const key = `${label}:${binary}`;
  const existing = executableChecks.get(key);
  if (existing) return existing;
  const check = execFileAsync(binary, ['--version'], { timeout: 10_000, maxBuffer: 64 * 1024 })
    .then(() => undefined)
    .catch((error) => { throw classifyRenderError('executable-check', error); });
  executableChecks.set(key, check);
  try {
    await check;
  } catch (error) {
    executableChecks.delete(key);
    throw error;
  }
}

/** Emits a token-free readiness record for the two Linux renderer executables. */
export async function verifySlideRendererRuntime(): Promise<void> {
  const checks = await Promise.allSettled([
    ensureExecutable(libreOfficeBinary(), 'libreoffice'),
    ensureExecutable(pdftoppmBinary(), 'pdftoppm'),
  ]);
  for (const [index, result] of checks.entries()) {
    const binary = index === 0 ? libreOfficeBinary() : pdftoppmBinary();
    if (result.status === 'fulfilled') {
      logRenderDiagnostic('runtime-check', { binary: path.basename(binary), available: true, platform: process.platform });
    } else {
      const error = classifyRenderError('executable-check', result.reason);
      logRenderDiagnostic('runtime-check', { binary: path.basename(binary), available: false, code: error.code, platform: process.platform });
    }
  }
}

function rememberedFailure(key: string): SlideRenderError | null {
  const failed = failedJobs.get(key);
  if (!failed) return null;
  if (failed.expiresAt > Date.now()) return failed.error;
  failedJobs.delete(key);
  return null;
}

function rememberFailure(key: string, error: unknown): SlideRenderError {
  const renderError = classifyRenderError('render', error);
  failedJobs.set(key, { error: renderError, expiresAt: Date.now() + FAILURE_BACKOFF_MS });
  return renderError;
}

function cachedPng(cachePath: string): RenderedSlideImage | null {
  try {
    if (!fs.existsSync(cachePath) || fs.statSync(cachePath).size <= 200) return null;
    return { data: fs.readFileSync(cachePath), contentType: 'image/png' };
  } catch (error) {
    throw classifyRenderError('cache-read', error);
  }
}

async function convertPptxToPdf(cachePath: string, pptxData: Buffer): Promise<string> {
  const pdfPath = path.join(cachePath, 'presentation.pdf');
  try {
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100) return pdfPath;
  } catch (error) {
    throw classifyRenderError('cache-read', error);
  }

  let tmpDir: string | undefined;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazylift-pptx-'));
    const tmpPptx = path.join(tmpDir, 'presentation.pptx');
    fs.writeFileSync(tmpPptx, pptxData);
    await ensureExecutable(libreOfficeBinary(), 'libreoffice');
    await execFileAsync(
      libreOfficeBinary(),
      ['--headless', '--nologo', '--nodefault', '--nolockcheck', '--convert-to', 'pdf', '--outdir', tmpDir, tmpPptx],
      { timeout: 60_000, maxBuffer: 1024 * 1024 }
    );
    const converted = path.join(tmpDir, 'presentation.pdf');
    if (!fs.existsSync(converted) || fs.statSync(converted).size <= 100) {
      throw new SlideRenderError('LibreOffice did not produce a PDF for this presentation.', 'conversion_failed');
    }
    fs.copyFileSync(converted, pdfPath);
    return pdfPath;
  } catch (error) {
    throw classifyRenderError('conversion', error);
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Converts a PPTX once per source hash and renderer version. */
export async function getOrConvertPptxToPdf(_documentId: string, pptxData: Buffer | Uint8Array): Promise<string> {
  const data = Buffer.isBuffer(pptxData) ? pptxData : Buffer.from(pptxData);
  const dir = cacheDir(data);
  const key = `${sourceHash(data)}:${SLIDE_RENDERER_VERSION}`;
  const failed = rememberedFailure(`conversion:${key}`);
  if (failed) throw failed;
  const existing = conversionJobs.get(key);
  if (existing) return existing;

  const job = convertPptxToPdf(dir, data).catch((error) => {
    const renderError = rememberFailure(`conversion:${key}`, error);
    logRenderDiagnostic('conversion', { code: renderError.code, source: sourceId(data), platform: process.platform });
    throw renderError;
  }).finally(() => conversionJobs.delete(key));
  conversionJobs.set(key, job);
  return job;
}

async function renderPdfPage(pdfPath: string, pageNumber: number, output: string, thumbnail: boolean): Promise<RenderedSlideImage> {
  const cached = cachedPng(output);
  if (cached) return cached;

  const tmpPrefix = path.join(os.tmpdir(), `lazylift-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await ensureExecutable(pdftoppmBinary(), 'pdftoppm');
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
    throw classifyRenderError('image-render', error);
  } finally {
    try {
      for (const file of fs.readdirSync(path.dirname(tmpPrefix))) {
        if (file.startsWith(path.basename(tmpPrefix))) fs.rmSync(path.join(path.dirname(tmpPrefix), file), { force: true });
      }
    } catch {
      // The render error is more actionable than a best-effort temporary-file cleanup failure.
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
    throw new SlideRenderError('The original presentation file is unavailable, so this slide cannot be rendered visually.', 'original_missing');
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
  const failed = rememberedFailure(`image:${key}`);
  if (failed) throw failed;
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
  })().catch((error) => {
    const renderError = rememberFailure(`image:${key}`, error);
    logRenderDiagnostic('image', { code: renderError.code, source: sourceId(fileData), slide: slideNumber, thumbnail });
    throw renderError;
  }).finally(() => renderJobs.delete(key));
  renderJobs.set(key, job);
  return job;
}
