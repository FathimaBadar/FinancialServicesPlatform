import { useState } from 'react';
import type { LayoutMenu } from './layout';

export interface MenuInspectorProps {
  menu: LayoutMenu;
  /** The menu id is locked while it is part of the live layout. */
  idLocked: boolean;
  onChange: (patch: Partial<Pick<LayoutMenu, 'id' | 'label' | 'icon'>>) => void;
  onMove: (by: number) => void;
  onDelete: () => void;
}

/** The menu inspector: label and icon are the headline edits; the id lives under Details (§4.9). */
export function MenuInspector({ menu, idLocked, onChange, onMove, onDelete }: MenuInspectorProps) {
  const [details, setDetails] = useState(false);
  return (
    <>
      <div className="pane-h">
        <b>Menu</b>
        <span className="grow" />
        <button type="button" className="lnk" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="lnk" onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <button type="button" className="lnk bad" onClick={onDelete}>Delete menu</button>
      </div>
      <label className={menu.label.trim() ? undefined : 'miss'}>
        Label
        <input value={menu.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>
        Icon
        <input value={menu.icon ?? ''} onChange={(e) => onChange({ icon: e.target.value.trim() || undefined })} placeholder="optional" />
      </label>
      <button type="button" className="lnk small" onClick={() => setDetails(!details)}>
        {details ? 'Hide details' : 'Details'} <span className="dim">{details ? '▾' : '▸'}</span>
      </button>
      {details && (
        <>
          <label className={idLocked ? 'locked' : undefined} title={idLocked ? 'This menu is live — ids never change after publish (bookmarks/links depend on them)' : undefined}>
            Id (route segment){idLocked && <span className="small dim"> — locked (live)</span>}
            <input value={menu.id} disabled={idLocked} onChange={(e) => onChange({ id: e.target.value.trim().toLowerCase() })} />
          </label>
          <dl className="facts">
            <dt>pages</dt>
            <dd>{menu.screens.length}</dd>
          </dl>
        </>
      )}
    </>
  );
}
