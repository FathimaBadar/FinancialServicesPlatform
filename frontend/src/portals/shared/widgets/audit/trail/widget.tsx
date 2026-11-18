import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useWidgetRuntime, usePortData } from '../../core/runtime';
import { Button, Chip, EmptyState, PageHeader, Panel } from '../../../ui/atoms';
import { PAGE_SIZE, shortId } from './data';
import type { AuditPage } from './data';

function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

export function AuditTrail() {
  const { port, context } = useWidgetRuntime();
  const [page, setPage] = useState(0);
  const audit = usePortData<AuditPage>(
    () => port.request('audit.trail.page', { page: String(page), size: String(PAGE_SIZE) }),
    [context.orgId, page],
  );

  if (audit.state === 'loading') {
    return (
      <Panel className="p-4">
        <PageHeader title="Audit trail" />
        <div className="grid gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-8 rounded-lg bg-raised" />
          ))}
        </div>
      </Panel>
    );
  }
  if (audit.state === 'forbidden') {
    return (
      <Panel className="p-4">
        <EmptyState title="Not allowed here" hint="Reading the audit trail needs the audit.view permission." />
      </Panel>
    );
  }
  if (audit.state === 'error') {
    return (
      <Panel className="p-4">
        <EmptyState title="Couldn’t load the audit trail" hint={audit.problem?.detail} />
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" onClick={audit.reload}>Try again</Button>
        </div>
      </Panel>
    );
  }
  const rows = audit.data?.content ?? [];
  if (audit.state === 'empty' || rows.length === 0) {
    return (
      <Panel className="p-4">
        <EmptyState title="No audit entries yet" hint="Actions in this organization are recorded here." />
      </Panel>
    );
  }

  const total = audit.data?.totalElements ?? rows.length;
  const pages = Math.max(1, audit.data?.totalPages ?? 1);

  return (
    <Panel className="p-4">
      <PageHeader title="Audit trail" subtitle={`${total} entries · newest first`} />
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-dim text-left text-[11px] uppercase tracking-[.12em]">
              <th className="border-b border-line py-2 pr-3 font-bold">When</th>
              <th className="border-b border-line py-2 pr-3 font-bold">Action</th>
              <th className="border-b border-line py-2 pr-3 font-bold">Record</th>
              <th className="border-b border-line py-2 pr-3 font-bold">By</th>
              <th className="border-b border-line py-2 font-bold">Checker</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap border-b border-line py-2 pr-3 tabular-nums">{when(r.timestampUtc)}</td>
                <td className="border-b border-line py-2 pr-3">
                  <Chip tone={r.actionType.includes('REJECT') || r.actionType.includes('DENIED') ? 'bad' : 'neutral'}>{r.actionType}</Chip>
                </td>
                <td className="border-b border-line py-2 pr-3">
                  <div className="text-[12px] font-semibold">{r.resourceType ?? '—'}</div>
                  <div className="text-dim mono text-[11px]">{shortId(r.resourceId)}</div>
                </td>
                <td className="mono border-b border-line py-2 pr-3 text-[12px]">{shortId(r.actorId)}</td>
                <td className="mono border-b border-line py-2 text-[12px]">{shortId(r.checkerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-dim text-[12px]">Page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Previous</Button>
          <Button variant="ghost" disabled={audit.data?.last ?? page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next ›</Button>
        </div>
      </div>
    </Panel>
  );
}
