import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COLS } from '../../portals/shared/widgets/core/grid';
import type { Tier } from '../../portals/shared/widgets/core/grid';
import type { WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { WidgetHost } from '../../portals/shared/widgets/core/host';
import { FIXTURES } from '../../portals/shared/widgets/fixtures';
import { FrameRouter } from '../FrameRouter';
import { FIXTURE_ORG, TIER_LABEL, TIER_TEST_WIDTH } from '../model';
import type { PortalContext } from '../model';
import { DND_PLACED, DND_WIDGET, carries } from './dnd';
import { placedSpan } from './layout';
import type { PlacedWidget } from './layout';

export interface DesignCanvasProps {
  context: PortalContext;
  tier: Tier;
  items: readonly PlacedWidget[];
  defs: ReadonlyMap<string, WidgetDef>;
  selected: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, by: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: (widgetId: string, at: number) => void;
}

/**
 * The screen of a submenu at one grid tier, with the placed widgets rendered for real — on
 * fixtures, in design mode (never against the live API with the developer's own session).
 * Drop widgets from the palette; drag ⠿ to reorder (the order is the phone order).
 */
export function DesignCanvas(props: DesignCanvasProps) {
  const { context, tier, items, defs, selected } = props;
  const width = TIER_TEST_WIDTH[tier];
  const cols = COLS[tier];
  const fitRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(900);
  const [over, setOver] = useState<number | 'end' | null>(null);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 0 } } }),
  );

  useEffect(() => {
    const el = fitRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((e) => setAvail(Math.max(320, (e[0]?.contentRect.width ?? 900) - 4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const zoom = Math.min(1, avail / width);

  const accept = (e: DragEvent, at: number | 'end') => {
    if (!carries(e, DND_WIDGET, DND_PLACED)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = carries(e, DND_WIDGET) ? 'copy' : 'move';
    setOver(at);
  };
  const drop = (e: DragEvent, at: number) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const widgetId = e.dataTransfer.getData(DND_WIDGET);
    if (widgetId) {
      props.onAdd(widgetId, at);
      return;
    }
    const from = Number(e.dataTransfer.getData(DND_PLACED));
    if (Number.isInteger(from)) props.onReorder(from, from < at ? at - 1 : at);
  };

  const pageStyle = { width, zoom, ['--cols' as string]: cols } as CSSProperties;

  return (
    <div className="canvas">
      <div className="cv-bar">
        <span>{TIER_LABEL[tier]} · {width}px · {cols} columns</span>
        <span className="grow" />
        <span className="dim">Drop widgets here · drag ⠿ to reorder (this order is the phone order)</span>
      </div>
      <div className="cv-fit" ref={fitRef}>
        <QueryClientProvider client={queryClient}>
          <div
            className={over === 'end' ? 'cv-page drop-over' : 'cv-page'}
            style={pageStyle}
            data-canvas
            onDragOver={(e) => accept(e, 'end')}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, items.length)}
          >
            <div className="cols" aria-hidden="true">
              {Array.from({ length: cols }, (_, i) => <i key={i} />)}
            </div>
            {items.map((it, i) => {
              const d = defs.get(it.widgetId);
              if (!d) {
                return (
                  <div key={it.id} className="cv-cell bad" style={{ gridColumn: '1 / -1' }}>
                    {it.widgetId}: not in the registry{' '}
                    <button type="button" className="lnk" onClick={() => props.onRemove(it.id)}>remove</button>
                  </div>
                );
              }
              const span = placedSpan(d, it, tier);
              if (span === null) {
                return (
                  <div key={it.id} className="cv-cell hiddentier" style={{ gridColumn: '1 / -1' }}>
                    {d.label} is hidden on this tier
                  </div>
                );
              }
              const cls = ['cv-cell', selected === it.id ? 'sel' : '', over === i ? 'drop-over' : ''].filter(Boolean).join(' ');
              return (
                <div
                  key={it.id}
                  className={cls}
                  style={{ gridColumn: `span ${span}` }}
                  onClick={() => props.onSelect(it.id)}
                  onDragOver={(e) => accept(e, i)}
                  onDrop={(e) => drop(e, i)}
                >
                  <div className="cv-head">
                    <span
                      className="handle"
                      title="Drag to reorder"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_PLACED, String(i));
                        e.dataTransfer.effectAllowed = 'move';
                        const cell = (e.currentTarget as HTMLElement).closest('.cv-cell');
                        if (cell) e.dataTransfer.setDragImage(cell, 12, 12);
                      }}
                    >
                      ⠿
                    </span>
                    <b>{d.label}</b>
                    <span className="dim mono">{span}/{cols}</span>
                    <span className="grow" />
                    <button type="button" title="Narrower" onClick={(e) => { e.stopPropagation(); props.onResize(it.id, -1); }}>−</button>
                    <button type="button" title="Wider" onClick={(e) => { e.stopPropagation(); props.onResize(it.id, 1); }}>+</button>
                    <button type="button" title="Remove" onClick={(e) => { e.stopPropagation(); props.onRemove(it.id); }}>✕</button>
                  </div>
                  <FrameRouter>
                    <WidgetHost
                      def={d}
                      mode="fixture"
                      ungated
                      fixtures={FIXTURES}
                      portal={context}
                      orgId={FIXTURE_ORG}
                      config={it.config}
                    />
                  </FrameRouter>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="cv-empty">Empty screen. Drag a widget from the palette and drop it here.</div>
            )}
          </div>
        </QueryClientProvider>
      </div>
    </div>
  );
}
