/**
 * Structural diff of a layout against another copy (usually the live/published one) —
 * human sentences the admin can read in the submit sheet (§4.6 "what changes go live").
 * Matched by stable ids: additions/removals by id set, renames by label, moves by index.
 */
import type { PortalLayout } from './layout';

export interface LayoutDiff {
  menusAdded: number;
  menusRemoved: number;
  pagesAdded: number;
  pagesRemoved: number;
  widgetsAdded: number;
  widgetsRemoved: number;
  moved: number;
  renames: number;
}

function labelMap(list: { id: string; label: string }[]): Map<string, string> {
  return new Map(list.map((x) => [x.id, x.label]));
}

/** Count widgets/pages/menus whose position changed between matched copies. */
function movedWidgets(b: PortalLayout, a: PortalLayout): number {
  let moved = 0;
  for (const bm of b.menus) {
    const am = a.menus.find((m) => m.id === bm.id);
    if (!am) continue;
    moved += bm.screens.filter((s, i) => (am.screens[i]?.id ?? '') !== s.id).length;
    for (const bs of bm.screens) {
      const as = am.screens.find((s) => s.id === bs.id);
      if (!as) continue;
      const aIds = as.placedWidgets.map((w) => w.id);
      bs.placedWidgets.forEach((w, i) => {
        if (aIds[i] !== w.id) moved += 1;
      });
    }
  }
  moved += a.menus.filter((m, i) => (b.menus[i]?.id ?? '') !== m.id).length;
  return moved;
}

export function diffLayouts(before: PortalLayout | null, after: PortalLayout): LayoutDiff {
  if (!before) {
    const w = after.menus.reduce((n, m) => n + m.screens.reduce((n2, s) => n2 + s.placedWidgets.length, 0), 0);
    return {
      menusAdded: after.menus.length, menusRemoved: 0,
      pagesAdded: after.menus.reduce((n, m) => n + m.screens.length, 0), pagesRemoved: 0,
      widgetsAdded: w, widgetsRemoved: 0, moved: 0, renames: 0,
    };
  }
  const pages = (l: PortalLayout) => l.menus.flatMap((m) => m.screens);
  const widgets = (l: PortalLayout) => pages(l).flatMap((s) => s.placedWidgets);
  const d: LayoutDiff = { menusAdded: 0, menusRemoved: 0, pagesAdded: 0, pagesRemoved: 0, widgetsAdded: 0, widgetsRemoved: 0, moved: 0, renames: 0 };

  const bMenus = labelMap(before.menus);
  const aMenus = labelMap(after.menus);
  d.menusAdded = after.menus.filter((m) => !bMenus.has(m.id)).length;
  d.menusRemoved = before.menus.filter((m) => !aMenus.has(m.id)).length;
  d.renames = after.menus.filter((m) => bMenus.has(m.id) && bMenus.get(m.id) !== m.label).length;

  const bPages = labelMap(pages(before));
  const aPages = labelMap(pages(after));
  d.pagesAdded = pages(after).filter((s) => !bPages.has(s.id)).length;
  d.pagesRemoved = pages(before).filter((s) => !aPages.has(s.id)).length;
  d.renames += pages(after).filter((s) => bPages.has(s.id) && bPages.get(s.id) !== s.label).length;

  const bWidgets = new Set(widgets(before).map((w) => w.id));
  const aWidgets = new Set(widgets(after).map((w) => w.id));
  d.widgetsAdded = widgets(after).filter((w) => !bWidgets.has(w.id)).length;
  d.widgetsRemoved = widgets(before).filter((w) => !aWidgets.has(w.id)).length;

  d.moved = movedWidgets(before, after);
  return d;
}

/** One human line, or "No structural changes — only settings." */
export function diffSummary(d: LayoutDiff): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n === 1) parts.push(`+1 ${one}`);
    else if (n > 1) parts.push(`+${n} ${many}`);
  };
  const sub = (n: number, one: string, many: string) => {
    if (n === 1) parts.push(`−1 ${one}`);
    else if (n > 1) parts.push(`−${n} ${many}`);
  };
  add(d.menusAdded, 'menu', 'menus'); sub(d.menusRemoved, 'menu', 'menus');
  add(d.pagesAdded, 'page', 'pages'); sub(d.pagesRemoved, 'page', 'pages');
  add(d.widgetsAdded, 'widget', 'widgets'); sub(d.widgetsRemoved, 'widget', 'widgets');
  if (d.moved) parts.push(`${d.moved} reordered`);
  if (d.renames) parts.push(`${d.renames} renamed`);
  return parts.length ? parts.join(', ') : 'No structural changes — only settings.';
}

export function diffEmpty(d: LayoutDiff): boolean {
  return !d.menusAdded && !d.menusRemoved && !d.pagesAdded && !d.pagesRemoved && !d.widgetsAdded && !d.widgetsRemoved && !d.moved && !d.renames;
}
