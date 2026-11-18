import { Alert, EmptyState } from '../../../ui/atoms';
import { absoluteTime, relativeTime, toProblem, useCaseHistory } from './model';
import type { CaseEvent } from './model';
import type { WidgetDataPortLike } from '../../core/manifest';

const LABEL: Record<string, string> = {
  CREATED: 'Application started',
  TENANT_CREATED: 'Organization created',
  SCREENED: 'Screening completed',
  SUBMITTED: 'Submitted for review',
  UPDATED: 'Application edited',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REQUEST_INFO: 'More information requested',
  STALLED: 'Onboarding stalled',
};

/** payload is JSON text from the plugin; read the human bits defensively. */
function details(e: CaseEvent): { actor: string | null; note: string | null } {
  if (!e.payload) return { actor: null, note: null };
  try {
    const p = JSON.parse(e.payload) as Record<string, unknown>;
    const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
    return { actor: s('actorName'), note: s('note') ?? s('reason') };
  } catch {
    return { actor: null, note: null };
  }
}

export interface CaseHistoryProps {
  port: WidgetDataPortLike;
  caseId: string;
}

/** The case's domain history, newest first (plugin kyc_case_events). */
export function CaseHistory({ port, caseId }: CaseHistoryProps) {
  const h = useCaseHistory(port, caseId, true);
  if (h.isPending) {
    return (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading history">
        {[0, 1, 2].map((i) => <span key={i} className="h-10 animate-pulse rounded-lg bg-raised" />)}
      </div>
    );
  }
  if (h.error) return <Alert kind="bad">Couldn’t load the history — {toProblem(h.error).message}</Alert>;
  const items = [...(h.data?.events ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!items.length) return <EmptyState title="No history yet" />;
  return (
    <ol className="grid gap-0">
      {items.map((e, i) => {
        const d = details(e);
        return (
          <li key={e.id} className="relative grid grid-cols-[16px_1fr] gap-3 pb-4">
            <span aria-hidden="true" className="relative flex justify-center">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
              {i < items.length - 1 && <span className="absolute bottom-[-16px] top-4 w-px bg-[var(--color-line)]" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-semibold">{LABEL[e.eventType] ?? e.eventType.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="text-dim text-[12px] tabular-nums" title={absoluteTime(e.createdAt)}>{relativeTime(e.createdAt)}</span>
              </div>
              {d.actor && <div className="text-dim text-[12px]">{d.actor}</div>}
              {d.note && <p className="mt-1 text-[13px] leading-relaxed">{d.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
