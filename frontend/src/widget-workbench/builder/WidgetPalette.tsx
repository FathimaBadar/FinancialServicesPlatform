import type { WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { requiresText } from '../model';
import { DND_WIDGET } from './dnd';

export interface WidgetPaletteProps {
  widgets: readonly WidgetDef[];
  portalLabel: string;
  serverIds: ReadonlySet<string> | null;
}

/** This build's widgets that work in the portal — drag one onto the screen. */
export function WidgetPalette({ widgets, portalLabel, serverIds }: WidgetPaletteProps) {
  return (
    <>
      <div className="pane-h">
        <b>Widgets</b>
        <span className="dim small">{portalLabel}</span>
      </div>
      <div className="palette">
        {widgets.map((w) => (
          <div
            key={w.id}
            className="pal"
            draggable
            title="Drag onto the screen"
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_WIDGET, w.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <b>{w.label}</b>
            <span className="dim small">{w.category ?? 'Other'} · {w.id}@{w.version}</span>
            <span className="mono small dim">{requiresText(w)}</span>
            {serverIds && !serverIds.has(w.id) && (
              <span className="small warn">not on the registry server yet</span>
            )}
          </div>
        ))}
        {widgets.length === 0 && <div className="dim small pad-s">No registered widget works in {portalLabel} yet.</div>}
      </div>
    </>
  );
}
