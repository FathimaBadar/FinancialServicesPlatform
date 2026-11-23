import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { usePortData, useWidgetRuntime } from '../../core/runtime';
import { Alert, Button, EmptyState, KvPair, Panel, StatusBadge } from '../../../ui/atoms';
import { ApiError } from '../../../web-core/api';
import { Drawer } from '../../kit/Drawer';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { ItemForm } from './ItemForm';
import { ItemsTable } from './ItemsTable';
import type { TableRow } from './ItemsTable';
import { formatMinor, isItemField, minorToText, toMinor, toQuantity } from './model';
import type { Issue, ItemValues } from './model';
import type { NewItemBody, StockItem, StockList, UpdateItemBody } from './data';

export interface SavedListProps {
  listId: string;
  canWrite: boolean;
  onBack: () => void;
  onDeleted: () => void;
}

type Confirm = { kind: 'submit' } | { kind: 'delete-list' } | { kind: 'delete-item'; item: StockItem } | null;

function toRow(it: StockItem, currency: string): TableRow {
  const issues: Issue[] = it.errors.map((e) => ({
    field: isItemField(e.field) ? e.field : 'row',
    severity: 'error',
    message: e.message,
  }));
  return {
    key: it.id, rowNo: null, productId: it.productId, name: it.name, quantity: it.quantity.toLocaleString('en-US'),
    unitPrice: formatMinor(it.unitPrice, currency), totalPrice: formatMinor(it.totalPrice, currency), issues,
  };
}

function toBody(v: ItemValues): NewItemBody | null {
  const quantity = toQuantity(v.quantity);
  const unitPrice = toMinor(v.unitPrice);
  return quantity === null || unitPrice === null ? null : { productId: v.productId, name: v.name, quantity: Number(quantity), unitPrice };
}

function problemText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'STOCK_LIST_VERSION') return 'Someone changed this list after you opened it. It has been reloaded: check it and try again.';
    if (e.code === 'STOCK_LIST_STATE') return 'This list is no longer a draft, so it cannot be changed.';
    if (e.status === 403) return 'You are not allowed to change inventory lists (needs inventory.stock.upload).';
    return e.detail || e.message;
  }
  return 'The request failed. Check your connection, then try again.';
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy, HH:mm');
};

/**
 * Step 3: the list as the server keeps it (status, server-computed totals, server findings).
 * While it is a DRAFT the maker can edit, add and delete lines, delete the whole list, or
 * submit it; a different person approves it in the approvals queue (four-eyes).
 */
