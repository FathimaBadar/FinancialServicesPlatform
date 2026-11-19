/**
 * Undo/redo for the builder's editor copy (§4.8): pure stacks of previous/next layouts.
 * `edit()` records the CURRENT layout before mutating; undo/redo swap the head. Sel
 * indices are deliberately NOT tracked — components already tolerate out-of-range sel.
 */
import type { PortalLayout } from './layout';

export interface History {
  past: PortalLayout[];
  future: PortalLayout[];
}

const LIMIT = 100;

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** Record the current layout BEFORE an edit (clears the redo branch — a new timeline starts). */
export function pushHistory(hist: History, current: PortalLayout): History {
  return { past: [...hist.past.slice(-(LIMIT - 1)), current], future: [] };
}

/** The layout to restore, or null when there is nothing to undo. */
export function undoHistory(hist: History, current: PortalLayout): { hist: History; layout: PortalLayout | null } {
  if (!hist.past.length) return { hist, layout: null };
  const past = [...hist.past];
  const layout = past.pop() ?? null;
  return { hist: { past, future: [current, ...hist.future].slice(0, LIMIT) }, layout };
}

/** The layout to restore, or null when there is nothing to redo. */
export function redoHistory(hist: History, current: PortalLayout): { hist: History; layout: PortalLayout | null } {
  if (!hist.future.length) return { hist, layout: null };
  const future = [...hist.future];
  const layout = future.shift() ?? null;
  return { hist: { past: [...hist.past, current].slice(-LIMIT), future }, layout };
}
