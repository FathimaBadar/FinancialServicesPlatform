import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useWidgetRuntime } from '../../core/runtime';
import { Alert, Button, KvPair, Panel } from '../../../ui/atoms';
import { ApiError } from '../../../web-core/api';
import { Drawer } from '../../kit/Drawer';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { ItemForm } from './ItemForm';
import { ItemsTable } from './ItemsTable';
import type { TableRow } from './ItemsTable';
import { checkList, countIssues, formatBytes, formatMinor, toMinor, toQuantity } from './model';
import type { DraftItem, DraftList, Issue, ItemValues } from './model';
import type { CreateListBody, NewItemBody, StockList } from './data';

export interface DraftReviewProps {
  draft: DraftList;
  notes: readonly string[];
  canWrite: boolean;
  /** functional update, so an Undo always applies to the latest list */
  onChange: (update: (draft: DraftList) => DraftList) => void;
  onDiscard: () => void;
  onUploaded: (list: StockList) => void;
}

const money = (text: string) => {
  if (!text.trim()) return '';
  const m = toMinor(text);
  return m === null ? text : formatMinor(m);
};

function toRow(it: DraftItem, issues: readonly Issue[]): TableRow {
  return {
    key: it.key, rowNo: it.rowNo, productId: it.productId, name: it.name, quantity: it.quantity,
    unitPrice: money(it.unitPrice), totalPrice: it.totalPrice.trim() ? money(it.totalPrice) : 'calculated on upload', issues,
  };
}

function toBody(it: DraftItem): NewItemBody | null {
  const quantity = toQuantity(it.quantity);
  const unitPrice = toMinor(it.unitPrice);
  if (quantity === null || unitPrice === null) return null;
  return { productId: it.productId.trim(), name: it.name.trim(), quantity: Number(quantity), unitPrice };
}

function uploadProblem(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return 'You are not allowed to upload inventory lists (needs inventory.stock.upload).';
    return e.detail || e.message;
  }
  return 'The upload failed. Check your connection, then try again — nothing was saved.';
}

/**
 * Step 2: the list as read from the file (or typed in), checked in the browser. The user fixes
 * or deletes lines, then uploads; the server re-checks and keeps the list as a DRAFT.
 */
