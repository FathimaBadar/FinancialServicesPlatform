import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Input } from '../../../ui/atoms';
import { CASE_STATUS_STYLE, RISK_LABEL } from './labels';
import { RISKS } from './model';
import type { CaseStatus, ListQuery, Risk } from './model';

/** Status pills in reviewer order; "In progress" groups the saga's transient states. */
const STATUS_PILLS: { id: string; label: string; statuses: CaseStatus[] }[] = [
  { id: 'review', label: CASE_STATUS_STYLE.PENDING_REVIEW.label, statuses: ['PENDING_REVIEW'] },
  { id: 'info', label: CASE_STATUS_STYLE.REQUEST_INFO.label, statuses: ['REQUEST_INFO'] },
  { id: 'progress', label: 'In progress', statuses: ['TENANT_PENDING', 'SUBMITTED'] },
  { id: 'stalled', label: CASE_STATUS_STYLE.STALLED.label, statuses: ['STALLED'] },
  { id: 'draft', label: CASE_STATUS_STYLE.DRAFT.label, statuses: ['DRAFT'] },
  { id: 'approved', label: CASE_STATUS_STYLE.APPROVED.label, statuses: ['APPROVED'] },
  { id: 'rejected', label: CASE_STATUS_STYLE.REJECTED.label, statuses: ['REJECTED'] },
];

export interface CaseToolbarProps {
  query: ListQuery;
  onChange: (next: Partial<ListQuery>) => void;
  busy: boolean;
}

const pill = (on: boolean) =>
  clsx(
    'rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors',
    on ? 'border-transparent bg-accent text-invert' : 'border-line text-dim hover:border-line-strong',
  );

/**
 * Search (server-side, debounced 300 ms, 2+ characters), status + risk filters (multi-select).
 * Every change goes to the URL; the server answers — nothing is filtered in the browser.
 */
export function CaseToolbar({ query, onChange, busy }: CaseToolbarProps) {
  const [text, setText] = useState(query.q);
  const last = useRef(query.q);

  // URL → box (back/forward, "clear filters")
  useEffect(() => {
    if (query.q !== last.current) {
      last.current = query.q;
      setText(query.q);
    }
  }, [query.q]);

  // box → URL, debounced; a single character is not sent (the server would refuse it)
  useEffect(() => {
    const t = text.trim();
    if (t === last.current.trim() || t.length === 1) return undefined;
    const id = window.setTimeout(() => {
      last.current = t;
      onChange({ q: t, page: 0 });
    }, 300);
    return () => window.clearTimeout(id);
  }, [text, onChange]);

  const toggleStatus = (group: CaseStatus[]) => {
    const on = group.every((s) => query.status.includes(s));
    const next = on ? query.status.filter((s) => !group.includes(s)) : [...new Set([...query.status, ...group])];
    onChange({ status: next, page: 0 });
  };
  const toggleRisk = (r: Risk) =>
    onChange({ risk: query.risk.includes(r) ? query.risk.filter((x) => x !== r) : [...query.risk, r], page: 0 });

  const short = text.trim().length === 1;

  return (
    <div className="mb-4 grid gap-3">
      <label className="relative block">
        <span className="sr-only">Search KYC cases</span>
        <Input
          type="search"
          placeholder="Search name, registration no., TIN or case no."
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={short ? 'kyc-search-hint' : undefined}
          aria-busy={busy}
        />
        {short && (
          <span id="kyc-search-hint" className="text-dim mt-1 block text-[12px]">Type at least 2 characters to search.</span>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={query.status.length === 0}
            onClick={() => onChange({ status: [], page: 0 })}
            className={pill(query.status.length === 0)}
          >
            All
          </button>
          {STATUS_PILLS.map((p) => {
            const on = p.statuses.every((s) => query.status.includes(s));
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleStatus(p.statuses)} className={pill(on)}>
                {p.label}
              </button>
            );
          })}
        </div>
        <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-[var(--color-line)] sm:block" />
        <div role="group" aria-label="Filter by risk" className="flex flex-wrap gap-1.5">
          {RISKS.map((r) => (
            <button key={r} type="button" aria-pressed={query.risk.includes(r)} onClick={() => toggleRisk(r)} className={pill(query.risk.includes(r))}>
              {RISK_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
