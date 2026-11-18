import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { COLS, tierOf } from './grid';
import type { Tier } from './grid';

export interface LayoutGridCell {
  key: string;
  /** span per tier; null = hidden on that tier */
  span: (tier: Tier) => number | null;
  render: () => ReactNode;
}

export interface LayoutGridProps {
  cells: readonly LayoutGridCell[];
}

/**
 * The published screen grid: tier from the CONTAINER width (never media queries — the
 * same rule widgets follow), the tier's column count, each cell at its tier span. Array
 * order is the reading order on every tier (the builder's "phone order").
 */
export function LayoutGrid({ cells }: LayoutGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tier, setTier] = useState<Tier>('lg');
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((e) => setTier(tierOf(e[0]?.contentRect.width ?? 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = COLS[tier];
  const style = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <div ref={ref} className="grid gap-4" style={style} data-tier={tier}>
      {cells.map((c) => {
        const span = c.span(tier);
        if (span === null) return null;
        return (
          <div key={c.key} className="min-w-0" style={{ gridColumn: `span ${Math.min(span, cols)}` }}>
            {c.render()}
          </div>
        );
      })}
    </div>
  );
}
