import { Fragment, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Chip } from '../../../ui/atoms';
import type { Issue } from './model';

/** One display-ready line: amounts are already formatted text. */
export interface TableRow {
  key: string;
  rowNo: number | null;
  productId: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  issues: readonly Issue[];
}

export interface ItemsTableProps {
  rows: readonly TableRow[];
  /** null = read-only (no edit / delete buttons) */
  onEdit: ((key: string) => void) | null;
  onDelete: ((key: string) => void) | null;
  busy: boolean;
  emptyText: string;
}

const STEP = 200;

function StatusChip({ issues }: { issues: readonly Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  if (errors > 0) return <Chip tone="bad">{errors === 1 ? '1 error' : `${errors} errors`}</Chip>;
  if (issues.length > 0) return <Chip tone="warn">Check</Chip>;
  return <Chip tone="ok">OK</Chip>;
}

/**
 * The detailed view of a list: every line with its findings underneath. Wide tables scroll
 * inside their own box; long lists render in steps of 200 lines to keep the page fast.
 */
export function ItemsTable({ rows, onEdit, onDelete, busy, emptyText }: ItemsTableProps) {
  const [limit, setLimit] = useState(STEP);
  const editable = onEdit !== null || onDelete !== null;
  if (rows.length === 0) return <p className="text-dim py-6 text-center text-sm">{emptyText}</p>;
  const shown = rows.slice(0, limit);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-raised">
            <tr className="text-dim text-left text-[11px] uppercase tracking-wide">
              <th scope="col" className="px-3 py-2 font-semibold">Row</th>
              <th scope="col" className="px-3 py-2 font-semibold">Product id</th>
              <th scope="col" className="px-3 py-2 font-semibold">Name</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Quantity</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Unit price</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Total price</th>
              <th scope="col" className="px-3 py-2 font-semibold">Check</th>
              {editable && <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <Fragment key={r.key}>
                <tr className={clsx(r.issues.some((i) => i.severity === 'error') && 'bg-raised')}>
                  <td className="text-dim mono px-3 py-2 text-[12px]">{r.rowNo ?? '—'}</td>
                  <td className="mono px-3 py-2 text-[12px]">{r.productId || '—'}</td>
                  <td className="max-w-[260px] truncate px-3 py-2">{r.name || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.quantity || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.unitPrice || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.totalPrice || '—'}</td>
                  <td className="px-3 py-2"><StatusChip issues={r.issues} /></td>
                  {editable && (
                    <td className="whitespace-nowrap px-3 py-1 text-right">
                      {onEdit && (
                        <Button variant="ghost" data-action="edit-item" disabled={busy} aria-label={`Edit ${r.productId || 'line'}`} onClick={() => onEdit(r.key)}>
                          <Pencil size={14} aria-hidden />
                        </Button>
                      )}
                      {onDelete && (
                        <Button variant="ghost" data-action="delete-item" disabled={busy} aria-label={`Delete ${r.productId || 'line'}`} onClick={() => onDelete(r.key)}>
                          <Trash2 size={14} aria-hidden />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                {r.issues.length > 0 && (
                  <tr>
                    <td colSpan={editable ? 8 : 7} className="px-3 pb-2 pt-0">
                      <ul className="flex flex-col gap-0.5 text-[12px]">
                        {r.issues.map((i, n) => (
                          <li key={n} className={i.severity === 'error' ? 'text-status-danger' : 'text-status-warning'}>
                            {i.message}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-dim">Showing {limit} of {rows.length} lines</span>
          <Button variant="ghost" onClick={() => setLimit((l) => l + STEP)}>Show {Math.min(STEP, rows.length - limit)} more</Button>
        </div>
      )}
    </div>
  );
}
