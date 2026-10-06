import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

async function recognizeImage(imagePath: string): Promise<string> {
  // Windows.Media.Ocr is on-device OCR. The PowerShell bridge keeps this dependency-free.
  const script = `[void][Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
[void][Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
function Await-WinRt($operation, [Type]$resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 } | Select-Object -First 1
  return $method.MakeGenericMethod($resultType).Invoke($null, @($operation)).GetAwaiter().GetResult()
}
$source = [System.Drawing.Image]::FromFile($args[0])
$scaledPath = Join-Path (Split-Path $args[0]) ("ocr-upscaled-" + [guid]::NewGuid().ToString() + ".png")
$scaled = New-Object System.Drawing.Bitmap ($source.Width * 2), ($source.Height * 2)
$graphics = [System.Drawing.Graphics]::FromImage($scaled)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.Clear([System.Drawing.Color]::White)
$graphics.DrawImage($source, 0, 0, $scaled.Width, $scaled.Height)
$graphics.Dispose(); $source.Dispose(); $scaled.Save($scaledPath, [System.Drawing.Imaging.ImageFormat]::Png); $scaled.Dispose()
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($scaledPath)
$file = Await-WinRt $file ([Windows.Storage.StorageFile])
$stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
$stream = Await-WinRt $stream ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
$decoder = Await-WinRt $decoder ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = $decoder.GetSoftwareBitmapAsync()
$bitmap = Await-WinRt $bitmap ([Windows.Graphics.Imaging.SoftwareBitmap])
$bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8)
$language = New-Object Windows.Globalization.Language 'en-US'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
$result = $engine.RecognizeAsync($bitmap)
$result = Await-WinRt $result ([Windows.Media.Ocr.OcrResult])
[Console]::Out.Write($result.Text)`;
  const scriptPath = path.join(path.dirname(imagePath), 'recognize.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');
  const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, imagePath], { maxBuffer: 8 * 1024 * 1024 });
  if (stderr.trim()) throw new Error(`Windows OCR failed: ${stderr.trim()}`);
  return stdout.trim();
}

export async function localOcr(payload: Buffer, extension: string): Promise<{ text: string; pageCount: number }> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lazylift-ocr-'));
  try {
    const input = path.join(directory, `source.${extension}`);
    fs.writeFileSync(input, payload);
    if (extension === 'pdf') {
      const prefix = path.join(directory, 'page');
      await execFileAsync('pdftoppm', ['-png', '-r', '220', input, prefix], { maxBuffer: 8 * 1024 * 1024 });
      const images = fs.readdirSync(directory).filter((name) => /^page-\d+\.png$/i.test(name))
        .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
      const pages = await Promise.all(images.map((name) => recognizeImage(path.join(directory, name))));
      return { text: pages.join('\f'), pageCount: pages.length };
    }
    return { text: await recognizeImage(input), pageCount: 1 };
  } finally {
    // PowerShell can retain the generated script handle briefly after its process exits.
    // Cleanup is best-effort and must not turn a successful OCR result into an upload failure.
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // The OS will reclaim this uniquely named temporary directory later.
    }
  }
}
