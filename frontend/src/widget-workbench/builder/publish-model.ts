/**
 * Server side of the builder: core's layout records + the four-eyes publish approval.
 *   PUT  /v1/ui/layouts/{portal}/draft   save (ui.layout.draft.save)
 *   POST /v1/ui/layouts/{portal}/submit  opens a UI_LAYOUT_PUBLISH approval (maker)
 *   POST /v1/approvals/{id}/approve|reject  a DIFFERENT person decides (checker ≠ maker);
 *        on approve core publishes and signs the portal's delivery bundle.
 * All through the BFF lane (`/api/**`); every mutation carries an Idempotency-Key (api.ts)
 * and is never retried automatically (ui-std §7).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiGet, apiPost, apiPut } from '../../portals/shared/web-core/api';
import type { PortalLayout } from './layout';

export interface LayoutView {
  id: string;
  portal: string;
  status: string;
  layoutJson: string;
  schemaVersion: number;
  makerId: string;
  updatedAt: string;
  versionNum: number | null;
}

export interface ApprovalView {
  id: string;
  tenantId: string;
  operationType: string;
  targetResourceId: string;
  status: string;
  makerId: string;
  checkerId: string | null;
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  /** The submit-time layout snapshot (UI_LAYOUT_PUBLISH rows) — what the checker is approving. */
  payload: string | null;
}

const keys = {
  all: (portal: string) => ['ui', 'layouts', portal] as const,
  draft: (portal: string) => ['ui', 'layouts', portal, 'draft'] as const,
  published: (portal: string) => ['ui', 'layouts', portal, 'published'] as const,
  approvals: (tenantId: string) => ['approvals', tenantId, 'PENDING_CHECKER'] as const,
};

/** 404 = "there is none" for these reads. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function useServerLayouts(portal: string, enabled: boolean) {
  const draft = useQuery({
    queryKey: keys.draft(portal),
    queryFn: () => orNull(apiGet<LayoutView>(`/api/ui/layouts/${encodeURIComponent(portal)}/draft`)),
    enabled,
  });
  const published = useQuery({
    queryKey: keys.published(portal),
    queryFn: () => orNull(apiGet<LayoutView>(`/api/ui/layouts/${encodeURIComponent(portal)}/published`)),
    enabled,
  });
  return { draft, published };
}

/** The pending publish approval for the current server draft, if any. */
export function usePendingPublish(rootTenantId: string | null, draftId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: keys.approvals(rootTenantId ?? ''),
    // Server-side operationType push-down (guide §4A): the publish row must be findable
    // regardless of how many other pending approvals the tenant has.
    queryFn: () =>
      apiGet<ApprovalView[]>(
        `/api/approvals?tenantId=${encodeURIComponent(rootTenantId ?? '')}&operationType=UI_LAYOUT_PUBLISH&status=PENDING_CHECKER&size=100`),
    enabled: enabled && !!rootTenantId,
    // a checker can decide from another session/browser; without polling the maker's pill
    // would say "Waiting for approval" until the next interaction refetch
    refetchInterval: 15_000,
    select: (rows) =>
      rows.find((a) => a.operationType === 'UI_LAYOUT_PUBLISH' && a.targetResourceId === draftId && a.status === 'PENDING_CHECKER') ?? null,
  });
}

/** The newest REJECTED publish approval — the "Changes requested" state (§4.1). */
export function useLastDecision(rootTenantId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['approvals', rootTenantId ?? '', 'UI_LAYOUT_PUBLISH', 'REJECTED', 'last'],
    // Server-side status + operationType push-down; the queue orders by requestedAt desc.
    queryFn: () =>
      apiGet<ApprovalView[]>(
        `/api/approvals?tenantId=${encodeURIComponent(rootTenantId ?? '')}&operationType=UI_LAYOUT_PUBLISH&status=REJECTED&size=1`),
    enabled: enabled && !!rootTenantId,
    select: (rows) => rows[0] ?? null,
  });
}

export function usePublishActions(portal: string, rootTenantId: string | null) {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: keys.all(portal) });
    void qc.invalidateQueries({ queryKey: keys.approvals(rootTenantId ?? '') });
  };
  const base = `/api/ui/layouts/${encodeURIComponent(portal)}`;
  return {
    save: useMutation({
      mutationFn: (layout: PortalLayout) =>
        apiPut<LayoutView>(`${base}/draft`, { layoutJson: JSON.stringify(layout), schemaVersion: 1 }),
      onSettled: settle,
    }),
    submit: useMutation({
      mutationFn: () => apiPost<LayoutView>(`${base}/submit`),
      onSettled: settle,
    }),
    approve: useMutation({
      mutationFn: (a: { id: string; reason: string }) =>
        apiPost<void>(`/api/approvals/${a.id}/approve`, { reason: a.reason || null }),
      onSettled: settle,
    }),
    reject: useMutation({
      mutationFn: (a: { id: string; reason: string }) => apiPost<void>(`/api/approvals/${a.id}/reject`, { reason: a.reason }),
      onSettled: settle,
    }),
  };
}
