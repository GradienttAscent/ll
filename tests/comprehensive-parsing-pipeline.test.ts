import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { deflateRawSync } from 'zlib';
import { extractPdfPages, extractPdfText, extractionIsLowQuality, parseToUnicodeCMap } from '../pdfText';
import { extractStructuredDocument } from '../structuredParser';
import { extractDocxDocument } from '../docxParser';
import { extractPptxSlides, readZipEntries } from '../pptxParser';
import { classifyAcademicDocument, extractNumberedQuestionRecords } from '../services';
import { createTestServer, Api, removeTempDir, TestServer } from './helpers';

/**
 * Creates a minimal valid in-memory ZIP buffer with the given file entries.
 */
function createMinimalZip(files: Array<{ name: string; content: string }>): Buffer {
  const fileBuffers: Array<{
    name: string;
    compressed: Buffer;
    uncompressed: Buffer;
    offset: number;
    crc: number;
  }> = [];

  let currentOffset = 0;
  const localHeaders: Buffer[] = [];

  for (const f of files) {
    const uncompressed = Buffer.from(f.content, 'utf8');
    const compressed = deflateRawSync(uncompressed);
    const nameBuf = Buffer.from(f.name, 'utf8');

    // Local file header: 30 bytes + nameLen
    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0); // signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(8, 8); // compression method (deflate)
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0, 12); // date
    header.writeUInt32LE(0, 14); // crc-32 (0 for simple mock)
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(uncompressed.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra len
    nameBuf.copy(header, 30);

    fileBuffers.push({
      name: f.name,
      compressed,
      uncompressed,
      offset: currentOffset,
      crc: 0,
    });

    localHeaders.push(header, compressed);
    currentOffset += header.length + compressed.length;
  }

  const cdOffset = currentOffset;
  const cdHeaders: Buffer[] = [];

  for (const fb of fileBuffers) {
    const nameBuf = Buffer.from(fb.name, 'utf8');
    // Central directory header: 46 bytes + nameLen
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0, 14); // date
    cd.writeUInt32LE(fb.crc, 16);
    cd.writeUInt32LE(fb.compressed.length, 20);
    cd.writeUInt32LE(fb.uncompressed.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attr
    cd.writeUInt32LE(0, 38); // external attr
    cd.writeUInt32LE(fb.offset, 42); // local header offset
    nameBuf.copy(cd, 46);

    cdHeaders.push(cd);
    currentOffset += cd.length;
  }

  const cdSize = currentOffset - cdOffset;

  // End of central directory record: 22 bytes
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk num
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // size of cd
  eocd.writeUInt32LE(cdOffset, 16); // offset of cd
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

