/**
 * The VERIFIED portal layout (plans/signed-portal-delivery-plan.md, builder phase B).
 *
 * SignedMenuGate verifies the bundle's ES256 signature against the build-pinned trust
 * store, then parses its payload HERE (zod at the boundary, ui-std §7) — only a payload
 * that verified AND has this exact shape ever reaches the renderer. Nothing in this module
 * fetches: the layout is never read from an unverified source, never cached across users.
 *
 * Payload (core UiBundleService.canonicalPayload):
 *   { portal, schemaVersion, layoutVersion, publishedAt,
 *     menus:[{ id, label, icon?, screens:[{ id, label, placedWidgets:[{ id, widgetId, span, config? }] }] }],
 *     widgets:[{ id, version, bundle, bundleHash, requires[] }] }   ← the server-approved set
 */
import { createContext, useContext } from 'react';
import * as z from 'zod';
import type { Tier } from '../shared/widgets/core/grid';
import type { WidgetDef } from '../shared/widgets/core/manifest';
import { requiresMet } from '../shared/widgets/core/manifest';
import type { MenuNavEntry } from '../shared/web-core/menu';

const ID = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const SPAN = z.number().int().min(1).max(12);

const placedSchema = z.object({
  id: z.string().min(1),
  widgetId: z.string().min(1),
  span: z.object({ xs: SPAN, sm: SPAN, md: SPAN, lg: SPAN }).partial(),
  config: z.record(z.unknown()).optional(),
});
const screenSchema = z.object({ id: ID, label: z.string().min(1), placedWidgets: z.array(placedSchema).default([]) });
const menuSchema = z.object({ id: ID, label: z.string().min(1), icon: z.string().optional(), screens: z.array(screenSchema).min(1) });
const approvedWidgetSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  bundle: z.string(),
  bundleHash: z.string(),
  requires: z.array(z.string()),
});

export const signedLayoutSchema = z.object({
  portal: z.string().min(1),
  schemaVersion: z.literal(1),
  layoutVersion: z.string().min(1),
  publishedAt: z.string().min(1),
  menus: z.array(menuSchema).min(1),
  widgets: z.array(approvedWidgetSchema),
});

export type SignedLayout = z.infer<typeof signedLayoutSchema>;
export type SignedMenu = SignedLayout['menus'][number];
export type SignedScreen = SignedMenu['screens'][number];
export type SignedPlaced = SignedScreen['placedWidgets'][number];

/** Verified layout for this portal; null = no published layout (coded menus apply). */
export const SignedLayoutCtx = createContext<SignedLayout | null>(null);

export function useSignedLayout(): SignedLayout | null {
  return useContext(SignedLayoutCtx);
}

export function screenLink(menu: SignedMenu, screen: SignedScreen): string {
  return `/p/${menu.id}/${screen.id}`;
}

function major(v: string): string {
  return v.split('.')[0] ?? v;
}

/**
 * A placed widget renders only when ALL hold: this build has it, the server approved it for
 * this portal (signed `widgets` list), the approved major version matches the build's, and
 * the user holds what its manifest requires. Anything else renders nothing (fail closed).
 */
export function placedDef(
  layout: SignedLayout,
  placed: SignedPlaced,
  registry: (id: string) => WidgetDef | undefined,
): WidgetDef | null {
  const def = registry(placed.widgetId);
  const approved = layout.widgets.find((w) => w.id === placed.widgetId);
  if (!def || !approved || major(approved.version) !== major(def.version)) return null;
  return def;
}

export function screenVisible(
  layout: SignedLayout,
  screen: SignedScreen,
  permissions: readonly string[],
  registry: (id: string) => WidgetDef | undefined,
): boolean {
  return screen.placedWidgets.some((p) => {
    const def = placedDef(layout, p, registry);
    return !!def && requiresMet(def, permissions);
  });
}

/** The span a placed widget takes at a tier (signed span, else manifest default); null = hidden. */
export function signedSpan(def: WidgetDef, placed: SignedPlaced, tier: Tier): number | null {
  const z0 = def.size[tier];
  if (z0.kind === 'hidden') return null;
  const s = placed.span[tier] ?? z0.default;
  return Math.max(z0.min, Math.min(z0.max, s));
}

/** First screen the user can see (the portal's home when a layout is published). */
export function firstVisibleLink(
  layout: SignedLayout,
  permissions: readonly string[],
  registry: (id: string) => WidgetDef | undefined,
): string | null {
  for (const m of layout.menus) {
    for (const s of m.screens) if (screenVisible(layout, s, permissions, registry)) return screenLink(m, s);
  }
  return null;
}

/** Sidebar entries from the verified layout: a group per menu, the screens the user can see. */
export function layoutNavEntries(
  layout: SignedLayout,
  permissions: readonly string[],
  registry: (id: string) => WidgetDef | undefined,
): MenuNavEntry[] {
  const out: MenuNavEntry[] = [];
  for (const m of layout.menus) {
    const visible = m.screens.filter((s) => screenVisible(layout, s, permissions, registry));
    if (!visible.length) continue; // a menu with nothing the user may see never shows
    out.push({ kind: 'group', label: m.label });
    for (const s of visible) out.push({ kind: 'item', label: s.label, icon: m.icon ?? '▸', link: screenLink(m, s) });
  }
  return out;
}
