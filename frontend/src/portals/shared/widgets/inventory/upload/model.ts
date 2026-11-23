/**
 * Inventory list model: the column contract, money in minor units, and the in-browser checks
 * that run before anything is sent. The server re-checks everything; these checks only point
 * out problems early so the user can fix them before uploading.
 */
import * as z from 'zod';

export const CURRENCY = 'NAD';
export const MAX_ITEMS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_QUANTITY = 1_000_000_000n;

export const ITEM_FIELDS = ['productId', 'name', 'quantity', 'unitPrice', 'totalPrice'] as const;
export type ItemField = (typeof ITEM_FIELDS)[number];
const REQUIRED_COLUMNS: readonly ItemField[] = ['productId', 'name', 'quantity', 'unitPrice'];

export function isItemField(v: string): v is ItemField {
  return (ITEM_FIELDS as readonly string[]).includes(v);
}

export const FIELD_LABEL: Record<ItemField, string> = {
  productId: 'Inventory product id',
  name: 'Name',
  quantity: 'Quantity',
  unitPrice: 'Unit price',
  totalPrice: 'Total price',
};

/** One line as the user typed it or the file held it: text, so mistakes can be shown and fixed. */
export interface DraftItem {
  key: string;
  /** spreadsheet row number (1-based, as Excel shows it); null when added by hand */
  rowNo: number | null;
  productId: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

export type ItemValues = Omit<DraftItem, 'key' | 'rowNo'>;

export const EMPTY_VALUES: ItemValues = { productId: '', name: '', quantity: '', unitPrice: '', totalPrice: '' };

export interface Issue {
  field: ItemField | 'row';
  severity: 'error' | 'warning';
  message: string;
}

/** A list being prepared in the browser, before it is sent to the server. */
export interface DraftList {
  source: 'UPLOAD' | 'MANUAL';
  fileName: string | null;
  fileSize: number | null;
  sheetName: string | null;
  items: DraftItem[];
}

/* ------------------------------------------------------------------ money */

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const GROUPED_MONEY_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/** "1,234.50" · "N$ 12.5" · "12" → minor units ("123450"); null when it is not a valid amount. */
export function toMinor(raw: string): string | null {
  const t = raw.trim().replace(/^(N\$|NAD)/i, '').replace(/\s+/g, '');
  const plain = GROUPED_MONEY_RE.test(t) ? t.replace(/,/g, '') : t;
  if (!MONEY_RE.test(plain)) return null;
  const [whole, frac = ''] = plain.split('.');
  return (BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2))).toString();
}

