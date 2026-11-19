/**
 * onboard.list component — the integrated onboarding screen.
 * Shows onboarded organizations with their KYC standing:
 *   - paginated, server-side searchable + sortable org directory
 *   - each org shows its KYC case status (case no., status, risk, submitted)
 *   - "New onboarding" opens the KYC create form (/kyc/reviews?case=new)
 *   - clicking an org opens its KYC case (/kyc/reviews?case=<caseId>)
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useWidgetRuntime } from '../../core/runtime';
import { Button, Chip, EmptyState, Input, PageHeader, Panel, StatusBadge } from '../../../ui/atoms';
import { StatePanel } from '../../kit/StatePanel';
import { isForbidden, toProblem } from '../../kit/problem';
import {
  useOrgPage, useKycCasePage, joinOrgsToKyc, DEFAULT_QUERY, PAGE_SIZES,
  type OrgListQuery, type OrgWithKyc, type KycListQuery, KYC_DEFAULT_QUERY,
} from './model';

const SORT_KEYS = ['legalName', 'status', 'createdAt', 'subType'] as const;

function parseSort(s: string): { key: string; dir: 'asc' | 'desc' } {
  const [k, d = 'asc'] = s.split(',') as [string, string];
  return { key: SORT_KEYS.includes(k as any) ? k : DEFAULT_QUERY.sort, dir: d === 'desc' ? 'desc' : 'asc' };
}

interface OrgTableProps {
  rows: OrgWithKyc[];
  query: OrgListQuery;
  onSort: (key: string) => void;
  onOpen: (row: OrgWithKyc) => void;
}

function OrgTable({ rows, query, onSort, onOpen }: OrgTableProps) {
  const { key: sortKey, dir } = parseSort(query.sort);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-dim text-left text-[10.5px] font-bold uppercase tracking-[.14em]">
            {[
              { label: 'Organization', key: 'legalName' },
              { label: 'Type', key: 'subType' },
              { label: 'Status', key: 'status' },
              { label: 'KYC case', key: 'kyc' },
              { label: 'KYC risk', key: 'risk' },
              { label: 'Onboarded', key: 'createdAt' },
            ].map((c) => {
              const active = sortKey === c.key;
              return (
                <th key={c.label} scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap border-b border-line px-3 py-2 font-bold">
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={clsx(
                      'inline-flex items-center gap-1 uppercase tracking-[.14em] hover:text-[var(--color-text)]',
                      active && 'text-[var(--color-text)]',
                    )}
                  >
                    {c.label}
                    <span aria-hidden="true" className={clsx('text-[10px]', !active && 'opacity-30')}>
                      {active && dir === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r); }
              }}
              className="cursor-pointer outline-none transition-colors hover:bg-raised focus-visible:bg-raised"
            >
              <td className="max-w-[320px] border-b border-line px-3 py-2.5">
                <div className="truncate text-sm font-semibold">{r.legalName ?? r.id}</div>
                <div className="text-dim block truncate text-[12px] mono">{r.id.slice(0, 8)}…</div>
              </td>
              <td className="whitespace-nowrap border-b border-line px-3 py-2.5"><Chip tone="accent">{r.subType ?? r.type ?? '—'}</Chip></td>
              <td className="border-b border-line px-3 py-2.5"><StatusBadge status={r.status} /></td>
              <td className="border-b border-line px-3 py-2.5">
                {r.hasKyc ? (
                  <>
                    <div className="text-sm font-semibold">{r.kycCaseNo}</div>
                    <div className="text-[11px] text-dim">{r.kycCaseStatus}</div>
                  </>
                ) : (
                  <span className="text-dim text-[11px]">No KYC case</span>
                )}
              </td>
              <td className="border-b border-line px-3 py-2.5">
                {r.kycRiskRating ? <Chip tone={r.kycRiskRating === 'HIGH' ? 'warn' : 'neutral'}>{r.kycRiskRating}</Chip> : '—'}
              </td>
              <td className="text-dim whitespace-nowrap border-b border-line px-3 py-2.5 text-right text-xs tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrgPager({ page, size, shown, hasNext, busy, onPage, onSize }: {
  page: number; size: number; shown: number; hasNext: boolean; busy: boolean;
  onPage: (p: number) => void; onSize: (s: number) => void;
}) {
  const from = page * size + 1;
  const to = page * size + shown;
  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px]">
      <span className="text-dim tabular-nums" aria-live="polite">
        Page {page + 1}
        {shown > 0 && ` · rows ${from}–${to}`}
      </span>
      <span className="flex-1" />
      <label className="text-dim flex items-center gap-2">
        Rows per page
        <select className="fsp-field w-auto cursor-pointer py-1" value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <Button variant="ghost" disabled={page === 0 || busy} onClick={() => onPage(page - 1)}>‹ Previous</Button>
      <Button variant="ghost" disabled={!hasNext || busy} onClick={() => onPage(page + 1)}>Next ›</Button>
    </nav>
  );
}

export function OnboardList() {
  const { port, context } = useWidgetRuntime();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = useMemo((): OrgListQuery => {
    const [sk, sd] = (params.get('osort') ?? '').split(',');
    const opage = Number(params.get('opage'));
    const osize = Number(params.get('osize'));
    return {
      q: params.get('oq') ?? '',
      sort: sk ? sk : DEFAULT_QUERY.sort,
      dir: sd === 'asc' || sd === 'desc' ? sd : DEFAULT_QUERY.dir,
      page: Number.isInteger(opage) && opage >= 0 ? opage : 0,
      size: PAGE_SIZES.includes(osize) ? osize : DEFAULT_QUERY.size,
    };
  }, [params]);

  const [searchText, setSearchText] = useState(query.q);

  const kycQuery: KycListQuery = useMemo(() => ({
    ...KYC_DEFAULT_QUERY,
    q: '', // we match by tenant, not search
  }), []);

  const patch = useCallback((next: Record<string, string | null>) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') n.delete(k);
        else n.set(k, v);
      }
      return n;
    });
  }, [setParams]);

  const setQuery = useCallback((next: Partial<OrgListQuery>) => {
    const m = { ...query, ...next };
    patch({
      oq: m.q.trim().length >= 2 ? m.q : null,
      osort: m.sort === DEFAULT_QUERY.sort && m.dir === DEFAULT_QUERY.dir ? null : `${m.sort},${m.dir}`,
      osize: m.size === DEFAULT_QUERY.size ? null : String(m.size),
      opage: m.page ? String(m.page) : null,
    });
  }, [patch, query]);

  const orgPage = useOrgPage(port, query, context.orgId);
  const kycPage = useKycCasePage(port, kycQuery, context.orgId);

  if (orgPage.isPending || kycPage.isPending) return <StatePanel kind="loading" title="Loading organizations" />;
  if (orgPage.isError) {
    if (isForbidden(orgPage.error)) {
      return <StatePanel kind="forbidden" title="Not allowed here" hint="Onboarding needs org.create at the platform root." />;
    }
    return <StatePanel kind="error" title="Couldn’t load organizations" hint={toProblem(orgPage.error).message} onRetry={() => void orgPage.refetch()} />;
  }
  if (kycPage.isError) {
    // KYC cases may not be enabled yet — still show orgs without KYC info
    console.warn('KYC cases unavailable:', toProblem(kycPage.error).message);
  }

  const orgs = orgPage.data?.items ?? [];
  const kycCases = kycPage.data?.items ?? [];
  const rows = joinOrgsToKyc(orgs, kycCases);
  const shown = rows.length;
  const hasNext = orgPage.data?.hasNext ?? false;

  const onSort = useCallback((key: string) => {
    const cur = parseSort(query.sort);
    const nextDir = cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc';
    setQuery({ sort: `${key},${nextDir}`, page: 0 });
  }, [query.sort, setQuery]);

  const onOpen = useCallback((r: OrgWithKyc) => {
    if (r.hasKyc && r.kycCaseId) {
      navigate(`/kyc/reviews?case=${r.kycCaseId}`);
    } else {
      navigate('/kyc/reviews?case=new');
    }
  }, [navigate]);

  const onNewOnboarding = useCallback(() => {
    navigate('/kyc/reviews?case=new');
  }, [navigate]);

  // Always-visible header + search, even when there are 0 orgs
  const header = (
    <PageHeader
      title="Onboarding"
      subtitle={`Organizations · ${rows.length} onboarded`}
      actions={
        <Button variant="primary" data-action="org.onboard" onClick={onNewOnboarding}>
          New onboarding
        </Button>
      }
    />
  );

  const searchBox = (
    <div className="mb-4 grid gap-3">
      <label className="relative block">
        <span className="sr-only">Search organizations</span>
        <Input
          type="search"
          placeholder="Search by legal name"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t.length >= 2) setQuery({ q: t, page: 0 });
            else if (t.length === 0 && query.q.length > 0) setQuery({ q: '', page: 0 });
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-dim">Sort:</span>
        {SORT_KEYS.map((k) => {
          const cur = parseSort(query.sort);
          const active = cur.key === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => onSort(k)}
              className={clsx(
                'rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                active ? 'border-transparent bg-accent text-invert' : 'border-line text-dim hover:border-line-strong',
              )}
            >
              {k} {active && (cur.dir === 'asc' ? '▲' : '▼')}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (rows.length === 0 && query.q.trim().length >= 2) {
    return (
      <Panel className="p-4">
        {header}
        {searchBox}
        <EmptyState title="No organizations match" hint="Try a different search." />
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel className="p-4">
        {header}
        {searchBox}
        <EmptyState title="No organizations yet" hint="Start with “New onboarding” to create one." />
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      {header}
      {searchBox}
      <div aria-busy={orgPage.isFetching} className={orgPage.isFetching && !orgPage.isPending ? 'opacity-70 transition-opacity' : undefined}>
        <OrgTable rows={rows} query={query} onSort={onSort} onOpen={onOpen} />
      </div>
      <OrgPager
        page={query.page}
        size={query.size}
        shown={shown}
        hasNext={hasNext}
        busy={orgPage.isFetching}
        onPage={(p) => setQuery({ page: p })}
        onSize={(s) => setQuery({ size: s, page: 0 })}
      />
      <p className="text-dim mt-3 text-xs">
        Click an organization to view its KYC case · “New onboarding” creates a new case
      </p>
    </Panel>
  );
}
