import * as z from 'zod';
import { ApiError } from '../../../web-core/api';
import type { FixtureRequest, FixtureSet } from '../../core/ports';
import type { DataSources } from '../../core/sources';

/* --------------------------------------------------------- wire shapes */

export type StockListStatus = 'DRAFT' | 'PENDING_CHECKER' | 'APPROVED' | 'REJECTED';

/** A server-side finding on one item (the server re-runs every browser check). */
export interface ItemProblem {
  field: string;
  code: string;
  message: string;
}

export interface StockItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  /** minor units */
  unitPrice: string;
  /** minor units, computed by the server (quantity × unit price) */
  totalPrice: string;
  errors: ItemProblem[];
}

/** GET /api/plugins/inventory/stock-lists/{listId} → StockList */
export interface StockList {
  id: string;
  tenantId: string;
  source: 'UPLOAD' | 'MANUAL';
  fileName: string | null;
  status: StockListStatus;
  itemCount: number;
  /** minor units, computed by the server */
  totalValue: string;
  currency: string;
  version: number;
  makerId: string;
  createdAt: string;
  updatedAt: string;
  items: StockItem[];
}

export type StockListSummary = Omit<StockList, 'items' | 'tenantId' | 'makerId' | 'createdAt' | 'version'>;

/** GET /api/plugins/inventory/stock-lists → StockListPage */
export interface StockListPage {
  items: StockListSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface NewItemBody {
  productId: string;
  name: string;
  quantity: number;
  /** minor units */
  unitPrice: string;
}

export interface CreateListBody {
  source: 'UPLOAD' | 'MANUAL';
  fileName: string | null;
  items: NewItemBody[];
}

export type UpdateItemBody = Partial<NewItemBody> & { version: number };

/* ----------------------------------------------------- endpoint mapping */

const BASE = '/api/plugins/inventory/stock-lists';

export const sources: DataSources = {
  'inventory.upload.lists': { '*': { method: 'GET', path: BASE, query: ['page', 'size', 'q', 'status', 'sort'] } },
  'inventory.upload.list.get': { '*': { method: 'GET', path: `${BASE}/{listId}` } },
};

export const commands: DataSources = {
  'inventory.upload.list.create': { '*': { method: 'POST', path: BASE } },
  'inventory.upload.item.add': { '*': { method: 'POST', path: `${BASE}/{listId}/items` } },
  'inventory.upload.item.update': { '*': { method: 'PATCH', path: `${BASE}/{listId}/items/{itemId}` } },
  'inventory.upload.item.delete': { '*': { method: 'DELETE', path: `${BASE}/{listId}/items/{itemId}` } },
  'inventory.upload.list.delete': { '*': { method: 'DELETE', path: `${BASE}/{listId}` } },
  'inventory.upload.list.submit': { '*': { method: 'POST', path: `${BASE}/{listId}/submit` } },
};

/* ------------------------------------------- fixtures: an in-memory server */

const TENANT = '00000000-0000-0000-0000-0000000000a2';
const MAKER = '00000000-0000-0000-0000-000000000301';
let seq = 0x100;
const fakeId = () => `00000000-0000-0000-0000-${(seq += 1).toString(16).padStart(12, '0')}`;

const newItemSchema = z.object({
  productId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.string().regex(/^\d+$/),
});
const createSchema = z.object({ source: z.enum(['UPLOAD', 'MANUAL']), fileName: z.string().nullable(), items: z.array(newItemSchema) });
const updateSchema = newItemSchema.partial().extend({ version: z.number().int() });

function problem(status: number, code: string, detail: string): ApiError {
  return new ApiError({ status, code, title: code, detail });
}

function toItem(b: NewItemBody): StockItem {
  return {
    id: fakeId(),
    productId: b.productId.trim(),
    name: b.name.trim(),
    quantity: b.quantity,
    unitPrice: b.unitPrice,
    totalPrice: (BigInt(b.quantity) * BigInt(b.unitPrice)).toString(),
    errors: [],
  };
}

/** What the server would recompute after every change: totals, counts, duplicate findings. */
function settle(list: StockList, touch = true): StockList {
  const counts = new Map<string, number>();
  for (const it of list.items) counts.set(it.productId.toUpperCase(), (counts.get(it.productId.toUpperCase()) ?? 0) + 1);
  list.items = list.items.map((it) => ({
    ...it,
    totalPrice: (BigInt(it.quantity) * BigInt(it.unitPrice)).toString(),
    errors: (counts.get(it.productId.toUpperCase()) ?? 0) > 1
      ? [{ field: 'productId', code: 'DUPLICATE_PRODUCT', message: 'This product id appears more than once in the list.' }]
      : [],
  }));
  list.itemCount = list.items.length;
  list.totalValue = list.items.reduce((sum, it) => sum + BigInt(it.totalPrice), 0n).toString();
  if (touch) {
    list.version += 1;
    list.updatedAt = new Date().toISOString();
  }
  return list;
}

function seedList(
  fileName: string | null,
  status: StockListStatus,
  updatedAt: string,
  items: [string, string, number, string][],
): StockList {
  const list: StockList = {
    id: fakeId(), tenantId: TENANT, source: fileName ? 'UPLOAD' : 'MANUAL', fileName, status,
    itemCount: 0, totalValue: '0', currency: 'NAD', version: 1, makerId: MAKER,
    createdAt: updatedAt, updatedAt,
    items: items.map(([productId, name, quantity, unitPrice]) => toItem({ productId, name, quantity, unitPrice })),
  };
  return settle(list, false);
}

const lists = new Map<string, StockList>();
for (const l of [
  seedList('march-stock.xlsx', 'DRAFT', '2026-11-18T09:12:00Z', [
    ['MM-10KG-001', 'Maize meal 10kg', 120, '11999'],
    ['OIL-2L-014', 'Sunflower oil 2L', 80, '6450'],
    ['SUG-25-203', 'White sugar 2.5kg', 150, '4299'],
    ['RICE-5-077', 'Long grain rice 5kg', 60, '8925'],
  ]),
  seedList(null, 'DRAFT', '2026-11-17T15:40:00Z', [
    ['TEA-100-311', 'Rooibos tea 100 bags', 40, '5499'],
    ['FLR-10-118', 'Bread flour 10kg', 35, '13950'],
    ['SALT-1-042', 'Iodised salt 1kg', 200, '1299'],
  ]),
  seedList('october-stock.csv', 'PENDING_CHECKER', '2026-11-12T11:05:00Z', [
    ['MM-10KG-001', 'Maize meal 10kg', 300, '11999'],
    ['BEAN-1-090', 'Sugar beans 1kg', 90, '3450'],
    ['SOAP-4-021', 'Laundry soap bar 4-pack', 120, '2875'],
  ]),
]) lists.set(l.id, l);

function getDraft(id: string | undefined): StockList {
  const list = id ? lists.get(id) : undefined;
  if (!list) throw problem(404, 'STOCK_LIST_NOT_FOUND', 'No stock list with that id.');
  if (list.status !== 'DRAFT') throw problem(409, 'STOCK_LIST_STATE', 'Only a draft list can be changed.');
  return list;
}

function bodyOf<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw problem(400, 'VALIDATION_FAILED', r.error.issues[0]?.message ?? 'Invalid request.');
  return r.data;
}

