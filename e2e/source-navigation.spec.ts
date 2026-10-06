import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function pdf(text: string) { const stream = `BT (${text}) Tj ET`; return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, 'latin1'); }
function office(kind: 'pptx' | 'docx') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-source-')); const inner = kind === 'pptx' ? 'ppt/slides' : 'word'; fs.mkdirSync(path.join(dir, inner), { recursive: true });
  const xml = kind === 'pptx' ? '<p:sld xmlns:p="p"><a:t xmlns:a="a">Paging</a:t></p:sld>' : '<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Paging</w:t></w:r></w:p><w:p><w:r><w:t>Paging uses virtual memory.</w:t></w:r></w:p></w:body></w:document>';
  fs.writeFileSync(path.join(dir, inner, kind === 'pptx' ? 'slide1.xml' : 'document.xml'), xml); const zip = `${dir}.zip`; execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zip}'`]); const bytes = fs.readFileSync(zip); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(zip); return bytes;
}
test('source navigation opens PDF page, visual PPTX slide, DOCX section, and OCR material', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Create an account' }).click(); await page.getByLabel('Name').fill('Source'); await page.getByLabel('Email').fill(`source-${Date.now()}-${info.parallelIndex}@example.com`); await page.getByLabel('Password', { exact: true }).fill('secret123'); await page.getByLabel('Confirm password').fill('secret123'); await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Past Papers & Topics' }).click(); await page.getByRole('button', { name: 'Upload Material' }).click(); const inputs = page.locator('input[type=file]');
  await inputs.nth(0).setInputFiles({ name: 'syllabus.pdf', mimeType: 'application/pdf', buffer: pdf('Module 1: Paging 100%.') });
  await inputs.nth(1).setInputFiles([{ name: 'notes.pdf', mimeType: 'application/pdf', buffer: pdf('Paging lecture notes.') }, { name: 'slides.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: office('pptx') }, { name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: office('docx') }]);
  await inputs.nth(2).setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(fs.readFileSync('tests/fixtures/ocr-readable.png.base64', 'utf8').trim(), 'base64') });
  await page.getByRole('button', { name: 'Save & Analyze' }).click(); await expect(page.getByText(/new files analyzed/)).toBeVisible(); await expect(page.getByRole('heading', { name: 'Topic to Source/Page Map' })).toBeVisible();
  const map = page.getByRole('heading', { name: 'Topic to Source/Page Map' }).locator('xpath=..');
  const [popup] = await Promise.all([page.context().waitForEvent('page'), map.getByRole('button', { name: /notes\.pdf.*Page 1/ }).click()]); await expect(popup).toHaveURL(/#page=1/);
  await map.getByRole('button', { name: /slides\.pptx.*Slide 1/ }).click(); await expect(page.getByAltText('Rendered slide 1')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click(); await map.getByRole('button', { name: /notes\.docx.*Paging.*Paragraphs/ }).click(); await expect(page.getByText(/Paragraphs 1–2/)).toBeVisible();
});
