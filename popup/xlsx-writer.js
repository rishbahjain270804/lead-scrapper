/**
 * Minimal XLSX Writer — Pure JavaScript, no dependencies.
 *
 * Creates a valid .xlsx file (which is a ZIP of XML files).
 * Uses store-only ZIP (no compression) for simplicity.
 *
 * Usage:
 *   const blob = createXLSX(headers, rows);
 *   // headers = ["Name", "Phone", ...]
 *   // rows    = [["John", "123"], ["Jane", "456"], ...]
 */

function createXLSX(headers, rows) {
  // ── 1. Build Shared Strings (all unique cell values) ──
  const allCells = [...headers];
  rows.forEach(row => row.forEach(cell => allCells.push(cell)));

  const uniqueStrings = [...new Set(allCells)];
  const stringIndex = new Map();
  uniqueStrings.forEach((s, i) => stringIndex.set(s, i));

  // ── 2. Generate XML files ──

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Leads" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`;

  // ── Shared Strings XML ──
  const escXml = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allCells.length}" uniqueCount="${uniqueStrings.length}">`;
  uniqueStrings.forEach(s => {
    sharedStrings += `<si><t>${escXml(s)}</t></si>`;
  });
  sharedStrings += `</sst>`;

  // ── Worksheet XML ──
  function colLetter(idx) {
    let s = '';
    idx++;
    while (idx > 0) {
      idx--;
      s = String.fromCharCode(65 + (idx % 26)) + s;
      idx = Math.floor(idx / 26);
    }
    return s;
  }

  let sheetData = '';

  // Header row (style=1 for bold + blue background)
  sheetData += '<row r="1">';
  headers.forEach((h, ci) => {
    const ref = colLetter(ci) + '1';
    sheetData += `<c r="${ref}" t="s" s="1"><v>${stringIndex.get(h)}</v></c>`;
  });
  sheetData += '</row>';

  // Data rows
  rows.forEach((row, ri) => {
    const rowNum = ri + 2;
    sheetData += `<row r="${rowNum}">`;
    row.forEach((cell, ci) => {
      const ref = colLetter(ci) + rowNum;
      sheetData += `<c r="${ref}" t="s"><v>${stringIndex.get(cell)}</v></c>`;
    });
    sheetData += '</row>';
  });

  // Set column widths
  let cols = '';
  headers.forEach((h, i) => {
    let w = Math.max(h.length, 15);
    if (h === "Business Name" || h === "Address" || h === "Maps URL") w = 35;
    if (h === "Website" || h === "Social Media") w = 30;
    cols += `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`;
  });

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${cols}</cols>
  <sheetData>${sheetData}</sheetData>
</worksheet>`;

  // ── 3. Build ZIP file ──
  const files = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/sharedStrings.xml', data: sharedStrings },
    { name: 'xl/styles.xml', data: styles }
  ];

  return buildZipBlob(files);
}

/**
 * Builds a ZIP file (store-only, no compression) from an array of
 * { name: string, data: string } entries. Returns a Blob.
 */
function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const entries = files.map(f => ({
    name: encoder.encode(f.name),
    data: encoder.encode(f.data)
  }));

  // Calculate sizes
  let offset = 0;
  const localHeaders = [];
  const centralHeaders = [];

  entries.forEach(entry => {
    const localHeader = buildLocalFileHeader(entry.name, entry.data);
    localHeaders.push({ header: localHeader, data: entry.data, offset });
    offset += localHeader.byteLength + entry.data.byteLength;
  });

  // Central directory
  let centralOffset = offset;
  entries.forEach((entry, i) => {
    const central = buildCentralDirectoryHeader(entry.name, entry.data, localHeaders[i].offset);
    centralHeaders.push(central);
    offset += central.byteLength;
  });

  const centralSize = offset - centralOffset;
  const endRecord = buildEndOfCentralDirectory(entries.length, centralSize, centralOffset);

  // Combine all parts
  const parts = [];
  localHeaders.forEach(lh => {
    parts.push(lh.header);
    parts.push(lh.data);
  });
  centralHeaders.forEach(ch => parts.push(ch));
  parts.push(endRecord);

  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function buildLocalFileHeader(nameBytes, dataBytes) {
  const buf = new ArrayBuffer(30 + nameBytes.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, 0x04034b50, true);   // signature
  view.setUint16(4, 20, true);            // version needed
  view.setUint16(6, 0, true);             // flags
  view.setUint16(8, 0, true);             // compression: store
  view.setUint16(10, 0, true);            // mod time
  view.setUint16(12, 0, true);            // mod date
  view.setUint32(14, crc32(dataBytes), true);
  view.setUint32(18, dataBytes.byteLength, true);  // compressed size
  view.setUint32(22, dataBytes.byteLength, true);  // uncompressed size
  view.setUint16(26, nameBytes.byteLength, true);  // filename length
  view.setUint16(28, 0, true);            // extra field length
  new Uint8Array(buf, 30).set(nameBytes);
  return new Uint8Array(buf);
}

function buildCentralDirectoryHeader(nameBytes, dataBytes, localOffset) {
  const buf = new ArrayBuffer(46 + nameBytes.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, 0x02014b50, true);   // signature
  view.setUint16(4, 20, true);            // version made by
  view.setUint16(6, 20, true);            // version needed
  view.setUint16(8, 0, true);             // flags
  view.setUint16(10, 0, true);            // compression: store
  view.setUint16(12, 0, true);            // mod time
  view.setUint16(14, 0, true);            // mod date
  view.setUint32(16, crc32(dataBytes), true);
  view.setUint32(20, dataBytes.byteLength, true);
  view.setUint32(24, dataBytes.byteLength, true);
  view.setUint16(28, nameBytes.byteLength, true);
  view.setUint16(30, 0, true);            // extra field length
  view.setUint16(32, 0, true);            // comment length
  view.setUint16(34, 0, true);            // disk number
  view.setUint16(36, 0, true);            // internal attributes
  view.setUint32(38, 0, true);            // external attributes
  view.setUint32(42, localOffset, true);  // local header offset
  new Uint8Array(buf, 46).set(nameBytes);
  return new Uint8Array(buf);
}

function buildEndOfCentralDirectory(count, centralSize, centralOffset) {
  const buf = new ArrayBuffer(22);
  const view = new DataView(buf);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return new Uint8Array(buf);
}

/** CRC-32 implementation */
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.byteLength; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