function summary(l: StockList): StockListSummary {
  return { id: l.id, source: l.source, fileName: l.fileName, status: l.status, itemCount: l.itemCount, totalValue: l.totalValue, currency: l.currency, updatedAt: l.updatedAt };
}

const EMPTY_PAGE: StockListPage = { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0, hasNext: false };

/** workbench scenarios: default (a working in-memory server), empty, error (null = the tool simulates a 500) */
export const fixtures: FixtureSet = {
  'inventory.upload.lists': {
    default: (req: FixtureRequest): StockListPage => {
      const size = Math.min(100, Math.max(1, Number(req.params.size ?? '20') || 20));
      const page = Math.max(0, Number(req.params.page ?? '0') || 0);
      const all = [...lists.values()]
        .filter((l) => !req.params.status || l.status === req.params.status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return {
        items: all.slice(page * size, page * size + size).map(summary),
        page, size, totalElements: all.length, totalPages: Math.ceil(all.length / size), hasNext: (page + 1) * size < all.length,
      };
    },
    empty: EMPTY_PAGE,
    error: null,
  },
  'inventory.upload.list.get': {
    default: (req: FixtureRequest): StockList => {
      const list = lists.get(req.params.listId ?? '');
      if (!list) throw problem(404, 'STOCK_LIST_NOT_FOUND', 'No stock list with that id.');
      return structuredClone(list);
    },
    empty: null,
    error: null,
  },
  'inventory.upload.list.create': {
    default: (req: FixtureRequest): StockList => {
      const b = bodyOf(createSchema, req.body);
      if (b.items.length === 0) throw problem(400, 'STOCK_LIST_EMPTY', 'A list needs at least one item.');
      const now = new Date().toISOString();
      const list: StockList = {
        id: fakeId(), tenantId: TENANT, source: b.source, fileName: b.fileName, status: 'DRAFT', itemCount: 0,
        totalValue: '0', currency: 'NAD', version: 0, makerId: MAKER, createdAt: now, updatedAt: now,
        items: b.items.map(toItem),
      };
      lists.set(list.id, settle(list));
      return structuredClone(list);
    },
  },
  'inventory.upload.item.add': {
    default: (req: FixtureRequest): StockList => {
      const list = getDraft(req.params.listId);
      list.items.push(toItem(bodyOf(newItemSchema, req.body)));
      return structuredClone(settle(list));
    },
  },
  'inventory.upload.item.update': {
    default: (req: FixtureRequest): StockList => {
      const list = getDraft(req.params.listId);
      const b = bodyOf(updateSchema, req.body);
      if (b.version !== list.version) throw problem(409, 'STOCK_LIST_VERSION', 'The list changed since you loaded it.');
      const i = list.items.findIndex((it) => it.id === req.params.itemId);
      if (i < 0) throw problem(404, 'STOCK_ITEM_NOT_FOUND', 'No such item in this list.');
      const next = { ...list.items[i] };
      if (b.productId !== undefined) next.productId = b.productId;
      if (b.name !== undefined) next.name = b.name;
      if (b.quantity !== undefined) next.quantity = b.quantity;
      if (b.unitPrice !== undefined) next.unitPrice = b.unitPrice;
      list.items[i] = next;
      return structuredClone(settle(list));
    },
  },
  'inventory.upload.item.delete': {
    default: (req: FixtureRequest): StockList => {
      const list = getDraft(req.params.listId);
      const before = list.items.length;
      list.items = list.items.filter((it) => it.id !== req.params.itemId);
      if (list.items.length === before) throw problem(404, 'STOCK_ITEM_NOT_FOUND', 'No such item in this list.');
      return structuredClone(settle(list));
    },
  },
  'inventory.upload.list.delete': {
    default: (req: FixtureRequest): null => {
      lists.delete(getDraft(req.params.listId).id);
      return null;
    },
  },
  'inventory.upload.list.submit': {
    default: (req: FixtureRequest): StockList => {
      const list = getDraft(req.params.listId);
      if (list.items.length === 0) throw problem(422, 'STOCK_LIST_EMPTY', 'A list needs at least one item.');
      if (list.items.some((it) => it.errors.length > 0)) throw problem(422, 'STOCK_LIST_INVALID', 'Fix the items the server flagged before submitting.');
      list.status = 'PENDING_CHECKER';
      return structuredClone(settle(list));
    },
  },
};