describe('Comprehensive LazyLift Parsing Pipeline', () => {
  let server: TestServer;
  let client: Api;

  before(async () => {
    server = await createTestServer();
    client = new Api(server.baseUrl);
    const { token } = await client.register('comprehensive-parser@example.com', 'secret123');
    client.token = token;
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  describe('DOCX Extraction & Section Parsing', () => {
    it('parses in-memory DOCX with paragraphs, headings, tables, and page breaks', () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Unit 1: Memory Management</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Virtual memory allows execution of processes not completely in memory.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Algorithm</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Page Faults</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>FIFO</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>15</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r><w:br w:type="page"/></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Unit 2: File Systems</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Contiguous allocation requires each file to occupy a set of contiguous blocks.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxZip = createMinimalZip([
        { name: '[Content_Types].xml', content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
        { name: 'word/document.xml', content: documentXml },
      ]);

      const result = extractDocxDocument(docxZip);
      assert.strictEqual(result.extractionMethod, 'docx-sections');
      assert.strictEqual(result.pages.length, 2);
      assert.strictEqual(result.pages[0].pageNumber, 1);
      assert.strictEqual(result.pages[0].heading, 'Unit 1: Memory Management');
      assert.ok(result.pages[0].text.includes('Virtual memory allows'));
      assert.ok(result.pages[0].text.includes('FIFO | 15'));

      assert.strictEqual(result.pages[1].pageNumber, 2);
      assert.strictEqual(result.pages[1].heading, 'Unit 2: File Systems');
      assert.ok(result.pages[1].text.includes('Contiguous allocation'));
    });

    it('extracts real-world DOCX file if available on disk', () => {
      const realDocxPath = '/home/jyothika/Downloads/Group26_LazyLift_TestReport.docx';
      if (!fs.existsSync(realDocxPath)) return;

      const buf = fs.readFileSync(realDocxPath);
      const parsed = extractStructuredDocument(buf, 'Group26_LazyLift_TestReport.docx');
      assert.strictEqual(parsed.extractionMethod, 'docx-sections');
      assert.ok(parsed.pages.length >= 10, `Expected at least 10 sections, got ${parsed.pages.length}`);
      assert.ok(parsed.fullText.includes('LazyLift is an AI-powered academic revision'));
      assert.strictEqual(extractionIsLowQuality(parsed.fullText), false);
    });
  });

  describe('PPTX Extraction & Slide Ordering', () => {
    it('parses in-memory PPTX with slide order, titles, and text', () => {
      const slide1 = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Lecture 1: Introduction</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:txBody><a:p><a:r><a:t>Course syllabus and grading overview.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

      const slide2 = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Slide 2: Architectural Patterns</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:txBody><a:p><a:r><a:t>Layered architecture decouples presentation from storage.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

      const pptxZip = createMinimalZip([
        { name: '[Content_Types].xml', content: '<Types/>' },
        { name: 'ppt/presentation.xml', content: '<p:presentation/>' },
        { name: 'ppt/slides/slide2.xml', content: slide2 },
        { name: 'ppt/slides/slide1.xml', content: slide1 },
      ]);

      const parsed = extractStructuredDocument(pptxZip, 'lecture.pptx');
      assert.strictEqual(parsed.extractionMethod, 'pptx-slides');
      assert.strictEqual(parsed.pages.length, 2);
      assert.strictEqual(parsed.pages[0].pageNumber, 1);
      assert.strictEqual(parsed.pages[0].heading, 'Lecture 1: Introduction');
      assert.strictEqual(parsed.pages[1].pageNumber, 2);
      assert.strictEqual(parsed.pages[1].heading, 'Slide 2: Architectural Patterns');
    });

    it('extracts real-world PPTX file if available on disk', () => {
      const realPptxPath = '/home/jyothika/Downloads/LazyLift.pptx';
      if (!fs.existsSync(realPptxPath)) return;

      const buf = fs.readFileSync(realPptxPath);
      const parsed = extractStructuredDocument(buf, 'LazyLift.pptx');
      assert.strictEqual(parsed.extractionMethod, 'pptx-slides');
      assert.strictEqual(parsed.pages.length, 10);
      assert.strictEqual(parsed.pages[0].heading, 'LazyLift');
      assert.ok(parsed.fullText.includes('Intelligent Study Planning'));
    });
  });

  describe('PDF Extraction: ASCII85Decode & ToUnicode CMap', () => {
    it('decodes ASCII85 encoded streams and extracts clean text', () => {
      const realWorkDivisionPdf = '/home/jyothika/Downloads/LazyLift_CSE312_Testing_Work_Division.pdf';
      if (!fs.existsSync(realWorkDivisionPdf)) return;

      const buf = fs.readFileSync(realWorkDivisionPdf);
      const pages = extractPdfPages(buf);
      assert.strictEqual(pages.length, 8, 'Work Division PDF must extract exactly 8 pages');
      assert.strictEqual(pages[0].pageNumber, 1);
      assert.ok(pages[0].text.includes('LAZYLIFT / CSE312 TEST PLAN'));
      assert.ok(pages[0].text.includes('Shivha'));
      assert.ok(pages[0].text.includes('Jyothika'));

      const text = extractPdfText(buf);
      assert.strictEqual(extractionIsLowQuality(text), false);
    });

    it('maps Identity-H font glyphs using ToUnicode CMaps without character corruption', () => {
      const realTestReportPdf = '/home/jyothika/Downloads/Group26_LazyLift_TestReport.pdf';
      if (!fs.existsSync(realTestReportPdf)) return;

      const buf = fs.readFileSync(realTestReportPdf);
      const pages = extractPdfPages(buf);
      assert.strictEqual(pages.length, 10, 'Test Report PDF must extract exactly 10 pages');
      // Page 1 header must decode to CSE312, not &6(
      assert.ok(pages[0].text.replace(/\s+/g, ' ').includes('SOFTWARE ARCHITECTURE'));

      const text = extractPdfText(buf);
      assert.strictEqual(extractionIsLowQuality(text), false);
    });
  });

  describe('Full API Upload Integration (/api/academic-documents/upload)', () => {
    it('uploads DOCX document, persists structured pages, and serves via /api/documents/:id/pages', async () => {
      const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Concurrency and Deadlocks</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Deadlock requires mutual exclusion, hold and wait, no preemption, and circular wait.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxZip = createMinimalZip([
        { name: '[Content_Types].xml', content: '<Types/>' },
        { name: 'word/document.xml', content: documentXml },
      ]);

      const res = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'Operating Systems Unit 3.docx',
          fileName: 'Operating Systems Unit 3.docx',
          docType: 'Lecture Slides',
          base64: docxZip.toString('base64'),
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.analysis.document.extractionMethod, 'docx-sections');
      const docId = res.json.analysis.document.id;

      const pagesRes = await client.request(`/api/documents/${docId}/pages`);
      assert.strictEqual(pagesRes.status, 200);
      assert.strictEqual(pagesRes.json.pages.length, 1);
      assert.strictEqual(pagesRes.json.pages[0].heading, 'Concurrency and Deadlocks');
      assert.ok(pagesRes.json.pages[0].text.includes('mutual exclusion'));
    });

    it('uploads PPTX presentation and serves individual slide via /api/documents/:id/pages/1', async () => {
      const slide1 = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Banker's Algorithm</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:txBody><a:p><a:r><a:t>Resource allocation and safety algorithm check.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

      const pptxZip = createMinimalZip([
        { name: '[Content_Types].xml', content: '<Types/>' },
        { name: 'ppt/presentation.xml', content: '<p:presentation/>' },
        { name: 'ppt/slides/slide1.xml', content: slide1 },
      ]);

      const res = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'Banker Slides.pptx',
          fileName: 'Banker Slides.pptx',
          docType: 'Lecture Slides',
          base64: pptxZip.toString('base64'),
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.analysis.document.extractionMethod, 'pptx-slides');
      const docId = res.json.analysis.document.id;

      const slideRes = await client.request(`/api/documents/${docId}/pages/1`);
      assert.strictEqual(slideRes.status, 200);
      assert.strictEqual(slideRes.json.page.pageNumber, 1);
      assert.strictEqual(slideRes.json.page.heading, "Banker's Algorithm");
    });

    it('correctly respects user docType choice for Software Testing subject notes without misclassifying as past paper', async () => {
      const res = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'Software Testing Unit 1 Notes.txt',
          docType: 'Lecture Slides',
          base64: Buffer.from('Software testing principles, white box testing, and control flow graphs.').toString('base64'),
          mimeType: 'text/plain',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.analysis.document.docType, 'Lecture Slides');
      assert.strictEqual(res.json.analysis.createdQuestionCount, 0, 'Lecture material must not produce question records');
    });

    it('gracefully handles corrupted zip payloads with 422 instead of crashing', async () => {
      const corruptedZip = Buffer.from('PK\x03\x04\x00\x00\x00\x00corrupted garbage data');
      const res = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'corrupted.docx',
          fileName: 'corrupted.docx',
          docType: 'Past Paper',
          base64: corruptedZip.toString('base64'),
        },
      });

      assert.strictEqual(res.status, 422);
    });

    it('rejects invalid or empty base64 payload with 400', async () => {
      const res = await client.request('/api/academic-documents/upload', {
        method: 'POST',
        body: {
          title: 'empty.pdf',
          docType: 'Past Paper',
          base64: '',
        },
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe('Unnumbered Fallback Question Page Tracking', () => {
    it('accurately tracks physical page numbers across form feeds for verb-initiated questions', () => {
      const content = `Welcome to the study review questions.
Explain the difference between paging and segmentation. (10 marks)
\f
Second review section:
Describe Banker's algorithm for deadlock avoidance. (10 marks)
\f
Final review section:
Calculate the effective memory access time with a TLB hit ratio of 80%. (10 marks)`;

      const questions = extractNumberedQuestionRecords(content);
      assert.strictEqual(questions.length, 3);
      assert.strictEqual(questions[0].pageNumber, 1);
      assert.strictEqual(questions[1].pageNumber, 2);
      assert.strictEqual(questions[2].pageNumber, 3);
    });
  });
});
