import { describe, expect, it } from 'vitest';
import { MENU_ITEMS } from '../../../web-core/menu';
import { signedLayoutSchema } from '../../../../signed/signed-layout';
import type { SignedLayout } from '../../../../signed/signed-layout';
import { getWidget } from '../../registry';
import { activeKey, buildMatrix, checkState, isActive, sharedGateLinks, toggleActive, toggleAll } from './model';
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

/** A PUBLISHED portal layout (what core signs): its menus/screens are the ONLY source of matrix rows. */
function published(over: Partial<SignedLayout> = {}): SignedLayout {
  const approved = (id: string) => ({ id, version: getWidget(id)!.version, bundle: 'b', bundleHash: 'sha256:x', requires: [] });
  return signedLayoutSchema.parse({
    portal: 'admin', schemaVersion: 1, layoutVersion: 'l7', publishedAt: '2026-11-22T00:00:00Z',
    menus: [
      { id: 'access', label: 'Access control', screens: [
        { id: 'roles', label: 'Roles', placedWidgets: [{ id: 'p1', widgetId: 'rbac.matrix', span: {} }] },
        { id: 'people', label: 'People', placedWidgets: [{ id: 'p2', widgetId: 'users.organization', span: {} }] },
      ] },
      { id: 'books', label: 'Books', screens: [
        { id: 'je', label: 'Journal', placedWidgets: [
          { id: 'p3', widgetId: 'journal.entry', span: {} }, { id: 'p4', widgetId: 'audit.trail', span: {} }] },
        // placed but NOT server-approved for this portal → contributes nothing (fail closed, like the sidebar)
        { id: 'ghost', label: 'Ghost', placedWidgets: [{ id: 'p5', widgetId: 'approvals.queue', span: {} }] },
      ] },
    ],
    widgets: ['rbac.matrix', 'users.organization', 'journal.entry', 'audit.trail'].map(approved),
    ...over,
  });
}
const rows = (l: SignedLayout) => buildMatrix(l, defs, getWidget).groups.flatMap((g) => g.rows);

describe('rbac.matrix · rows are exactly the PUBLISHED menu (never the coded registry)', () => {
  it('one group per published menu, one row per screen, in published order, linked like the sidebar', () => {
    const m = buildMatrix(published(), defs, getWidget);
    expect(m.groups.map((g) => [g.label, g.rows.map((r) => [r.label, r.link])])).toEqual([
      ['Access control', [['Roles', '/p/access/roles'], ['People', '/p/access/people']]],
      ['Books', [['Journal', '/p/books/je'], ['Ghost', '/p/books/ghost']]],
    ]);
  });
  it('labels nobody coded: the matrix follows a rename in the portal builder', () => {
    const coded = new Set(MENU_ITEMS.map((i) => i.label));
    for (const r of rows(published())) expect(coded.has(r.label), r.label).toBe(false);
  });
  it('a row covers its placed widgets’ keys; the gate is what shows the screen', () => {
    const role = rows(published()).find((r) => r.label === 'Roles')!;
    expect(role.gate).toEqual(['role.manage', 'role.view']);
    expect(role.cells.view.map((c) => c.key)).toEqual(['role.view']);
    expect(role.cells.update.map((c) => c.key)).toEqual(['role.manage']);
    const je = rows(published()).find((r) => r.label === 'Journal')!;
    expect(je.keys).toEqual(expect.arrayContaining(['je.create', 'je.approve', 'audit.view']));
    const all = new Set(LIVE.map(([k]) => k));
    for (const r of rows(published())) for (const k of r.keys) expect(all.has(k)).toBe(true);
  });
  it('a widget the server did not approve (or of another major) grants nothing', () => {
    expect(rows(published()).find((r) => r.label === 'Ghost')!.keys).toEqual([]);
    const l = published({ widgets: published().widgets.map((w) => (w.id === 'rbac.matrix' ? { ...w, version: '9.0.0' } : w)) });
    expect(rows(l).find((r) => r.label === 'Roles')!.keys).toEqual([]);
  });
});

describe('rbac.matrix · Active box (one more per link)', () => {
  const m = buildMatrix(published(), defs, getWidget);
  const row = (label: string) => m.groups.flatMap((g) => g.rows).find((r) => r.label === label)!;
  const everything = new Set(LIVE.map(([k]) => k));

  it('is on when the role holds any key of the screen’s gate (the screen shows)', () => {
    expect(isActive(row('Roles').gate, new Set(['role.view']))).toBe(true);
    expect(isActive(row('Roles').gate, new Set(['user.manage']))).toBe(false);
  });
  it('ticking grants the least-privilege gate key (view before manage)', () => {
    expect(activeKey(row('Roles').gate, everything)).toBe('role.view');
    expect([...toggleActive(row('Roles').gate, new Set(), everything)]).toEqual(['role.view']);
  });
  it('unticking revokes the whole gate so the screen no longer shows', () => {
    const next = toggleActive(row('Roles').gate, new Set(['role.view', 'role.manage', 'user.manage']), everything);
    expect([...next]).toEqual(['user.manage']);
  });
  it('never grants or revokes a key the editor does not hold', () => {
    expect([...toggleActive(row('Roles').gate, new Set(), new Set(['user.manage']))]).toEqual([]);
    expect([...toggleActive(row('Roles').gate, new Set(['role.view']), new Set())]).toEqual(['role.view']);
  });
  it('names the screens that share a gate key (unticking one hides them too)', () => {
    const l = published({ menus: [...published().menus, { id: 'more', label: 'More', screens: [
      { id: 'roles2', label: 'Roles again', placedWidgets: [{ id: 'p9', widgetId: 'rbac.matrix', span: {} }] }] }] });
    const mm = buildMatrix(l, defs, getWidget);
    const r = mm.groups.flatMap((g) => g.rows).find((x) => x.label === 'Roles')!;
    expect(sharedGateLinks(mm, r)).toEqual(['Roles again']);
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
