/** What the builder's inspector is pointed at. */
export type Sel =
  | { kind: 'menu'; m: number }
  | { kind: 'screen'; m: number; s: number }
  | { kind: 'widget'; m: number; s: number; id: string }
  | null;

/**
 * Builder views: the canvas is the screen editor; `submit` opens the four-eyes sheet
 * (replaces the old "Publish" tab — §4.6); `export` is opened from the ⋯ menu.
 * `publish` stays accepted for old links and maps to `submit`.
 */
export type BuilderView = 'canvas' | 'submit' | 'export';

export const BUILDER_VIEWS: readonly BuilderView[] = ['canvas', 'submit', 'export'];

export function parseView(raw: string | null): BuilderView {
  if (raw === 'publish') return 'submit';
  return BUILDER_VIEWS.includes(raw as BuilderView) ? (raw as BuilderView) : 'canvas';
}
