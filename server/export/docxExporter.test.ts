import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { exportToDocx } from './docxExporter.js';

function unzipTextEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054B50) { eocd = i; break; }
  }
  assert.notEqual(eocd, -1, 'ZIP end-of-central-directory must exist');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014B50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const raw = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.set(name, raw.toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test('docxExporter: creates a valid OpenXML package with formatted Markdown content', () => {
  const markdown = [
    '# Spécification Technique',
    '',
    'Texte **important**, *italique*, `code` et [documentation](https://example.com).',
    '',
    '- Premier élément',
    '- Deuxième élément',
    '',
    '1. Étape une',
    '2. Étape deux',
    '',
    '| Colonne 1 | Colonne 2 |',
    '|---|---|',
    '| Valeur A | Valeur B |',
    '',
    '```ts',
    'const answer = 42;',
    '```',
  ].join('\n');
  const buffer = exportToDocx(markdown, { title: 'Spécification Technique', author: 'Equipe Leanna' });
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.readUInt32LE(0), 0x04034B50, 'DOCX must start with a ZIP local header');

  const entries = unzipTextEntries(buffer);
  assert.ok(entries.has('[Content_Types].xml'));
  assert.ok(entries.has('word/document.xml'));
  assert.ok(entries.has('word/styles.xml'));
  assert.ok(entries.has('word/numbering.xml'));
  assert.ok(entries.has('word/_rels/document.xml.rels'));

  const document = entries.get('word/document.xml')!;
  assert.ok(document.includes('Spécification Technique'));
  assert.ok(document.includes('Valeur A'));
  assert.ok(document.includes('answer = 42;'));
  assert.ok(document.includes('Premier élément'));
  assert.ok(document.includes('Deuxième élément'));
  assert.ok(document.includes('Étape une'));
  assert.ok(document.includes('Étape deux'));
  assert.ok(document.includes('<w:hyperlink r:id="rIdLink1">'));
  assert.ok(document.includes('<w:numId w:val="1"/>'));
  assert.ok(document.includes('<w:numId w:val="2"/>'));
  assert.ok(entries.get('word/_rels/document.xml.rels')!.includes('https://example.com'));
});

test('docxExporter: escapes metadata and raw HTML and emits a non-empty document', () => {
  const buffer = exportToDocx('<script>alert(1)</script>\n\nContenu.', { title: '<Leanna>', author: 'A&B' });
  const entries = unzipTextEntries(buffer);
  const document = entries.get('word/document.xml')!;
  const core = entries.get('docProps/core.xml')!;
  assert.ok(document.includes('&lt;script&gt;'));
  assert.ok(!document.includes('<script>'));
  assert.ok(document.includes('&lt;Leanna&gt;'));
  assert.ok(core.includes('A&amp;B'));
});