export function DraftReview({ draft, notes, canWrite, onChange, onDiscard, onUploaded }: DraftReviewProps) {
  const { port } = useWidgetRuntime();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const issues = useMemo(() => checkList(draft.items), [draft.items]);
  const { errorRows, warningRows } = countIssues(issues);
  const manual = draft.source === 'MANUAL';
  const ids = draft.items.map((it) => it.productId);

  const upload = useMutation({
    mutationFn: () => {
      const body: CreateListBody = {
        source: draft.source,
        fileName: draft.fileName,
        items: draft.items.map(toBody).filter((b): b is NewItemBody => b !== null),
      };
      return port.command<StockList>('inventory.upload.list.create', body);
    },
    retry: 0,
    onSuccess: (list) => onUploaded(list),
  });

  const updateItems = (fn: (items: DraftItem[]) => DraftItem[]) => onChange((d) => ({ ...d, items: fn(d.items) }));
  const add = (v: ItemValues) => updateItems((items) => [...items, { key: crypto.randomUUID(), rowNo: null, ...v }]);
  const remove = (key: string) => {
    const index = draft.items.findIndex((it) => it.key === key);
    const removed = index >= 0 ? draft.items[index] : undefined;
    if (!removed) return;
    updateItems((items) => items.filter((it) => it.key !== key));
    setNotice({
      id: Date.now(),
      kind: 'ok',
      text: `Deleted ${removed.productId || 'the line'}${removed.rowNo ? ` (row ${removed.rowNo})` : ''}.`,
      undo: {
        label: 'Undo',
        run: () => {
          updateItems((items) => [...items.slice(0, index), removed, ...items.slice(index)]);
          setNotice(null);
        },
      },
    });
  };
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const rows = draft.items
    .map((it) => toRow(it, issues.get(it.key) ?? []))
    .filter((r) => !onlyProblems || r.issues.length > 0);
  const editItem = editing ? draft.items.find((it) => it.key === editing) : undefined;
  const busy = upload.isPending;
  const blocked = !canWrite || busy || draft.items.length === 0 || errorRows > 0;

  return (
    <div className="flex flex-col gap-4">
      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />

      <Panel className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <KvPair label={manual ? 'Source' : 'File'}>{manual ? 'Added by hand' : draft.fileName ?? '—'}</KvPair>
          {!manual && <KvPair label="Size">{draft.fileSize === null ? '—' : formatBytes(draft.fileSize)}</KvPair>}
          {!manual && <KvPair label="Sheet">{draft.sheetName ?? 'CSV'}</KvPair>}
          <KvPair label="Records">{draft.items.length}</KvPair>
          <KvPair label="With errors">{errorRows}</KvPair>
          <KvPair label="To check">{warningRows}</KvPair>
        </div>
        {notes.length > 0 && (
          <ul className="text-dim mt-3 flex flex-col gap-0.5 text-[12px]">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </Panel>

      {manual && canWrite && (
        <Panel className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Add an item</h3>
          <ItemForm submitLabel="Add to list" busy={busy} takenIds={ids} resetOnSubmit onSubmit={add} />
        </Panel>
      )}

      {draft.items.length > 0 && (errorRows > 0 ? (
        <Alert kind="bad">{errorRows === 1 ? '1 line has errors' : `${errorRows} lines have errors`}. Fix or delete them before uploading.</Alert>
      ) : (
        <Alert kind={warningRows > 0 ? 'warn' : 'ok'}>
          {warningRows > 0 ? `No errors. ${warningRows} line${warningRows > 1 ? 's' : ''} worth a second look.` : 'No problems found.'} Check the details, then upload.
        </Alert>
      ))}

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Items</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Only lines with problems
            </label>
            {!manual && canWrite && (
              <Button variant="ghost" data-action="add-item" disabled={busy} onClick={() => setAdding(true)}>
                <Plus size={14} aria-hidden /> Add item
              </Button>
            )}
          </div>
        </div>
        <ItemsTable
          rows={rows}
          onEdit={canWrite ? setEditing : null}
          onDelete={canWrite ? remove : null}
          busy={busy}
          emptyText={manual ? 'No items yet. Add the first one above.' : onlyProblems ? 'No lines with problems.' : 'No items.'}
        />
      </Panel>

      {upload.isPending && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <progress className="w-full" aria-label="Uploading" />
          <span className="text-dim text-[12px]">Uploading {draft.items.length} records…</span>
        </div>
      )}
      {upload.isError && <Alert kind="bad">{uploadProblem(upload.error)}</Alert>}
      {!canWrite && <Alert kind="info">Uploading lists needs the inventory.stock.upload permission.</Alert>}

      {confirmDiscard ? (
        <InlineConfirm
          title="Discard this list?"
          confirmLabel="Discard"
          tone="danger"
          busy={false}
          onConfirm={onDiscard}
          onCancel={() => setConfirmDiscard(false)}
        >
          Nothing has been sent to the server yet. The {draft.items.length} lines on this screen are dropped.
        </InlineConfirm>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {errorRows > 0 && <span className="text-dim text-[12px]">Fix the errors first.</span>}
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>Discard</Button>
          <Button variant="primary" data-action="upload-list" disabled={blocked} aria-busy={busy} onClick={() => upload.mutate()}>
            {busy ? 'Uploading…' : `Upload ${draft.items.length} record${draft.items.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}

      {editItem && (
        <Drawer title="Edit item" subtitle={editItem.rowNo ? `Row ${editItem.rowNo}` : 'Added by hand'} onClose={closeEdit}>
          <div className="h-full overflow-y-auto p-5">
            <ItemForm
              initial={editItem}
              submitLabel="Save changes"
              busy={false}
              takenIds={draft.items.filter((it) => it.key !== editItem.key).map((it) => it.productId)}
              onSubmit={(v) => {
                updateItems((items) => items.map((it) => (it.key === editItem.key ? { ...it, ...v } : it)));
                closeEdit();
              }}
              onCancel={closeEdit}
            />
          </div>
        </Drawer>
      )}

      {adding && (
        <Drawer title="Add item" onClose={closeAdd}>
          <div className="h-full overflow-y-auto p-5">
            <ItemForm
              submitLabel="Add to list"
              busy={false}
              takenIds={ids}
              onSubmit={(v) => {
                add(v);
                closeAdd();
              }}
              onCancel={closeAdd}
            />
          </div>
        </Drawer>
      )}
    </div>
  );
}
