/**
 * The portal layout the builder edits — exactly the JSON core's LayoutValidator accepts and
 * UiLayoutPublishHandler signs into the portal's delivery bundle:
 *   { portal, menus:[{ id, label, icon?, screens:[{ id, label,
 *     placedWidgets:[{ id, widgetId, span:{xs,sm,md,lg}, config }] }] }] }
 * (SME core/layout.ts, without i18n message keys: FSP labels are plain text today.)
 */
import { TIERS } from '../../portals/shared/widgets/core/grid';
import type { Tier } from '../../portals/shared/widgets/core/grid';
import type { WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { cellsOf } from '../../portals/shared/widgets/core/manifest';
import { menuFor } from '../../portals/shared/web-core/menu';
import type { MenuWidget } from '../../portals/shared/web-core/menu';
import type { BuilderPortal } from '../model';
import { worksIn } from '../model';

export interface PlacedWidget {
  id: string;
  widgetId: string;
  span: Partial<Record<Tier, number>>;
  config: Record<string, unknown>;
}
export interface LayoutScreen {
  id: string;
  label: string;
  placedWidgets: PlacedWidget[];
}
export interface LayoutMenu {
  id: string;
  label: string;
  icon?: string;
  screens: LayoutScreen[];
}
export interface PortalLayout {
  portal: string;
  menus: LayoutMenu[];
}

export interface Finding {
  level: 'error' | 'warning';
  where: string;
  text: string;
  /** Where in the layout the finding points (for "go to it") — indices of menus/screens. */
  m?: number;
  s?: number;
}

export const ID_RE = /^[a-z][a-z0-9-]{0,47}$/;

export function newId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function slug(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(s) ? s.slice(0, 48) : `m-${s}`.slice(0, 48);
}

export function uniqueId(base: string, taken: readonly string[]): string {
  let id = base;
  let n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

/** The span a placed widget gets at a tier: its own, else the manifest default; null = hidden. */
export function placedSpan(def: WidgetDef, it: PlacedWidget, tier: Tier): number | null {
  const z = def.size[tier];
  if (z.kind === 'hidden') return null;
  return it.span[tier] ?? z.default;
}

export function configDefaults(def: WidgetDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(def.config ?? {})) out[k] = (f as { default: unknown }).default;
  return out;
}

export function placeWidget(def: WidgetDef): PlacedWidget {
  const span: Partial<Record<Tier, number>> = {};
  for (const t of TIERS) {
    const z = def.size[t];
    if (z.kind === 'span') span[t] = z.default;
  }
  return { id: newId('w'), widgetId: def.id, span, config: configDefaults(def) };
}

export function screenRoute(menu: LayoutMenu, screen: LayoutScreen): string {
  return `/${menu.id}/${screen.id}`;
}

/** The permission keys that show a screen: the union of what its widgets require. */
export function screenResources(screen: LayoutScreen, defs: ReadonlyMap<string, WidgetDef>): string[] {
  const out = new Set<string>();
  for (const it of screen.placedWidgets) {
    const d = defs.get(it.widgetId);
    if (d) for (const c of cellsOf(d)) out.add(c);
  }
  return [...out];
}

/** "Reset to today's menus": the build-time menu registry, as a layout (SME seedLayout). */
export function seedLayout(portal: BuilderPortal, defs: ReadonlyMap<string, WidgetDef>): PortalLayout {
  const menus: LayoutMenu[] = [];
  for (const item of menuFor(portal.menuPortal)) {
    const group = item.group ?? 'General';
    let menu = menus.find((m) => m.label === group);
    if (!menu) {
      menu = { id: uniqueId(slug(group), menus.map((m) => m.id)), label: group, icon: item.icon, screens: [] };
      menus.push(menu);
    }
    menu.screens.push({
      id: uniqueId(slug(item.id), menu.screens.map((s) => s.id)),
      label: item.label,
      placedWidgets: item.widgets
        .map((w) => defs.get(w))
        .filter((d): d is WidgetDef => !!d)
        .map((d) => {
          const placed = placeWidget(d);
          const menuConfig = item.config?.[d.id as MenuWidget];
          const menuSpan = item.span?.[d.id as MenuWidget];
          return {
            ...placed,
            ...(menuConfig ? { config: { ...placed.config, ...menuConfig } } : {}),
            ...(menuSpan ? { span: { ...placed.span, ...menuSpan } } : {}),
          };
        }),
    });
  }
  return { portal: portal.key, menus };
}

/** Live checks (SME validateLayout) — errors are what core would reject or the portal would break on.
 *  Findings carry menu/screen indices so the UI can jump to the problem (§4.5). */
export function validateLayout(
  layout: PortalLayout,
  defs: ReadonlyMap<string, WidgetDef>,
  portal: BuilderPortal,
): Finding[] {
  const out: Finding[] = [];
  const err = (where: string, text: string, m?: number, s?: number) => out.push({ level: 'error', where, text, m, s });
  const warn = (where: string, text: string, m?: number, s?: number) => out.push({ level: 'warning', where, text, m, s });
  if (!layout.menus.length) err('layout', 'needs at least one menu (core rejects an empty layout)');
  const menuIds = new Set<string>();
  layout.menus.forEach((m, mi) => {
    const mw = `menu “${m.label || m.id}”`;
    if (!m.label.trim()) err(mw, 'label is empty', mi);
    if (!ID_RE.test(m.id)) err(mw, `id “${m.id}” must be lower-case letters, digits or - (starting with a letter)`, mi);
    if (menuIds.has(m.id)) err(mw, `id “${m.id}” is used twice`, mi);
    menuIds.add(m.id);
    if (!m.screens.length) err(mw, 'has no pages (core rejects a menu without screens)', mi);
    const screenIds = new Set<string>();
    m.screens.forEach((s, si) => {
      const sw = `${m.label || m.id} › ${s.label || s.id}`;
      if (!s.label.trim()) err(sw, 'label is empty', mi, si);
      if (!ID_RE.test(s.id)) err(sw, `id “${s.id}” is not a valid route segment`, mi, si);
      if (screenIds.has(s.id)) err(sw, `id “${s.id}” is used twice in this menu`, mi, si);
      screenIds.add(s.id);
      if (!s.placedWidgets.length) warn(sw, 'empty page: nobody will see anything here', mi, si);
      for (const it of s.placedWidgets) {
        const d = defs.get(it.widgetId);
        if (!d) {
          err(sw, `${it.widgetId} is not in this build's registry`, mi, si);
          continue;
        }
        if (!worksIn(d, portal.context)) warn(sw, `${d.label} is not declared for ${portal.context}`, mi, si);
        for (const t of TIERS) {
          const z = d.size[t];
          const v = it.span[t];
          if (z.kind === 'hidden') {
            if (v !== undefined) err(sw, `${d.label} has a ${t} span but is hidden on ${t} (${z.reason})`, mi, si);
          } else if (v !== undefined && (v < z.min || v > z.max)) {
            err(sw, `${d.label} ${t} span ${v} is outside ${z.min}–${z.max}`, mi, si);
          }
        }
      }
    });
  });
  return out;
}

export function parseLayout(json: string | null | undefined, portalKey: string): PortalLayout | null {
  if (!json) return null;
  try {
    const l = JSON.parse(json) as PortalLayout;
    if (!l || l.portal !== portalKey || !Array.isArray(l.menus)) return null;
    for (const m of l.menus) {
      m.screens ??= [];
      for (const s of m.screens) {
        s.placedWidgets ??= [];
        for (const w of s.placedWidgets) {
          w.span ??= {};
          w.config ??= {};
        }
      }
    }
    return l;
  } catch {
    return null;
  }
}

/** "Start blank": one menu with one empty page — the first state is never an error. */
export function blankLayout(portalKey: string): PortalLayout {
  return {
    portal: portalKey,
    menus: [{ id: 'main', label: 'Main', screens: [{ id: 'page-1', label: 'Page 1', placedWidgets: [] }] }],
  };
}

/** Structural equality for "did the draft change since live / since the server copy". */
export function sameLayout(a: PortalLayout | null, b: PortalLayout | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Auto-slug (§4.2): renaming re-derives the id from the label — but only when the id is
 * still the slug of the old label (an untouched, auto-derived id) and was never published
 * (published ids are immutable). Returns null when the id must stay as-is.
 */
export function autoSlugId(currentId: string, prevLabel: string, newLabel: string, taken: readonly string[]): string | null {
  if (currentId === '' || slug(prevLabel) !== currentId) return null;
  const next = slug(newLabel);
  if (!next || next === currentId || taken.includes(next)) return null;
  return next;
}

export function clearLocalDraft(portalKey: string): void {
  try {
    localStorage.removeItem(DRAFT(portalKey));
  } catch {
    /* private mode / blocked storage */
  }
}

export function move<T>(list: T[], from: number, to: number): void {
  if (from === to || from < 0 || from >= list.length) return;
  const [x] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, x);
}

const DRAFT = (portal: string) => `fsp.widget-workbench.builder.${portal}`;

/** Drafts are a per-browser convenience (the server draft is the shared copy). */
export function loadLocalDraft(portalKey: string): PortalLayout | null {
  try {
    return parseLayout(localStorage.getItem(DRAFT(portalKey)), portalKey);
  } catch {
    return null;
  }
}

export function saveLocalDraft(layout: PortalLayout): void {
  try {
    localStorage.setItem(DRAFT(layout.portal), JSON.stringify(layout));
  } catch {
    /* private mode / blocked storage: the editor still works */
  }
}
