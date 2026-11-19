import { useState } from 'react';
import type { LayoutScreen } from './layout';

export interface ScreenInspectorProps {
  screen: LayoutScreen;
  route: string;
  resources: readonly string[];
  /** The page id is locked while it is part of the live layout. */
  idLocked: boolean;
  onChange: (patch: Partial<Pick<LayoutScreen, 'id' | 'label'>>) => void;
  onMove: (by: number) => void;
  onDelete: () => void;
}

/** The page inspector: label is the headline edit; id/route live under Details (§4.9). */
export function ScreenInspector({ screen, route, resources, idLocked, onChange, onMove, onDelete }: ScreenInspectorProps) {
  const [details, setDetails] = useState(false);
  return (
    <>
      <div className="pane-h">
        <b>Page</b>
        <span className="grow" />
        <button type="button" className="lnk" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="lnk" onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <button type="button" className="lnk bad" onClick={onDelete}>Delete page</button>
      </div>
      <label className={screen.label.trim() ? undefined : 'miss'}>
        Label
        <input value={screen.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <button type="button" className="lnk small" onClick={() => setDetails(!details)}>
        {details ? 'Hide details' : 'Details'} <span className="dim">{details ? '▾' : '▸'}</span>
      </button>
      {details && (
        <>
          <label className={idLocked ? 'locked' : undefined} title={idLocked ? 'This page is live — ids never change after publish (bookmarks/links depend on them)' : undefined}>
            Id (route segment){idLocked && <span className="small dim"> — locked (live)</span>}
            <input value={screen.id} disabled={idLocked} onChange={(e) => onChange({ id: e.target.value.trim().toLowerCase() })} />
          </label>
          <dl className="facts">
            <dt>route</dt>
            <dd className="mono">{route}</dd>
            <dt>shows with</dt>
            <dd className="mono">{resources.join(', ') || 'nothing placed yet'}</dd>
            <dt>widgets</dt>
            <dd>{screen.placedWidgets.length}</dd>
          </dl>
        </>
      )}
    </>
  );
}
