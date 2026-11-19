import { describe, expect, it } from 'vitest';
import { buildMatrix, checkState, toggleAll, visibleMatrix } from './model';
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

describe('rbac.matrix · permission matrix model', () => {
  const m = buildMatrix(defs);
  const cellKeys = m.groups.flatMap((g) => g.rows.flatMap((r) => m.columns.flatMap((c) => r.cells[c].map((x) => x.key))));

  it('places every catalogue key in exactly one cell — nothing dropped, nothing invented', () => {
    expect([...cellKeys].sort()).toEqual(LIVE.map(([k]) => k).sort());
  });
  it('shows only verb columns FSP has (no Delete / Active)', () => {
    expect(m.columns).toEqual(['create', 'view', 'update', 'authorize']);
  });
  it('groups resources under their component, e.g. ledger → GL account, Bank account view, Accounting period', () => {
    const ledger = m.groups.find((g) => g.component === 'ledger');
    expect(ledger?.rows.map((r) => r.resource).sort()).toEqual(['bank.account', 'gl.account', 'period']);
  });
  it('folds every key of a verb family into ONE cell (Authorize = approve + reject, Create = install + register)', () => {
    const kyc = m.groups.find((g) => g.component === 'kyc')!.rows.find((r) => r.resource === 'kyc')!;
    expect(kyc.cells.authorize.map((c) => c.key)).toEqual(['kyc.approve', 'kyc.reject']);
    expect(kyc.cells.view.map((c) => c.key)).toEqual(['kyc.review']);
    const plugin = m.groups.find((g) => g.component === 'platform')!.rows.find((r) => r.resource === 'plugin')!;
    expect(plugin.cells.create.map((c) => c.key)).toEqual(['plugin.install', 'plugin.register']);
  });
  it('ticking a cell grants all its keys; unticking revokes them all', () => {
    const cell = ['kyc.approve', 'kyc.reject'];
    const held = new Set(cell);
    const on = toggleAll(cell, new Set(), held);
    expect([...on].sort()).toEqual(cell);
    expect(checkState(cell, on)).toBe('all');
    expect([...toggleAll(cell, on, held)]).toEqual([]);
  });
  it('select-all never grants a key the editor does not hold (no escalation)', () => {
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
  it('shows only KYC, Organizations and User & Role Management — the rest is hidden, not removed', () => {
    const v = visibleMatrix(m);
    expect(v.groups.map((g) => g.label)).toEqual(['KYC', 'Organizations', 'User & Role Management']);
    expect(m.groups.length).toBeGreaterThan(v.groups.length); // full model still holds every component
    expect(v.columns).toEqual(['create', 'view', 'update', 'authorize']);
  });
});
