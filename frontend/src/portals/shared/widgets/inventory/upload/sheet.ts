/**
 * Reads an uploaded .xlsx or .csv into rows of cell text, entirely in the browser (no upload
 * happens here). An .xlsx file is a ZIP of XML parts: the ZIP central directory is walked by
 * hand, deflated parts go through the browser's DecompressionStream, and the XML through
 * DOMParser (namespace-agnostic lookups). Only the first worksheet is read; formula cells
 * contribute their cached values. Old binary .xls and password-protected workbooks are refused.
 */
import { MAX_ITEMS } from './model';

export class SheetError extends Error {}

export interface SheetResult {
  kind: 'xlsx' | 'csv';
  rows: string[][];
  sheetName: string | null;
}

const MAX_SHEET_ROWS = MAX_ITEMS + 500;
const MAX_COLUMNS = 200;
const DAMAGED = 'This .xlsx file looks damaged. Open it in Excel, save it again, and retry.';

/** Reads the file's bytes, reporting progress (0..1) as the browser delivers them. */
export function readFileBytes(file: File, onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    reader.onerror = () => reject(new SheetError('The file could not be read.'));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        onProgress(1);
        resolve(result);
      } else reject(new SheetError('The file could not be read.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Detects the format from the bytes (and the name), then reads the rows. */
export async function readSheet(fileName: string, buf: ArrayBuffer): Promise<SheetResult> {
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  const lower = fileName.toLowerCase();
  if (isOle || lower.endsWith('.xls')) {
    throw new SheetError('Old .xls files and password-protected workbooks are not supported. In Excel use Save As → Excel Workbook (.xlsx) or CSV.');
  }
  if (isZip) {
    const { rows, sheetName } = await readXlsx(buf);
    return { kind: 'xlsx', rows, sheetName };
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return { kind: 'csv', rows: parseCsv(decodeText(buf)), sheetName: null };
  throw new SheetError('Choose an Excel workbook (.xlsx) or a CSV file.');
}

/* ------------------------------------------------------------------- CSV */

function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Excel on Windows often saves CSV in the ANSI code page
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function countOf(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/** RFC 4180 CSV (quoted cells, doubled quotes, CRLF); the delimiter (, ; tab) is detected from line 1. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a UTF-8 byte-order mark
  const nl = src.search(/\r?\n/);
  const firstLine = nl < 0 ? src : src.slice(0, nl);
  const delim = [',', ';', '\t'].reduce((best, d) => (countOf(firstLine, d) > countOf(firstLine, best) ? d : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > MAX_SHEET_ROWS) throw new SheetError(`The file has more than ${MAX_SHEET_ROWS} rows.`);
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ XLSX */

interface ZipEntry {
  method: number;
  offset: number;
  size: number;
}

function zipEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const dv = new DataView(buf);
  const min = Math.max(0, buf.byteLength - 65557);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= min; i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SheetError(DAMAGED);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const names = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) throw new SheetError(DAMAGED);
    const nameLen = dv.getUint16(p + 28, true);
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}

async function unzipText(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf);
  if (e.offset + 30 > buf.byteLength || dv.getUint32(e.offset, true) !== 0x04034b50) throw new SheetError(DAMAGED);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = buf.slice(start, start + e.size);
  let bytes: ArrayBuffer;
  if (e.method === 0) bytes = raw;
  else if (e.method === 8) {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = await new Response(stream).arrayBuffer();
  } else throw new SheetError('This .xlsx file uses a compression method the browser cannot read.');
  return new TextDecoder().decode(bytes);
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new SheetError(DAMAGED);
  return doc;
}

function all(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

async function readXlsx(buf: ArrayBuffer): Promise<{ rows: string[][]; sheetName: string | null }> {
  const entries = zipEntries(buf);
  const part = async (name: string): Promise<Document | null> => {
    const e = entries.get(name);
    return e ? parseXml(await unzipText(buf, e)) : null;
  };

  // the first sheet in workbook order, resolved through the workbook relationships
  const workbook = await part('xl/workbook.xml');
  const rels = await part('xl/_rels/workbook.xml.rels');
  const sheet = workbook ? all(workbook, 'sheet')[0] : undefined;
  const sheetName = sheet?.getAttribute('name') ?? null;
  let path: string | null = null;
  if (sheet && rels) {
    const rid = sheet.getAttribute('r:id');
    const target = all(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  if (!path || !entries.has(path)) {
    path = [...entries.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))[0] ?? null;
  }
  const sheetEntry = path ? entries.get(path) : undefined;
  if (!sheetEntry) throw new SheetError('This workbook has no worksheet.');

  const sharedDoc = await part('xl/sharedStrings.xml');
  const shared = sharedDoc
    ? all(sharedDoc, 'si').map((si) =>
        all(si, 't')
          .filter((t) => t.parentElement?.localName !== 'rPh')
          .map((t) => t.textContent ?? '')
          .join(''),
      )
    : [];
  return { rows: sheetRows(parseXml(await unzipText(buf, sheetEntry)), shared), sheetName };
}

/** "BC12" → 54 (0-based column index). */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function cellText(c: Element, shared: readonly string[]): string {
  const t = c.getAttribute('t');
  if (t === 'inlineStr') return all(c, 't').map((x) => x.textContent ?? '').join('');
  const v = all(c, 'v')[0]?.textContent ?? '';
  if (t === 's') return shared[Number(v)] ?? '';
  if (t === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  if (t === 'str' || t === 'e' || v === '') return v;
  const n = Number(v);
  // 15 significant digits drops binary noise: 3 × 4.1 is stored as 12.299999999999999
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v;
}

function sheetRows(doc: Document, shared: readonly string[]): string[][] {
  const rows: (string[] | undefined)[] = [];
  let nextRow = 0;
  for (const rowEl of all(doc, 'row')) {
    const r = Number(rowEl.getAttribute('r'));
    const ri = Number.isInteger(r) && r > 0 ? r - 1 : nextRow;
    if (ri >= MAX_SHEET_ROWS) throw new SheetError(`The sheet has more than ${MAX_SHEET_ROWS} rows.`);
    nextRow = ri + 1;
    const cells: (string | undefined)[] = [];
    let nextCol = 0;
    for (const c of all(rowEl, 'c')) {
      const ref = c.getAttribute('r');
      const ci = ref ? colIndex(ref) : nextCol;
      nextCol = ci + 1;
      if (ci >= 0 && ci < MAX_COLUMNS) cells[ci] = cellText(c, shared);
    }
    rows[ri] = Array.from(cells, (v) => v ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}
