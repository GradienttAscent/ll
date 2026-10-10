import { it, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { deflateRawSync } from 'zlib';
import { createTestServer, Api, TestServer, removeTempDir } from './helpers';
import { getPresentationViewerUrl } from '../src/components/UploadExtractView';

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

    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(uncompressed.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
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
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(fb.crc, 16);
    cd.writeUInt32LE(fb.compressed.length, 20);
    cd.writeUInt32LE(fb.uncompressed.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(fb.offset, 42);
    nameBuf.copy(cd, 46);

    cdHeaders.push(cd);
    currentOffset += cd.length;
  }

  const cdSize = currentOffset - cdOffset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...cdHeaders, eocd]);
}

let server: TestServer;

async function createClient(emailPrefix = 'nav'): Promise<{ client: Api; userId: string }> {
  const client = new Api(server.baseUrl);
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { token, user } = await client.register(email, 'secret123');
  client.token = token;
  return { client, userId: user.id };
}

describe('PPT Exact Slide Navigation & Traceability', () => {
  before(async () => {
    server = await createTestServer();
  });

  after(async () => {
    await server.close();
    removeTempDir(server.dbDir);
  });

  it('1. Associates individual exam questions with their exact matching slide numbers', async () => {
    const { client } = await createClient('nav-exact');

    // Load standard course pack containing Operating Systems slides & past papers
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    assert.strictEqual(loadRes.status, 201);
    const whatToStudy = loadRes.json.whatToStudy;
    assert.ok(Array.isArray(whatToStudy));

    const deadlockItem = whatToStudy.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('deadlock') && item.conceptTitle.toLowerCase().includes('detection')
    );
    assert.ok(deadlockItem, 'Deadlock Detection concept must be present');
    assert.strictEqual(deadlockItem.lectureSource.mapped, true);

    // Cluster broad slide range is preserved (Slides 18–24)
    assert.strictEqual(deadlockItem.lectureSource.slideRange, 'Slides 18–24');
    assert.strictEqual(deadlockItem.lectureSource.startSlide, 18);
    assert.strictEqual(deadlockItem.lectureSource.endSlide, 24);
    assert.strictEqual(typeof deadlockItem.lectureSource.exactSlide, 'number');

    // Individual occurrences carry their specific slide matches:
    // Question 6(a): "Describe the deadlock detection algorithm with multiple instances of each resource type."
    const multiInstanceQ = deadlockItem.occurrences.find((o: any) =>
      o.questionText.toLowerCase().includes('multiple instances')
    );
    assert.ok(multiInstanceQ, 'Multi-instance question must be found in occurrences');
    assert.ok(
      multiInstanceQ.exactSlide === 20 || multiInstanceQ.exactSlide === 21,
      `Expected multi-instance question to map to Slide 20 or 21, but got ${multiInstanceQ.exactSlide}`
    );
    assert.strictEqual(multiInstanceQ.lectureSource.mapped, true);
    assert.strictEqual(multiInstanceQ.lectureSource.exactSlide, multiInstanceQ.exactSlide);

    // Question 5(a): "Explain deadlock detection with an example workload and wait-for graph cycle detection."
    const waitforQ = deadlockItem.occurrences.find((o: any) =>
      o.questionText.toLowerCase().includes('wait-for graph')
    );
    assert.ok(waitforQ, 'Wait-for graph question must be found in occurrences');
    assert.strictEqual(waitforQ.exactSlide, 19, `Expected wait-for graph question to map to Slide 19, got ${waitforQ.exactSlide}`);
    assert.strictEqual(waitforQ.lectureSource.mapped, true);
    assert.strictEqual(waitforQ.lectureSource.exactSlide, 19);
  });

  it('2. Presentation viewer route /api/documents/:id/view navigates to the exact requested slide', async () => {
    const { client } = await createClient('nav-viewer');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    assert.strictEqual(loadRes.status, 201);
    const whatToStudy = loadRes.json.whatToStudy;
    const deadlockItem = whatToStudy.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('deadlock') && item.conceptTitle.toLowerCase().includes('detection')
    );
    const docId = deadlockItem.lectureSource.documentId;
    assert.ok(docId);

    // Request specific slide 20 in JSON format
    const slide20Res = await client.request(`/api/documents/${docId}/view?slide=20&format=json`);
    assert.strictEqual(slide20Res.status, 200);
    assert.strictEqual(slide20Res.json.currentSlide, 20);
    assert.strictEqual(slide20Res.json.requestedSlide, 20);
    assert.ok(slide20Res.json.slide.heading.includes('Multiple Resource Instances') || slide20Res.json.slide.text.includes('multiple instances'));
    assert.strictEqual(slide20Res.json.error, null);

    // Request a different slide: Slide 19 (Wait-for graph)
    const slide19Res = await client.request(`/api/documents/${docId}/view?slide=19&format=json`);
    assert.strictEqual(slide19Res.status, 200);
    assert.strictEqual(slide19Res.json.currentSlide, 19);
    assert.strictEqual(slide19Res.json.requestedSlide, 19);
    assert.ok(slide19Res.json.slide.heading.includes('Wait-For Graph') || slide19Res.json.slide.text.includes('wait-for graph'));

    // Request HTML representation as viewed in a browser tab
    const htmlRes = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=20`, {
      headers: {
        Authorization: `Bearer ${client.token}`,
        Accept: 'text/html',
      },
    });
    assert.strictEqual(htmlRes.status, 200);
    assert.strictEqual(htmlRes.headers.get('content-type')?.includes('text/html'), true);
    const html = await htmlRes.text();
    assert.ok(html.includes('Slide 20 of'), 'HTML must contain slide badge');
    assert.ok(html.includes('Multiple Resource Instances') || html.includes('Deadlock Detection'), 'HTML must contain slide heading');
    assert.ok(html.includes('Back to LazyLift'), 'HTML must contain back link');
    assert.ok(html.includes('Download Original File'), 'HTML must contain download original file link');
  });

  it('3. Browser new-tab navigation works via query parameter token (?token=...) without Authorization header', async () => {
    const { client } = await createClient('nav-token');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const whatToStudy = loadRes.json.whatToStudy;
    const deadlockItem = whatToStudy.find((item: any) =>
      item.conceptTitle.toLowerCase().includes('deadlock') && item.conceptTitle.toLowerCase().includes('detection')
    );
    const docId = deadlockItem.lectureSource.documentId;

    // Navigate to viewer with token query param and NO Authorization header (simulates clicking <a target="_blank">)
    const res = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=21&token=${client.token}`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Slide 21 of'));

    // Requesting without any token fails with 401
    const unauthRes = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=21`);
    assert.strictEqual(unauthRes.status, 401);
  });

  it('4. Edge Cases: missing slide, out-of-range slide, and invalid document ID', async () => {
    const { client } = await createClient('nav-edges');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const whatToStudy = loadRes.json.whatToStudy;
    const docId = whatToStudy[0].lectureSource.documentId;
    assert.ok(docId);

    // Case 1: Missing slide number defaults gracefully to slide 1
    const noSlideRes = await client.request(`/api/documents/${docId}/view?format=json`);
    assert.strictEqual(noSlideRes.status, 200);
    assert.strictEqual(noSlideRes.json.currentSlide, 1);
    assert.strictEqual(noSlideRes.json.requestedSlide, null);

    // Case 2: Out-of-range slide number (e.g. Slide 999 in a 32-slide presentation)
    // Execution rule: Never silently redirect to slide 1 without error indication.
    const outOfRangeRes = await client.request(`/api/documents/${docId}/view?slide=999&format=json`);
    assert.strictEqual(outOfRangeRes.status, 200);
    assert.strictEqual(outOfRangeRes.json.requestedSlide, 999);
    assert.ok(outOfRangeRes.json.error, 'Must report outOfRange error');
    assert.ok(outOfRangeRes.json.error.includes('out of range'));

    const outOfRangeHtml = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=999&token=${client.token}`);
    assert.strictEqual(outOfRangeHtml.status, 200);
    const outHtmlText = await outOfRangeHtml.text();
    assert.ok(outHtmlText.includes('⚠️ Slide 999 is out of range'), 'HTML must visibly render the out-of-range error banner');

    // Case 3: Missing / nonexistent presentation document returns 404
    const notFoundRes = await client.request('/api/documents/document-nonexistent-123/view?slide=1');
    assert.strictEqual(notFoundRes.status, 404);
  });

  it('5. Uploading real multi-slide PPTX preserves exact 1-based slide numbers and supports slide navigation', async () => {
    const { client } = await createClient('nav-real-pptx');

    const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Virtual Memory Paging</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Introduction to physical frames and logical pages.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

    const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Page Fault Handling Routine</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Traps to OS, locates free frame, reads page from backing store.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

    const slide3Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Page Replacement Algorithms (FIFO &amp; LRU)</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
      <p:txBody><a:p><a:r><a:t>Minimizing page faults using optimal and least recently used replacement.</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`;

    const pptxBuffer = createMinimalZip([
      { name: 'ppt/slides/slide1.xml', content: slide1Xml },
      { name: 'ppt/slides/slide2.xml', content: slide2Xml },
      { name: 'ppt/slides/slide3.xml', content: slide3Xml },
    ]);

    // Upload presentation
    const uploadRes = await client.request('/api/academic-documents/upload', {
      method: 'POST',
      body: {
        title: 'Unit 5 - Virtual Memory.pptx',
        docType: 'Lecture Slides',
        base64: pptxBuffer.toString('base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    });
    assert.strictEqual(uploadRes.status, 201);
    const docId = uploadRes.json.analysis.document.id;
    assert.ok(docId);

    // Verify slide 2 navigation loads "Page Fault Handling Routine"
    const slide2Res = await client.request(`/api/documents/${docId}/view?slide=2&format=json`);
    assert.strictEqual(slide2Res.status, 200);
    assert.strictEqual(slide2Res.json.currentSlide, 2);
    assert.strictEqual(slide2Res.json.slide.pageNumber, 2);
    assert.strictEqual(slide2Res.json.slide.heading, 'Page Fault Handling Routine');
    assert.ok(slide2Res.json.slide.text.includes('Traps to OS'));

    // Verify slide 3 navigation loads "Page Replacement Algorithms (FIFO & LRU)"
    const slide3Res = await client.request(`/api/documents/${docId}/view?slide=3&format=json`);
    assert.strictEqual(slide3Res.status, 200);
    assert.strictEqual(slide3Res.json.currentSlide, 3);
    assert.strictEqual(slide3Res.json.slide.pageNumber, 3);
    assert.ok(slide3Res.json.slide.heading.includes('Page Replacement'));
    assert.ok(slide3Res.json.slide.text.includes('Minimizing page faults'));
  });

  it('6. Frontend getPresentationViewerUrl utility constructs exact slide target URLs', () => {
    // Local document presentation URL with exactSlide
    const localMapping: any = {
      mapped: true,
      documentId: 'doc-xyz-123',
      documentTitle: 'OS Lecture',
      documentFileName: 'lecture.pptx',
      startSlide: 1,
      endSlide: 29,
      exactSlide: 12,
    };
    const localUrl = getPresentationViewerUrl(localMapping);
    assert.ok(localUrl.includes('/api/documents/doc-xyz-123/view?slide=12'));

    // Local document presentation URL with match spanning multiple slides (exactSlide preferred)
    const spanMapping: any = {
      mapped: true,
      documentId: 'doc-abc-456',
      startSlide: 18,
      endSlide: 24,
      exactSlide: 21,
    };
    const spanUrl = getPresentationViewerUrl(spanMapping);
    assert.ok(spanUrl.includes('/api/documents/doc-abc-456/view?slide=21'));

    // Google Slides URL formatted with slide=id.p${exactSlide}
    const googleMapping: any = {
      mapped: true,
      sourceUrl: 'https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
      startSlide: 1,
      endSlide: 30,
      exactSlide: 15,
    };
    const googleUrl = getPresentationViewerUrl(googleMapping);
    assert.strictEqual(
      googleUrl,
      'https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#slide=id.p15'
    );
  });

  it('7. Slide image endpoint /api/documents/:id/slides/:slide/image delivers rendered slide image with valid auth', async () => {
    const { client } = await createClient('nav-images');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const whatToStudy = loadRes.json.whatToStudy;
    const docId = whatToStudy[0].lectureSource.documentId;

    // Fetch slide 1 image with query token
    const imgRes = await fetch(`${server.baseUrl}/api/documents/${docId}/slides/1/image?token=${client.token}`);
    assert.strictEqual(imgRes.status, 200);
    const contentType = imgRes.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('image/png') || contentType.includes('image/svg+xml'),
      `Content-Type must be image/png or image/svg+xml, got: ${contentType}`
    );
    const imgBuf = await imgRes.arrayBuffer();
    assert.ok(imgBuf.byteLength > 100, 'Image payload must not be empty');

    // Slide image with Bearer header
    const imgBearerRes = await fetch(`${server.baseUrl}/api/documents/${docId}/slides/2/image`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    assert.strictEqual(imgBearerRes.status, 200);
    assert.ok((imgBearerRes.headers.get('content-type') || '').includes('image/'));
  });

  it('8. Presentation view route serves text/html, includes visual slide image, and never triggers browser Pretty Print', async () => {
    const { client } = await createClient('nav-html-guarantee');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const whatToStudy = loadRes.json.whatToStudy;
    const docId = whatToStudy[0].lectureSource.documentId;

    // Standard browser request with Accept: */* or browser Accept header
    const viewRes = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=2&token=${client.token}`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
    assert.strictEqual(viewRes.status, 200);
    const contentType = viewRes.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/html'), `Must return text/html, got: ${contentType}`);
    const html = await viewRes.text();

    // Verify visual slide image element is present and points to slide 2
    assert.ok(html.includes('id="slide-img"'), 'Must contain slide image element');
    assert.ok(html.includes(`/api/documents/${docId}/slides/2/image`), 'Slide image src must point to slide 2 image endpoint');
    assert.ok(html.includes('id="slide-visual-view"'), 'Must contain slide visual view container');
    assert.ok(html.includes('mode-switcher'), 'Must contain mode switcher');
  });

  it('9. Missing or expired token on /view returns styled HTML error page instead of raw JSON Pretty Print', async () => {
    const { client } = await createClient('nav-error-html');
    const loadRes = await client.request('/api/academic/load-sample-pack', { method: 'POST' });
    const whatToStudy = loadRes.json.whatToStudy;
    const docId = whatToStudy[0].lectureSource.documentId;

    // Expired or invalid token
    const errRes = await fetch(`${server.baseUrl}/api/documents/${docId}/view?slide=1&token=definitely-expired-token-12345`);
    assert.strictEqual(errRes.status, 401);
    const contentType = errRes.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/html'), `Must return text/html error page on browser view, got: ${contentType}`);
    const html = await errRes.text();
    assert.ok(html.includes('Session Expired') || html.includes('Authentication Required'));
    assert.ok(html.includes('Log In to LazyLift'));

    // Non-existent document returns HTML 404
    const notFoundRes = await fetch(`${server.baseUrl}/api/documents/non-existent-doc-9999/view?slide=1&token=${client.token}`);
    assert.strictEqual(notFoundRes.status, 404);
    assert.ok((notFoundRes.headers.get('content-type') || '').includes('text/html'));
    const notFoundHtml = await notFoundRes.text();
    assert.ok(notFoundHtml.includes('Presentation Not Found'));
  });
});
