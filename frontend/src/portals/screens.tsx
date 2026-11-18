/**
 * Screen registry — THE map from menu point → coded screen (the widget
 * compositions arrive with layouts; each screen here is a thin mount point
 * that will host the same widgets the layout renderer places).
 */
import type { CSSProperties } from 'react';
import type { MenuItem, PortalId } from './shared/web-core/menu';
import { useSession } from './shared/web-core/session-core';
import { PageHeader, Panel, Chip, KvPair, StatusBadge, EmptyState } from './shared/ui/atoms';
import { WidgetHost } from './shared/widgets/core/host';
import { getWidget } from './shared/widgets/registry';

export interface ScreenProps {
  portalId: PortalId;
  link: string;
  widgets: MenuItem['widgets'];
  label: string;
}

/* ---------------------------------------------------------------- overview */
export function OverviewScreen() {
  const { user, tenant, permissions } = useSession();
  return (
    <>
      <PageHeader title="Overview" subtitle={tenant?.legalName ?? user?.tenantName ?? ' '} />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-4">
          <div className="fsp-eyebrow mb-2">Your rights</div>
          <div className="text-3xl font-extrabold" style={{ color: 'var(--portal-accent)' }}>
            {permissions.length}
          </div>
          <div className="text-dim text-xs">permission keys held</div>
        </Panel>
        <Panel className="p-4">
          <div className="fsp-eyebrow mb-2">Organization</div>
          {tenant ? (
            <div className="flex flex-col gap-2">
              <KvPair label="Legal name">{tenant.legalName ?? '—'}</KvPair>
              <div className="flex gap-2">
                <Chip tone="accent">{tenant.subType ?? tenant.type}</Chip>
                <StatusBadge status={tenant.status} />
              </div>
            </div>
          ) : (
            <div className="text-dim text-sm">Platform root organization</div>
          )}
        </Panel>
        <Panel className="p-4">
          <div className="fsp-eyebrow mb-2">Signed in as</div>
          <KvPair label="Name">{user?.fullName}</KvPair>
          <div className="text-dim mono mt-1">{user?.username}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(user?.roles ?? []).map((r) => <Chip key={r} tone="info">{r}</Chip>)}
          </div>
        </Panel>
      </div>
      <p className="text-dim mt-6 text-xs">
        Widget tiles land with the layout renderer (plans/ui-portals-plan.md §3.3 step 4).
      </p>
    </>
  );
}

/* ------------------------------------------------------- widget placeholder */
export function WidgetScreen({ label, widgets }: ScreenProps & { label: string }) {
  return (
    <>
      <PageHeader title={label} subtitle="Composed from the widgets registry — the route and its permissions are already governed." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {widgets.map((id) => {
          const def = getWidget(id);
          if (!def) {
            return (
              <Panel className="p-4 md:col-span-12" key={id}>
                <EmptyState
                  title={`Widget "${id}" not registered yet`}
                  hint="Built next per §6.3 of the portals plan — manifest → fixtures → component → registry check."
                />
              </Panel>
            );
          }
          // honour the manifest's declared lg span (12-col grid); single column below md
          const lg = def.size.lg;
          const cols = lg.kind === 'span' ? lg.default : 12;
          return (
            <div key={id} className="min-w-0 md:[grid-column:span_var(--w)_/_span_var(--w)]" style={{ '--w': cols } as CSSProperties}>
              <WidgetHost def={def} />
            </div>
          );
        })}
      </div>
    </>
  );
}
