/**
 * Widget host provider — SME WIDGET_CONTEXT, React form. Creates each placed
 * widget's runtime value with portal/org/selection state, a ResizeObserver-driven
 * tier (widgets adapt by container width, never media queries) AND the data port
 * on the same context. Hooks live in runtime.ts; only the component exports here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { WidgetCtx } from './runtime';
import type { WidgetRuntimeValue } from './runtime';
import { tierOf } from './grid';
import type { WidgetDataPortLike, WidgetHostContextLike } from './manifest';

export function WidgetContextProvider({
  value,
  port,
  children,
}: {
  value: Omit<WidgetHostContextLike, 'tier' | 'widthPx'>;
  port: WidgetDataPortLike;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const select = value.select;
  const ctx = useMemo(
    () => ({ ...value, select, tier: tierOf(width), widthPx: width }),
    [value, select, width],
  );
  const rt = useMemo(() => ({ context: ctx, port }) satisfies WidgetRuntimeValue, [ctx, port]);
  return (
    <div ref={ref} className="min-w-0">
      <WidgetCtx.Provider value={rt}>{children}</WidgetCtx.Provider>
    </div>
  );
}
