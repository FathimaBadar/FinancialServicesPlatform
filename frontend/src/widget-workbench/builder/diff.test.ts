import { describe, expect, it } from 'vitest';
import { diffEmpty, diffLayouts, diffSummary } from './diff';
import type { PortalLayout } from './layout';

function layout(menus: Array<{ id: string; label: string; pages: Array<{ id: string; label: string; widgets: string[] }> }>): PortalLayout {
  return {
    portal: 'admin',
    menus: menus.map((m) => ({
      id: m.id, label: m.label,
      screens: m.pages.map((s) => ({
        id: s.id, label: s.label,
        placedWidgets: s.widgets.map((w) => ({ id: `i-${w}`, widgetId: w, span: {}, config: {} })),
      })),
    })),
  };
}

const base = layout([
  { id: 'main', label: 'Main', pages: [{ id: 'overview', label: 'Overview', widgets: ['kyc.status', 'kyc.tasks'] }, { id: 'reports', label: 'Reports', widgets: [] }] },
  { id: 'tenants', label: 'Tenants', pages: [{ id: 'list', label: 'Tenants', widgets: ['tenant.summary'] }] },
]);

const clone = (l: PortalLayout): PortalLayout => JSON.parse(JSON.stringify(l)) as PortalLayout;

describe('diffLayouts', () => {
  it('same layout → empty diff', () => {
    const d = diffLayouts(base, clone(base));
    expect(diffEmpty(d)).toBe(true);
    expect(diffSummary(d)).toContain('only settings');
  });

  it('renames a page → counted as rename', () => {
    const a = clone(base);
    a.menus[0]!.screens[0]!.label = 'Dashboard';
    const d = diffLayouts(base, a);
    expect(d.pagesAdded).toBe(0);
    expect(d.pagesRemoved).toBe(0);
    expect(d.renames).toBe(1);
    expect(diffSummary(d)).toBe('1 renamed');
  });

  it('no baseline counts everything as added', () => {
    const d = diffLayouts(null, base);
    expect(d.menusAdded).toBe(2);
    expect(d.pagesAdded).toBe(3);
    expect(d.widgetsAdded).toBe(3);
    expect(diffSummary(d)).toContain('+2 menus');
  });

  it('removing a page shows as removed', () => {
    const a = clone(base);
    a.menus[0]!.screens.splice(1, 1);
    const d = diffLayouts(base, a);
    expect(d.pagesRemoved).toBe(1);
    expect(diffSummary(d)).toContain('−1 page');
  });

  it('reordering pages counts as moved', () => {
    const a = clone(base);
    a.menus[0]!.screens.reverse();
    const d = diffLayouts(base, a);
    expect(d.moved).toBe(2);
  });

  it('adding a widget counts as added', () => {
    const a = clone(base);
    a.menus[0]!.screens[0]!.placedWidgets.push({ id: 'i-new', widgetId: 'rbac.summary', span: {}, config: {} });
    const d = diffLayouts(base, a);
    expect(d.widgetsAdded).toBe(1);
    expect(d.widgetsRemoved).toBe(0);
  });
});