/** minor units → "NAD 1,234.50" (display only; never parsed back for arithmetic). */
export function formatMinor(minor: string, currency = CURRENCY): string {
  if (!/^-?\d+$/.test(minor)) return '—';
  const v = BigInt(minor);
  const abs = v < 0n ? -v : v;
  const whole = (abs / 100n).toLocaleString('en-US');
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${v < 0n ? '-' : ''}${currency} ${whole}.${cents}`;
}

/** minor units → "1234.50", the text an edit form starts from. */
export function minorToText(minor: string): string {
  if (!/^\d+$/.test(minor)) return '';
  const v = BigInt(minor);
  return `${(v / 100n).toString()}.${(v % 100n).toString().padStart(2, '0')}`;
}

/** "1,200" · "15" → 15n; null unless a whole number from 1 to 1,000,000,000. */
export function toQuantity(raw: string): bigint | null {
  const t = raw.trim().replace(/\s+/g, '');
  const plain = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t;
  if (!/^\d+$/.test(plain)) return null;
  const q = BigInt(plain);
  return q >= 1n && q <= MAX_QUANTITY ? q : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ----------------------------------------------------------------- checks */

const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;

/** Field checks for one line (shared by the form and the list review). */
export function checkItem(v: ItemValues): Issue[] {
  const out: Issue[] = [];
  const err = (field: ItemField, message: string) => out.push({ field, severity: 'error', message });
  const warn = (field: ItemField, message: string) => out.push({ field, severity: 'warning', message });

  const pid = v.productId.trim();
  if (!pid) err('productId', 'Inventory product id is required.');
  else if (!PRODUCT_ID_RE.test(pid)) err('productId', 'Use letters, digits, dot, dash, underscore or slash (64 at most).');

  const name = v.name.trim();
  if (!name) err('name', 'Name is required.');
  else if (name.length > 120) err('name', 'Name is longer than 120 characters.');

  const qty = toQuantity(v.quantity);
  if (!v.quantity.trim()) err('quantity', 'Quantity is required.');
  else if (qty === null) err('quantity', 'Quantity must be a whole number from 1 to 1,000,000,000.');

  const unit = toMinor(v.unitPrice);
  if (!v.unitPrice.trim()) err('unitPrice', 'Unit price is required.');
  else if (unit === null) err('unitPrice', 'Unit price must be an amount like 12.50 (2 decimals at most).');
  else if (unit === '0') warn('unitPrice', 'Unit price is zero.');

  if (v.totalPrice.trim()) {
    const total = toMinor(v.totalPrice);
    if (total === null) err('totalPrice', 'Total price must be an amount like 150.00 (2 decimals at most).');
    else if (qty !== null && unit !== null && BigInt(total) !== qty * BigInt(unit)) {
      const expected = (qty * BigInt(unit)).toString();
      err('totalPrice', `Total price ${formatMinor(total)} is not quantity × unit price (${formatMinor(expected)}).`);
    }
  }
  return out;
}

/** The form schema (zod): every error from checkItem lands on its field. */
export const itemSchema = z
  .object({ productId: z.string(), name: z.string(), quantity: z.string(), unitPrice: z.string(), totalPrice: z.string() })
  .superRefine((v, ctx) => {
    for (const issue of checkItem(v)) {
      if (issue.severity === 'error') ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.field], message: issue.message });
    }
  });

const idKey = (s: string) => s.trim().toUpperCase();
const where = (it: DraftItem) => (it.rowNo === null ? 'another line' : `row ${it.rowNo}`);

/** Checks for the whole list: every line's own checks plus duplicate product ids. */
export function checkList(items: readonly DraftItem[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const it of items) out.set(it.key, checkItem(it));
  const first = new Map<string, DraftItem>();
  const flagged = new Set<string>();
  for (const it of items) {
    const id = idKey(it.productId);
    if (!id) continue;
    const prev = first.get(id);
    if (!prev) {
      first.set(id, it);
      continue;
    }
    out.get(it.key)?.push({ field: 'productId', severity: 'error', message: `Duplicate product id: also on ${where(prev)}.` });
    if (!flagged.has(prev.key)) {
      flagged.add(prev.key);
      out.get(prev.key)?.push({ field: 'productId', severity: 'error', message: `Duplicate product id: also on ${where(it)}.` });
    }
  }
  return out;
}

export function countIssues(issues: ReadonlyMap<string, readonly Issue[]>): { errorRows: number; warningRows: number } {
  let errorRows = 0;
  let warningRows = 0;
  for (const list of issues.values()) {
    if (list.some((i) => i.severity === 'error')) errorRows += 1;
    else if (list.length) warningRows += 1;
  }
  return { errorRows, warningRows };
}

/* -------------------------------------------------------- column mapping */

const HEADER_ALIASES: Record<ItemField, readonly string[]> = {
  productId: ['inventoryproductid', 'productid', 'inventoryid', 'itemid', 'sku', 'productcode', 'itemcode', 'code'],
  name: ['name', 'productname', 'itemname', 'description', 'product', 'item'],
  quantity: ['quantity', 'qty', 'units', 'count'],
  unitPrice: ['unitprice', 'price', 'unitcost', 'priceperunit', 'rate'],
  totalPrice: ['totalprice', 'total', 'amount', 'linetotal', 'totalvalue', 'value'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface MappedSheet {
  items: DraftItem[];
  missing: ItemField[];
  /** 1-based row of the header line */
  headerRow: number;
  skippedEmpty: number;
  truncated: boolean;
}

/** First non-empty row = column names; every later non-empty row becomes one item. */
export function mapRows(rows: readonly (readonly string[])[], keyPrefix: string): MappedSheet {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (headerIdx < 0) return { items: [], missing: [...REQUIRED_COLUMNS], headerRow: 0, skippedEmpty: 0, truncated: false };

  const header = rows[headerIdx].map(norm);
  const col: Partial<Record<ItemField, number>> = {};
  const taken = new Set<number>();
  // exact names first, then names that start with an alias ("Unit price (NAD)")
  for (const pass of ['exact', 'prefix'] as const) {
    for (const f of ITEM_FIELDS) {
      if (col[f] !== undefined) continue;
      const i = header.findIndex(
        (h, idx) =>
          !taken.has(idx) &&
          HEADER_ALIASES[f].some((a) => (pass === 'exact' ? h === a : a.length >= 5 && h.startsWith(a))),
      );
      if (i >= 0) {
        col[f] = i;
        taken.add(i);
      }
    }
  }
  const missing = REQUIRED_COLUMNS.filter((f) => col[f] === undefined);

  const items: DraftItem[] = [];
  let skippedEmpty = 0;
  let truncated = false;
  for (let r = headerIdx + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row.some((c) => c.trim() !== '')) {
      skippedEmpty += 1;
      continue;
    }
    if (items.length >= MAX_ITEMS) {
      truncated = true;
      break;
    }
    const cell = (f: ItemField) => {
      const i = col[f];
      return i === undefined ? '' : (row[i] ?? '').trim();
    };
    items.push({
      key: `${keyPrefix}-${r + 1}`,
      rowNo: r + 1,
      productId: cell('productId'),
      name: cell('name'),
      quantity: cell('quantity'),
      unitPrice: cell('unitPrice'),
      totalPrice: cell('totalPrice'),
    });
  }
  return { items, missing, headerRow: headerIdx + 1, skippedEmpty, truncated };
}
