import { after, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { localOcr } from '../localOcr';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lazylift-ocr-test-'));
const png = path.join(directory, 'readable.png');
fs.writeFileSync(png, Buffer.from(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/ocr-readable.png.base64'), 'utf8').trim(), 'base64'));

after(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('local OCR fixtures', () => {
  it('reads the committed PNG fixture exactly', async () => {
    const result = await localOcr(fs.readFileSync(png), 'png');
    assert.strictEqual(result.text, 'OCR PAGE ONE');
    assert.strictEqual(result.pageCount, 1);
  });

  it('reads a deterministic scanned PDF fixture with page provenance', async () => {
    const tex = path.join(directory, 'fixture.tex');
    fs.writeFileSync(tex, `\\documentclass{article}\\usepackage{graphicx}\\pagestyle{empty}\\begin{document}\\includegraphics[width=\\textwidth]{${png.replace(/\\/g, '/')}}\\end{document}`);
    execFileSync('pdflatex', ['-interaction=nonstopmode', '-output-directory', directory, tex], { stdio: 'ignore' });
    const result = await localOcr(fs.readFileSync(path.join(directory, 'fixture.pdf')), 'pdf');
    assert.strictEqual(result.text, 'OCR PAGE ONE');
    assert.strictEqual(result.pageCount, 1);
  });
});
