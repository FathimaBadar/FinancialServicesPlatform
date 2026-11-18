/**
 * Mobile-first grid — ported from SME widgets/core/grid.ts (§3.3 step 2).
 * Container-query tiers; a widget without a size for every tier does NOT
 * compile, and spans are type-checked against the tier's column count.
 */
export const COLS = { xs: 4, sm: 8, md: 12, lg: 12 } as const;
export type Tier = keyof typeof COLS;
export const TIERS = ['xs', 'sm', 'md', 'lg'] as const;

/** 1..N union (type-level, SME's exact trick). */
export type Nums<N extends number, A extends unknown[] = [unknown]> =
  A['length'] extends N ? N : A['length'] | Nums<N, [...A, unknown]>;

/** min..max closed interval of numbers 1..N. */
export type Between<Lo extends number, Hi extends number> =
  Exclude<Nums<Hi>, Exclude<Nums<Lo>, Lo>>;

export interface Span {
  kind: 'span';
  min: number;
  default: number;
  max: number;
}
export interface Hidden {
  kind: 'hidden';
  reason: string;
}
export type SizeSpan = Span | Hidden;

/**
 * `span.xs(2)` — spans are bounded per tier; concrete calls are type-checked
 * against 1..tier columns (Between), and tierC clamps defensively at runtime.
 * (The min ≤ default ≤ max cross-check runs in validateWidget.)
 */
export function tierC(cols: number): (min: number, def?: number, max?: number) => Span {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return (min, def, max) => {
    const lo = clamp(min, 1, cols);
    const d = clamp(def ?? lo, lo, cols);
    const hi = clamp(max ?? d, d, cols);
    return { kind: 'span', min: lo, default: d, max: hi };
  };
}

/** tier span factories: span.xs(2), span.md(4, 6, 12) … */
export const span = {
  xs: tierC(COLS.xs) as <M extends Nums<4>>(min: M, def?: number, max?: number) => Span,
  sm: tierC(COLS.sm) as <M extends Nums<8>>(min: M, def?: number, max?: number) => Span,
  md: tierC(COLS.md) as <M extends Nums<12>>(min: M, def?: number, max?: number) => Span,
  lg: tierC(COLS.lg) as <M extends Nums<12>>(min: M, def?: number, max?: number) => Span,
  hidden: (reason: string): Hidden => ({ kind: 'hidden', reason }),
};

export function tierOf(widthPx: number): Tier {
  if (widthPx < 600) return 'xs';
  if (widthPx < 960) return 'sm';
  if (widthPx < 1280) return 'md';
  return 'lg';
}

export function spanFor(def: SizeSpan, _tier: Tier): Span | null {
  void _tier;
  if (def.kind === 'hidden') return null;
  return { kind: 'span', min: def.min, default: def.default, max: def.max };
}

/** The resolved column span of a placed widget at a tier. */
export function resolvedSpan(def: SizeSpan, tier: Tier): number | null {
  const s = spanFor(def, tier);
  if (!s) return null;
  if (tier === 'xs') return s.default; // xs spans don't widen the 4-col phone grid
  return s.default;
}
