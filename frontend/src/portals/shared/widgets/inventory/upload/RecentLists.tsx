import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { usePortData, useWidgetRuntime } from '../../core/runtime';
import { EmptyState, Panel, StatusBadge } from '../../../ui/atoms';
import { formatMinor } from './model';
import type { StockListPage } from './data';

export interface RecentListsProps {
  /** bump to re-read after an upload or delete */
  refreshKey: number;
  onOpen: (listId: string) => void;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy');
};

/** The ten most recently changed lists, so a saved draft can be reopened, edited or deleted. */
export function RecentLists({ refreshKey, onOpen }: RecentListsProps) {
  const { context } = useWidgetRuntime();
  const lists = usePortData<StockListPage>(
    (p) => p.request<StockListPage>('inventory.upload.lists', { page: '0', size: '10', sort: 'updatedAt,desc' }),
    [context.orgId, refreshKey],
  );

  let body: ReactNode;
  if (lists.state === 'loading') {
    body = (
      <ul className="flex flex-col gap-2" aria-label="Loading your lists">
        {[0, 1, 2].map((n) => <li key={n} className="h-12 animate-pulse rounded-xl bg-raised" />)}
      </ul>
    );
  } else if (lists.state === 'forbidden') {
    body = <EmptyState title="Not allowed here" hint="Viewing inventory lists needs inventory.view." />;
  } else if (lists.state === 'error') {
    body = <EmptyState title="Couldn’t load your lists" hint={lists.problem?.detail} />;
  } else if (lists.state === 'empty' || !lists.data || lists.data.items.length === 0) {
    body = <EmptyState title="No lists yet" hint="Upload a file or add items by hand to start one." />;
  } else {
    body = (
      <ul className="flex flex-col divide-y divide-line">
        {lists.data.items.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-2 text-left hover:bg-raised"
              onClick={() => onOpen(l.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{l.fileName ?? 'List added by hand'}</div>
                <div className="text-dim text-[12px]">
                  {l.itemCount} record{l.itemCount === 1 ? '' : 's'} · updated {when(l.updatedAt)}
                </div>
              </div>
              <span className="shrink-0 text-right text-sm tabular-nums">{formatMinor(l.totalValue, l.currency)}</span>
              <StatusBadge status={l.status} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Panel className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Your recent lists</h3>
      {body}
    </Panel>
  );
}
