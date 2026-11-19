/**
 * The add-widget flow (§4.4): a searchable drawer with keyboard picking. Drag still
 * works, but is never required — click or Enter inserts at the active slot.
 */
import { useEffect, useMemo, useState } from 'react';
import type { WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { requiresText } from '../model';
import { DND_WIDGET } from './dnd';

export interface WidgetPickerProps {
  open: boolean;
  widgets: readonly WidgetDef[];
  /** Insert position on the open page (or null = append). */
  insertAt: number | null;
  serverIds: ReadonlySet<string> | null;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function WidgetPicker({ open, widgets, insertAt, serverIds, onPick, onClose }: WidgetPickerProps) {
  const [needle, setNeedle] = useState('');
  const [hi, setHi] = useState(0);
  useEffect(() => {
    if (open) {
      setNeedle('');
      setHi(0);
    }
  }, [open]);

  const list = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return q ? widgets.filter((w) => `${w.label} ${w.category ?? ''} ${w.id}`.toLowerCase().includes(q)) : widgets;
  }, [widgets, needle]);

  useEffect(() => {
    setHi(0);
  }, [needle]);

  const groups = useMemo(() => {
    const g = new Map<string, WidgetDef[]>();
    for (const w of list) {
      const k = w.category ?? 'Other';
      (g.get(k) ?? g.set(k, []).get(k)!).push(w);
    }
    return [...g.entries()];
  }, [list]);

  if (!open) return null;
  const pick = (w: WidgetDef | undefined) => {
    if (w) onPick(w.id);
  };
  const at = insertAt === null ? 'end of the page' : `before widget ${insertAt + 1}`;

  return (
    <div className="picker-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="picker" role="dialog" aria-modal="true" aria-label="Add a widget">
        <div className="picker-h">
          <b>Add a widget</b>
          <span className="dim small">goes {at}</span>
          <input
            autoFocus
            type="search"
            placeholder="Search widgets…"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); pick(list[hi]); }
            }}
          />
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <div className="picker-body">
          {groups.map(([cat, ws]) => (
            <div key={cat} className="picker-cat">
              <div className="grp">{cat}</div>
              {ws.map((w) => {
                const i = list.indexOf(w);
                return (
                  <button
                    type="button"
                    key={w.id}
                    className={i === hi ? 'pick on' : 'pick'}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(w)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_WIDGET, w.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <span className="pick-l"><b>{w.label}</b>{w.description && <span className="dim small"> — {w.description}</span>}</span>
                    <span className="mono small dim">{w.id}@{w.version} · {requiresText(w) || 'no permission needed'}</span>
                    {serverIds && !serverIds.has(w.id) && <span className="small warn">not on the registry server yet</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {list.length === 0 && <div className="dim small pad">No widget matches “{needle}”.</div>}
        </div>
        <div className="picker-f small dim">↑↓ to move · Enter to add · Esc to close · drag still works</div>
      </div>
    </div>
  );
}
