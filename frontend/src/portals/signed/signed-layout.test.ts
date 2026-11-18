/**
 * The layout renderer's fail-closed rules (signed-layout.ts): only verified-shape payloads,
 * only server-approved widgets of a matching major version, only what the user may see.
 */
import { describe, expect, it } from 'vitest';
import type { WidgetDef } from '../shared/widgets/core/manifest';
import { span } from '../shared/widgets/core/grid';
import {
  firstVisibleLink, layoutNavEntries, placedDef, screenVisible, signedLayoutSchema, signedSpan,
} from './signed-layout';
import type { SignedLayout } from './signed-layout';

const def = (id: string, version: string, requires: string[]): WidgetDef => ({
  id, version, label: id, contexts: ['ANY'], requires,
  size: { xs: span.xs(4), sm: span.sm(4, 8, 8), md: span.md(6, 6, 12), lg: span.lg(4, 6, 12) },
  render: () => null,
});
const REGISTRY = new Map<string, WidgetDef>([
  ['kyc.orgs', def('kyc.orgs', '1.2.0', ['kyc.review'])],
  ['users.organization', def('users.organization', '2.0.0', ['user.manage'])],
]);
const reg = (id: string) => REGISTRY.get(id);

function layout(over: Partial<SignedLayout> = {}): SignedLayout {
  return signedLayoutSchema.parse({
    portal: 'admin', schemaVersion: 1, layoutVersion: 'l1', publishedAt: '2026-11-18T00:00:00Z',
    menus: [
      { id: 'kyc', label: 'KYC', screens: [{ id: 'orgs', label: 'Organisations', placedWidgets: [
        { id: 'p1', widgetId: 'kyc.orgs', span: { md: 12 } }] }] },
      { id: 'access', label: 'Access', screens: [{ id: 'users', label: 'Users', placedWidgets: [
        { id: 'p2', widgetId: 'users.organization', span: {} }] }] },
    ],
    widgets: [
      { id: 'kyc.orgs', version: '1.0.0', bundle: 'b', bundleHash: 'sha256:x', requires: ['kyc.review'] },
      { id: 'users.organization', version: '2.0.0', bundle: 'b', bundleHash: 'sha256:y', requires: ['user.manage'] },
    ],
    ...over,
  });
}

describe('signed layout renderer rules', () => {
  it('rejects payloads that are not a layout (shape is checked after the signature)', () => {
    expect(signedLayoutSchema.safeParse({ portal: 'admin', menus: [] }).success).toBe(false);
    expect(signedLayoutSchema.safeParse({ ...layout(), schemaVersion: 2 }).success).toBe(false);
    expect(signedLayoutSchema.safeParse({ ...layout(), menus: [{ id: 'BAD ID', label: 'x', screens: [] }] }).success).toBe(false);
  });

  it('renders a placed widget only when the build has it AND the server approved it', () => {
    const l = layout({ widgets: [] }); // signed list approves nothing
    expect(placedDef(l, l.menus[0].screens[0].placedWidgets[0], reg)).toBeNull();
    const ok = layout();
    expect(placedDef(ok, ok.menus[0].screens[0].placedWidgets[0], reg)?.id).toBe('kyc.orgs');
    const unknown = { id: 'p9', widgetId: 'not.in.build', span: {} };
    expect(placedDef(ok, unknown, reg)).toBeNull();
  });

  it('refuses an approved widget whose major version differs from the build', () => {
    const l = layout({ widgets: [{ id: 'kyc.orgs', version: '2.0.0', bundle: 'b', bundleHash: 'h', requires: [] }] });
    expect(placedDef(l, l.menus[0].screens[0].placedWidgets[0], reg)).toBeNull();
  });

  it('shows only screens and menus the user may see, and picks the first as home', () => {
    const l = layout();
    expect(screenVisible(l, l.menus[0].screens[0], ['user.manage'], reg)).toBe(false);
    const nav = layoutNavEntries(l, ['user.manage'], reg);
    expect(nav).toEqual([
      { kind: 'group', label: 'Access' },
      { kind: 'item', label: 'Users', icon: '▸', link: '/p/access/users' },
    ]);
    expect(firstVisibleLink(l, ['user.manage'], reg)).toBe('/p/access/users');
    expect(firstVisibleLink(l, [], reg)).toBeNull();
  });

  it('uses the signed span per tier, clamped to the manifest bounds', () => {
    const l = layout();
    const d = REGISTRY.get('kyc.orgs')!;
    const p = l.menus[0].screens[0].placedWidgets[0];
    expect(signedSpan(d, p, 'md')).toBe(12);
    expect(signedSpan(d, p, 'lg')).toBe(6); // not signed → manifest default
    expect(signedSpan(d, { ...p, span: { lg: 1 } }, 'lg')).toBe(4); // below min → clamped
  });
});
