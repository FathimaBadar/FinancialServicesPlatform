import { useState } from 'react';
import type { LayoutMenu } from './layout';
import { ICON_CHOICES } from './icons';

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
  const [browsing, setBrowsing] = useState(false);
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
      <div className="ic-row">
        <label>
          Icon
          <input value={menu.icon ?? ''} onChange={(e) => onChange({ icon: e.target.value.trim() || undefined })} placeholder="optional" />
        </label>
        <button
          type="button"
          className="lnk small"
          onClick={() => setBrowsing(!browsing)}
          aria-expanded={browsing}
          aria-controls="menu-icon-grid"
        >
          {browsing ? 'Hide' : 'Browse'} <span className="dim">{browsing ? '▾' : '▸'}</span>
        </button>
      </div>
      {browsing && (
        <div id="menu-icon-grid" className="icon-grid" role="listbox" aria-label="Menu icon choices">
          <button
            type="button"
            role="option"
            aria-selected={!menu.icon}
            aria-label="No icon — sidebar falls back to the default glyph"
            title="No icon (sidebar falls back to ▤)"
            className={`icon-cell${menu.icon ? '' : ' sel'}`}
            onClick={() => onChange({ icon: undefined })}
          >
            <span aria-hidden>—</span>
          </button>
          {ICON_CHOICES.map((choice) => (
            <button
              key={choice.glyph}
              type="button"
              role="option"
              aria-selected={menu.icon === choice.glyph}
              aria-label={choice.usedFor}
              title={choice.usedFor}
              className={`icon-cell${menu.icon === choice.glyph ? ' sel' : ''}`}
              onClick={() => onChange({ icon: choice.glyph })}
            >
              <span aria-hidden>{choice.glyph}</span>
            </button>
          ))}
        </div>
      )}
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
