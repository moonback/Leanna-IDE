import { deflateRawSync } from 'node:zlib';
import { Lexer } from 'marked';

export interface DocxExportOptions {
  title?: string;
  author?: string;
  subject?: string;
}

type Token = Record<string, any>;

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function run(text: string, options: { bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean } = {}): string {
  const props = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.strike ? '<w:strike/>' : '',
    options.code ? '<w:rStyle w:val="CodeChar"/>' : '',
  ].filter(Boolean).join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function inline(tokens: Token[] = [], links: string[] = [], flags: { bold?: boolean; italic?: boolean; strike?: boolean } = {}): string {
  return tokens.map((token) => {
    switch (token.type) {
      case 'text':
      case 'escape':
        return token.tokens ? inline(token.tokens, links, flags) : run(token.text ?? '', flags);
      case 'strong':
        return inline(token.tokens ?? [], links, { ...flags, bold: true });
      case 'em':
        return inline(token.tokens ?? [], links, { ...flags, italic: true });
      case 'del':
        return inline(token.tokens ?? [], links, { ...flags, strike: true });
      case 'codespan':
        return run(token.text ?? '', { ...flags, code: true });
      case 'br':
        return '<w:r><w:br/></w:r>';
      case 'link': {
        const href = String(token.href ?? '');
        const label = inline(token.tokens ?? [{ type: 'text', text: token.text ?? href }], links, flags);
        if (!/^https?:\/\//i.test(href)) return label;
        const id = `rIdLink${links.length + 1}`;
        links.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(href)}" TargetMode="External"/>`);
        return `<w:hyperlink r:id="${id}">${label}</w:hyperlink>`;
      }
      case 'image':
        return run(token.text ? `[Image : ${token.text}]` : '[Image]', flags);
      default:
        return token.text ? run(token.text, flags) : '';
    }
  }).join('');
}

function paragraph(content: string, style?: string, extra = ''): string {
  const pPr = [style ? `<w:pStyle w:val="${style}"/>` : '', extra].filter(Boolean).join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content || '<w:r><w:t></w:t></w:r>'}</w:p>`;
}

function renderTable(token: Token, links: string[]): string {
  const rows: Token[][] = [];
  if (Array.isArray(token.header)) rows.push(token.header);
  if (Array.isArray(token.rows)) rows.push(...token.rows);
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const grid = Array.from({ length: columnCount }, () => '<w:gridCol w:w="2400"/>').join('');
  const renderedRows = rows.map((cells, rowIndex) => {
    const cellsXml = Array.from({ length: columnCount }, (_, index) => {
      const cell = cells[index];
      const content = cell ? inline(cell.tokens ?? [{ type: 'text', text: cell.text ?? '' }], links) : '';
      const p = paragraph(content, rowIndex === 0 ? 'TableHeader' : undefined);
      return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:fill="${rowIndex === 0 ? 'E2E8F0' : 'FFFFFF'}"/></w:tcPr>${p}</w:tc>`;
    }).join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${renderedRows}</w:tbl>`;
}

function renderTokens(tokens: Token[], links: string[], listDepth = 0): string {
  return tokens.map((token) => {
    switch (token.type) {
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(token.depth) || 1));
        return paragraph(inline(token.tokens ?? [], links), `Heading${level}`);
      }
      case 'paragraph':
        return paragraph(inline(token.tokens ?? [], links));
      case 'text':
        return paragraph(inline(token.tokens ?? [{ type: 'text', text: token.text ?? '' }], links));
      case 'blockquote':
        return renderTokens(token.tokens ?? [], links, listDepth);
      case 'list': {
        const ordered = Boolean(token.ordered);
        return (token.items ?? []).map((item: Token) => {
          const itemRuns = inline(item.tokens ?? [{ type: 'text', text: item.text ?? '' }], links);
          const numId = ordered ? '2' : '1';
          const first = paragraph(itemRuns, undefined, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`);
          return first + (item.items?.length ? renderTokens(item.items, links, listDepth + 1) : '');
        }).join('');
      }
      case 'table':
        return renderTable(token, links);
      case 'code':
        return paragraph(run(token.text ?? '', { code: true }), 'CodeBlock');
      case 'hr':
        return paragraph('', undefined, '<w:pBdr><w:bottom w:val="single" w:sz="8" w:color="CBD5E1"/></w:pBdr>');
      case 'space':
        return '';
      case 'html':
        return paragraph(run(token.text ?? ''));
      default:
        return token.text ? paragraph(run(token.text)) : '';
    }
  }).join('');
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(files: Array<{ name: string; data: string }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const raw = Buffer.from(file.data, 'utf8');
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014B50, 0);
    entry.writeUInt16LE(0x031E, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBuffer, end]);
}

/** Génère un véritable document Word OpenXML (.docx) depuis du Markdown. */
export function exportToDocx(markdown: string, options: DocxExportOptions = {}): Buffer {
  const title = options.title || 'Document Leanna';
  const author = options.author || 'Leanna';
  const links: string[] = [];
  const body = renderTokens(Lexer.lex(markdown || '') as unknown as Token[], links);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${run(title, { bold: true })}</w:p>
${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;
  const rels = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ...links,
  ].join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0369A1"/></w:rPr></w:style>
${[1,2,3,4,5,6].map(n => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="${n}"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${Math.max(22, 34 - n * 2)}"/><w:color w:val="0369A1"/></w:rPr></w:style>`).join('')}
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:pPr><w:shd w:fill="F1F5F9"/><w:spacing w:before="80" w:after="80"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:fill="F1F5F9"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>${xml(author)}</dc:creator><dc:subject>${xml(options.subject || '')}</dc:subject></cp:coreProperties>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/numbering.xml', data: numbering },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
    { name: 'docProps/core.xml', data: core },
  ]);
}
