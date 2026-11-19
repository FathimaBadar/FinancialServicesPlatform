import { describe, expect, it } from 'vitest';
import { menuFor } from '../../../web-core/menu';
import { cellsOf } from '../../core/manifest';
import { getWidget } from '../../registry';
import { UNGROUPED, activeKey, buildMatrix, checkState, isActive, sharedGateLinks, toggleActive, toggleAll } from './model';
import type { PermissionDef } from './model';

/** The live core catalogue (permissions table) — key, component. */
const LIVE: Array<[string, string]> = [
  ['audit.view', 'audit'], ['idp.manage', 'identity'], ['je.approve', 'journal'], ['je.create', 'journal'], ['je.view', 'journal'],
  ['bank.account.approve', 'kyc'], ['bank.account.create', 'kyc'], ['kyc.approve', 'kyc'], ['kyc.reject', 'kyc'], ['kyc.review', 'kyc'],
  ['screening.run', 'kyc'], ['bank.account.view', 'ledger'], ['gl.account.approve', 'ledger'], ['gl.account.create', 'ledger'],
  ['gl.account.view', 'ledger'], ['period.close', 'ledger'], ['period.open', 'ledger'], ['notification.view', 'notify'],
  ['org.activate', 'org'], ['org.approve_child', 'org'], ['org.create', 'org'], ['org.onboard_child', 'org'],
  ['platform.bootstrap', 'platform'], ['plugin.install', 'platform'], ['plugin.manage', 'platform'], ['plugin.register', 'platform'],
  ['role.manage', 'rbac'], ['role.view', 'rbac'], ['user.manage', 'rbac'], ['tenant.act_as', 'tenant'],
  ['ui.layout.manage', 'ui'], ['ui.widget.register', 'ui'],
];
const defs: PermissionDef[] = LIVE.map(([key, component]) => ({ key, component, title: key, risk: 'READ' }));
const widgetKeys = (id: string): string[] => {
  const d = getWidget(id);
  return d ? cellsOf(d) : [];
};

describe('rbac.matrix · rows are exactly the menu', () => {
  it.each(['platform', 'org'] as const)('%s: one group per sidebar group, one row per link, in menu order', (portal) => {
    const menu = menuFor(portal);
    const m = buildMatrix(menu, defs, widgetKeys);
    expect(m.groups.flatMap((g) => g.rows.map((r) => r.link))).toEqual(
      // grouped in first-appearance order, links in menu order within each group
      [...new Set(menu.map((i) => i.group ?? UNGROUPED))].flatMap((g) => menu.filter((i) => (i.group ?? UNGROUPED) === g).map((i) => i.link)),
    );
    expect(m.groups.flatMap((g) => g.rows.map((r) => r.label)).sort()).toEqual(menu.map((i) => i.label).sort());
  });
  it('admin console matrix reads like its sidebar', () => {
    const m = buildMatrix(menuFor('platform'), defs, widgetKeys);
    expect(m.groups.map((g) => [g.label, g.rows.map((r) => r.label)])).toEqual([
      ['User Management', ['Back Office User', 'Reset Password', 'Customer', 'Organization']],
      ['Onboarding', ['Onboarding']],
      ['Role Management', ['Component', 'Sub Component', 'Branch', 'Department', 'Role', 'Approvals']],
    ]);
  });
  it('a row covers its gate plus its widgets’ keys, each in one verb cell; unknown keys are not invented', () => {
    const m = buildMatrix(menuFor('platform'), defs, widgetKeys);
    const role = m.groups.flatMap((g) => g.rows).find((r) => r.label === 'Role')!;
    expect(role.gate).toEqual(['role.view', 'role.manage']);
    expect(role.cells.view.map((c) => c.key)).toEqual(['role.view']);
    expect(role.cells.update.map((c) => c.key)).toEqual(['role.manage']);
    const approvals = m.groups.flatMap((g) => g.rows).find((r) => r.label === 'Approvals')!;
    expect(approvals.cells.authorize.map((c) => c.key)).toEqual(expect.arrayContaining(['kyc.approve', 'kyc.reject', 'je.approve']));
    const all = new Set(LIVE.map(([k]) => k));
    for (const r of m.groups.flatMap((g) => g.rows)) for (const k of r.keys) expect(all.has(k)).toBe(true);
  });
});

describe('rbac.matrix · Active box (one more per link)', () => {
  const m = buildMatrix(menuFor('platform'), defs, widgetKeys);
  const row = (label: string) => m.groups.flatMap((g) => g.rows).find((r) => r.label === label)!;
  const everything = new Set(LIVE.map(([k]) => k));

  it('is on when the role holds any key of the link’s gate (the link shows)', () => {
    expect(isActive(row('Role').gate, new Set(['role.view']))).toBe(true);
    expect(isActive(row('Role').gate, new Set(['user.manage']))).toBe(false);
  });
  it('ticking grants the least-privilege gate key (view before manage)', () => {
    expect(activeKey(row('Role').gate, everything)).toBe('role.view');
    expect([...toggleActive(row('Role').gate, new Set(), everything)]).toEqual(['role.view']);
  });
  it('unticking revokes the whole gate so the link no longer shows', () => {
    const next = toggleActive(row('Role').gate, new Set(['role.view', 'role.manage', 'user.manage']), everything);
    expect([...next]).toEqual(['user.manage']);
  });
  it('never grants or revokes a key the editor does not hold', () => {
    expect([...toggleActive(row('Role').gate, new Set(), new Set(['user.manage']))]).toEqual([]);
    expect([...toggleActive(row('Role').gate, new Set(['role.view']), new Set())]).toEqual(['role.view']);
  });
  it('names the links that share a gate key (unticking one hides them too)', () => {
    expect(sharedGateLinks(m, row('Reset Password'))).toEqual(expect.arrayContaining(['Back Office User', 'Customer']));
  });
});

describe('rbac.matrix · select-all', () => {
  it('ticking a cell grants all its keys; unticking revokes them all', () => {
    const cell = ['kyc.approve', 'kyc.reject'];
    const held = new Set(cell);
    const on = toggleAll(cell, new Set(), held);
    expect([...on].sort()).toEqual(cell);
    expect(checkState(cell, on)).toBe('all');
    expect([...toggleAll(cell, on, held)]).toEqual([]);
  });
  it('never grants a key the editor does not hold (no escalation)', () => {
    const next = toggleAll(['je.view', 'je.create', 'je.approve'], new Set(), new Set(['je.view', 'je.create']));
    expect([...next].sort()).toEqual(['je.create', 'je.view']);
    const off = toggleAll(['je.view', 'je.create', 'je.approve'], new Set(['je.view', 'je.create', 'je.approve']), new Set(['je.view', 'je.create']));
    expect([...off]).toEqual(['je.approve']);
  });
  it('reports row state all / some / none', () => {
    expect(checkState(['a', 'b'], new Set(['a', 'b']))).toBe('all');
    expect(checkState(['a', 'b'], new Set(['a']))).toBe('some');
    expect(checkState(['a', 'b'], new Set())).toBe('none');
  });
});