export function SavedList({ listId, canWrite, onBack, onDeleted }: SavedListProps) {
  const { port } = useWidgetRuntime();
  const data = usePortData<StockList>((p) => p.request<StockList>('inventory.upload.list.get', { listId }), [listId]);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);

  const done = (text: string) => setNotice({ id: Date.now(), kind: 'ok', text });
  const failed = (e: unknown) => {
    setNotice({ id: Date.now(), kind: 'bad', text: problemText(e) });
    if (e instanceof ApiError && e.code === 'STOCK_LIST_VERSION') data.reload();
  };

  const addItem = useMutation({
    mutationFn: (body: NewItemBody) => port.command<StockList>('inventory.upload.item.add', body, { listId }),
    retry: 0,
    onSuccess: () => { setAdding(false); done('Item added.'); data.reload(); },
    onError: (e) => setFormProblem(problemText(e)),
  });
  const updateItem = useMutation({
    mutationFn: (a: { itemId: string; body: UpdateItemBody }) =>
      port.command<StockList>('inventory.upload.item.update', a.body, { listId, itemId: a.itemId }),
    retry: 0,
    onSuccess: () => { setEditing(null); done('Item saved.'); data.reload(); },
    onError: (e) => {
      setFormProblem(problemText(e));
      if (e instanceof ApiError && e.code === 'STOCK_LIST_VERSION') data.reload();
    },
  });
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => port.command<StockList>('inventory.upload.item.delete', undefined, { listId, itemId }),
    retry: 0,
    onSuccess: () => { setConfirm(null); done('Item deleted.'); data.reload(); },
    onError: (e) => { setConfirm(null); failed(e); },
  });
  const deleteList = useMutation({
    mutationFn: () => port.command<unknown>('inventory.upload.list.delete', undefined, { listId }),
    retry: 0,
    onSuccess: () => onDeleted(),
    onError: (e) => { setConfirm(null); failed(e); },
  });
  const submit = useMutation({
    mutationFn: () => port.command<StockList>('inventory.upload.list.submit', undefined, { listId }),
    retry: 0,
    onSuccess: () => { setConfirm(null); done('Submitted. Another person must approve the list before the stock counts.'); data.reload(); },
    onError: (e) => { setConfirm(null); failed(e); },
  });

  const closeEdit = useCallback(() => { setEditing(null); setFormProblem(null); }, []);
  const closeAdd = useCallback(() => { setAdding(false); setFormProblem(null); }, []);

  if (data.state === 'loading') return <Panel className="p-4"><EmptyState title="Loading the list…" hint="Fetching the items the server saved." /></Panel>;
  if (data.state === 'forbidden') return <Panel className="p-4"><EmptyState title="Not allowed here" hint="Viewing inventory lists needs inventory.view." /></Panel>;
  if (data.state === 'error') {
    return (
      <Panel className="flex flex-col gap-3 p-4">
        <EmptyState title="Couldn’t load the list" hint={data.problem?.detail} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={data.reload}>Try again</Button>
        </div>
      </Panel>
    );
  }
  if (data.state === 'empty' || !data.data) {
    return (
      <Panel className="flex flex-col gap-3 p-4">
        <EmptyState title="This list no longer exists" hint="It may have been deleted." />
        <div className="flex justify-end"><Button variant="ghost" onClick={onBack}>Back to lists</Button></div>
      </Panel>
    );
  }

  const list = data.data;
  const editable = canWrite && list.status === 'DRAFT';
  const flagged = list.items.filter((it) => it.errors.length > 0).length;
  const busy = addItem.isPending || updateItem.isPending || deleteItem.isPending || deleteList.isPending || submit.isPending;
  const othersOf = (id: string | null) => list.items.filter((it) => it.id !== id).map((it) => it.productId);

  return (
    <div className="flex flex-col gap-4">
      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onBack} disabled={busy}>
            <ArrowLeft size={14} aria-hidden /> All lists
          </Button>
          <StatusBadge status={list.status} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <KvPair label={list.source === 'UPLOAD' ? 'File' : 'Source'}>{list.source === 'UPLOAD' ? list.fileName ?? '—' : 'Added by hand'}</KvPair>
          <KvPair label="Records">{list.itemCount}</KvPair>
          <KvPair label="Total value">
            <span className="tabular-nums">{formatMinor(list.totalValue, list.currency)}</span>
          </KvPair>
          <KvPair label="Server findings">{flagged}</KvPair>
          <KvPair label="Last change">{when(list.updatedAt)}</KvPair>
        </div>
      </Panel>

      {list.status === 'DRAFT' && flagged > 0 && (
        <Alert kind="bad">The server found problems in {flagged === 1 ? '1 item' : `${flagged} items`}. Fix them before submitting.</Alert>
      )}
      {list.status === 'DRAFT' && flagged === 0 && (
        <Alert kind="info">Saved as a draft. Check the details, then confirm and submit it for approval.</Alert>
      )}
      {list.status === 'PENDING_CHECKER' && (
        <Alert kind="warn">Waiting for approval: another person must approve this list. It cannot be changed while it waits.</Alert>
      )}
      {list.status === 'APPROVED' && <Alert kind="ok">Approved. The stock on this list counts.</Alert>}
      {list.status === 'REJECTED' && <Alert kind="bad">Rejected by the approver. Upload a corrected list.</Alert>}
      {!canWrite && list.status === 'DRAFT' && <Alert kind="info">Changing this list needs the inventory.stock.upload permission.</Alert>}

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Items</h3>
          {editable && (
            <Button variant="ghost" data-action="add-item" disabled={busy} onClick={() => { setFormProblem(null); setAdding(true); }}>
              <Plus size={14} aria-hidden /> Add item
            </Button>
          )}
        </div>
        <ItemsTable
          rows={list.items.map((it) => toRow(it, list.currency))}
          onEdit={editable ? (key) => { setFormProblem(null); setEditing(list.items.find((it) => it.id === key) ?? null); } : null}
          onDelete={editable ? (key) => { const item = list.items.find((it) => it.id === key); if (item) setConfirm({ kind: 'delete-item', item }); } : null}
          busy={busy}
          emptyText="This list has no items. Add one, or delete the list."
        />
      </Panel>

      {confirm?.kind === 'delete-item' && (
        <InlineConfirm
          title={`Delete ${confirm.item.productId}?`}
          confirmLabel="Delete item"
          tone="danger"
          busy={deleteItem.isPending}
          onConfirm={() => deleteItem.mutate(confirm.item.id)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.item.name} ({confirm.item.quantity.toLocaleString('en-US')} units) is removed from this draft.
        </InlineConfirm>
      )}
      {confirm?.kind === 'delete-list' && (
        <InlineConfirm
          title="Delete this list?"
          confirmLabel="Delete list"
          tone="danger"
          busy={deleteList.isPending}
          onConfirm={() => deleteList.mutate()}
          onCancel={() => setConfirm(null)}
        >
          The draft and its {list.itemCount} items are deleted. This cannot be undone.
        </InlineConfirm>
      )}
      {confirm?.kind === 'submit' && (
        <InlineConfirm
          title="Confirm and submit for approval?"
          confirmLabel="Submit for approval"
          tone="primary"
          busy={submit.isPending}
          onConfirm={() => submit.mutate()}
          onCancel={() => setConfirm(null)}
        >
          {list.itemCount} items worth {formatMinor(list.totalValue, list.currency)} go to a second person for approval. You cannot change the list while it waits.
        </InlineConfirm>
      )}

      {editable && confirm === null && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {flagged > 0 && <span className="text-dim text-[12px]">Fix the flagged items first.</span>}
          <Button variant="danger" data-action="delete-list" disabled={busy} onClick={() => setConfirm({ kind: 'delete-list' })}>Delete list</Button>
          <Button
            variant="primary"
            data-action="submit-list"
            disabled={busy || flagged > 0 || list.itemCount === 0}
            onClick={() => setConfirm({ kind: 'submit' })}
          >
            Confirm and submit
          </Button>
        </div>
      )}

      {editing && (
        <Drawer title="Edit item" subtitle={editing.productId} onClose={closeEdit}>
          <div className="h-full overflow-y-auto p-5">
            <ItemForm
              initial={{ productId: editing.productId, name: editing.name, quantity: String(editing.quantity), unitPrice: minorToText(editing.unitPrice), totalPrice: '' }}
              submitLabel="Save changes"
              busy={updateItem.isPending}
              problem={formProblem}
              takenIds={othersOf(editing.id)}
              onSubmit={(v) => {
                const body = toBody(v);
                if (body) updateItem.mutate({ itemId: editing.id, body: { ...body, version: list.version } });
              }}
              onCancel={closeEdit}
            />
          </div>
        </Drawer>
      )}
      {adding && (
        <Drawer title="Add item" subtitle={list.fileName ?? 'Manual list'} onClose={closeAdd}>
          <div className="h-full overflow-y-auto p-5">
            <ItemForm
              submitLabel="Add to list"
              busy={addItem.isPending}
              problem={formProblem}
              takenIds={othersOf(null)}
              onSubmit={(v) => {
                const body = toBody(v);
                if (body) addItem.mutate(body);
              }}
              onCancel={closeAdd}
            />
          </div>
        </Drawer>
      )}
    </div>
  );
}
