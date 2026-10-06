import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Api, createTestServer, removeTempDir, TestServer } from './helpers';

describe('DOCX OOXML provenance', () => {
  let server: TestServer; let client: Api; let fixtureDir: string;
  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazylift-docx-'));
    fs.mkdirSync(path.join(fixtureDir, 'word'), { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, '[Content_Types].xml'), '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    fs.writeFileSync(path.join(fixtureDir, 'word', 'document.xml'), '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Paging</w:t></w:r></w:p><w:p><w:r><w:t>Paging maps virtual memory.</w:t></w:r></w:p><w:p><w:r><w:t>Page replacement chooses a victim.</w:t></w:r></w:p></w:body></w:document>');
    const archive = path.join(os.tmpdir(), `lazylift-docx-${Date.now()}.zip`);
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${fixtureDir}\\*' -DestinationPath '${archive}'`]);
    fs.renameSync(archive, path.join(fixtureDir, 'notes.docx'));
    server = await createTestServer(); client = new Api(server.baseUrl); const auth = await client.register('docx@example.com', 'secret123'); client.token = auth.token;
  });
  after(() => { fs.rmSync(fixtureDir, { recursive: true, force: true }); void server.close(); removeTempDir(server.dbDir); });
  it('persists OOXML heading and paragraph range without page numbers', async () => {
    const uploaded = await client.request('/api/materials/analyze', { method: 'POST', body: { files: [{ title: 'notes.docx', category: 'lecture', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: fs.readFileSync(path.join(fixtureDir, 'notes.docx')).toString('base64') }] } });
    assert.strictEqual(uploaded.status, 201, JSON.stringify(uploaded.json));
    const id = uploaded.json.results[0].document.id;
    const locations = await client.request(`/api/materials/${id}/locations`);
    assert.strictEqual(locations.json.locations[0].locationType, 'section');
    assert.strictEqual(locations.json.locations[0].sectionTitle, 'Paging');
    assert.strictEqual(locations.json.locations[0].locationStart, 1);
    assert.strictEqual(locations.json.locations[0].locationEnd, 3);
  });
});
