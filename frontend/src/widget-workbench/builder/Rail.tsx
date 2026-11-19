/**
 * The navigation rail (§4.2, §4.5): renders exactly like the portal sidebar (menus that
 * would not render are dimmed) but is live — click to open a page, double-click (or F2)
 * to rename inline, plus drag, ⚠ markers and a checks footer. Replaces MenuTree +
 * SidebarPreview + the findings list. Pages delete instantly (a toast offers Undo);
 * menus delete via a confirm dialog in the builder page, never silently.
 */
import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import type { Finding, PortalLayout } from './layout';
import { DND_MENU, DND_SCREEN, carries } from './dnd';
import type { Sel } from './selection';

export interface RailProps {
  livePortalLabel: string;
  sel: Sel;
  locked: boolean;
  publishedIds: ReadonlySet<string>;
  findings: readonly Finding[];
  layout: PortalLayout;
  /** A rename to start right away (fresh menus/pages) — consumed via onRenamed. */
  startRename: { kind: 'menu' | 'page'; m: number; s: number } | null;
  onRenamed: () => void;
  onSelect: (s: Sel) => void;
  onOpenScreen: (m: number, s: number) => void;
  onAddMenu: () => void;
  onAddPage: (m: number) => void;
  onDeletePage: (m: number, s: number) => void;
  onRename: (kind: 'menu' | 'page', m: number, s: number, label: string, prevLabel: string) => void;
  onMoveMenu: (from: number, to: number) => void;
  onMovePage: (from: { m: number; s: number }, to: { m: number; s: number }) => void;
}

interface RenameTarget {
  kind: 'menu' | 'page';
  m: number;
  s: number;
}

export function Rail({ sel, findings, publishedIds, locked, layout, livePortalLabel, startRename, onRenamed, ...cb }: RailProps) {
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    if (!startRename) return;
    setRenaming(startRename);
    onRenamed();
  }, [startRename, onRenamed]);

  const allow = (e: DragEvent, key: string, ...types: string[]) => {
    if (!carries(e, ...types)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(key);
  };
  const pageFrom = (e: DragEvent) => {
    const [m, s] = e.dataTransfer.getData(DND_SCREEN).split(':').map(Number);
    return Number.isInteger(m) && Number.isInteger(s) ? { m, s } : null;
  };

  const mark = (m: number, s?: number): Finding | undefined =>
    findings.find((f) => f.m === m && s === undefined ? true : f.s === s);

  const commitRename = (t: RenameTarget, value: string) => {
    setRenaming(null);
    const label = value.trim();
    const prev = t.kind === 'menu' ? layout.menus[t.m]?.label : layout.menus[t.m]?.screens[t.s]?.label;
    if (prev !== undefined && label && label !== prev) cb.onRename(t.kind, t.m, t.s, label, prev);
  };

  const renameInput = (t: RenameTarget, label: string) => (
    <input
      className="rail-edit"
      aria-label={t.kind === 'menu' ? 'Menu name' : 'Page name'}
      defaultValue={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commitRename(t, e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitRename(t, e.currentTarget.value);
        if (e.key === 'Escape') setRenaming(null);
        e.stopPropagation();
      }}
    />
  );

  return (
    <div className="rail">
      <div className="rail-scroll">
        <div className="dim small rail-hint">Sidebar as a {livePortalLabel} user sees it — this edits the real portal.</div>
        {layout.menus.map((m, mi) => {
          const menuSel = sel?.kind === 'menu' && sel.m === mi;
          const menuLocked = publishedIds.has(`m:${m.id}`);
          const mmark = mark(mi);
          const pagesOpen = !collapsed.has(m.id);
          return (
            <div
              key={`${m.id}:${mi}`}
              className={over === `m${mi}` ? 'rail-m-wrap drop-over' : 'rail-m-wrap'}
              onDragOver={(e) => allow(e, `m${mi}`, DND_MENU)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const from = Number(e.dataTransfer.getData(DND_MENU));
                if (Number.isInteger(from)) cb.onMoveMenu(from, mi);
              }}
            >
              <div
                className={menuSel ? 'rail-m sel' : 'rail-m'}
                onClick={() => cb.onSelect({ kind: 'menu', m: mi })}
                onDoubleClick={() => !menuLocked && setRenaming({ kind: 'menu', m: mi, s: -1 })}
              >
                <button
                  type="button"
                  className="rail-chev"
                  aria-label={pagesOpen ? `Collapse ${m.label}` : `Expand ${m.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((cur) => {
                      const n = new Set(cur);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    });
                  }}
                >
                  {pagesOpen ? '▾' : '▸'}
                </button>
                <span className="rail-ic" aria-hidden>{m.icon || '▤'}</span>
                {renaming?.kind === 'menu' && renaming.m === mi
                  ? renameInput(renaming, m.label)
                  : (
                    <span className={menuLocked ? 'lbl locked' : 'lbl'}>
                      {m.label}
                      {menuLocked && <span className="rail-lock" title="This menu is live — its id is immutable after publish">🔒</span>}
                    </span>
                  )}
                <span className="grow" />
                {mmark && <span className={mmark.level === 'error' ? 'm-dot bad' : 'm-dot warn'} title={mmark.text}>⚠</span>}
                {!locked && (
                  <button type="button" className="rail-plus dim small" title="Add a page to this menu" onClick={(e) => { e.stopPropagation(); cb.onAddPage(mi); }}>
                    + page
                  </button>
                )}
              </div>
              {pagesOpen && (
                <div className="rail-pages">
                  {m.screens.length === 0 && (
                    <div className="rail-page hint">Hidden from users until it has a page.</div>
                  )}
                  {m.screens.map((s, si) => {
                    const on = sel !== null && sel.kind !== 'menu' && sel.m === mi && sel.s === si;
                    const pmark = mark(mi, si);
                    const pageLocked = publishedIds.has(`p:${s.id}`);
                    return (
                      <div
                        key={`${s.id}:${si}`}
                        className={['rail-page', on ? 'sel' : '', over === `p${mi}:${si}` ? 'drop-over' : ''].filter(Boolean).join(' ')}
                        draggable={!renaming}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData(DND_SCREEN, `${mi}:${si}`);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => allow(e, `p${mi}:${si}`, DND_SCREEN)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOver(null);
                          const from = pageFrom(e);
                          if (from) cb.onMovePage(from, { m: mi, s: si });
                        }}
                        onClick={() => cb.onOpenScreen(mi, si)}
                        onDoubleClick={() => !pageLocked && setRenaming({ kind: 'page', m: mi, s: si })}
                      >
                        <span className="handle" title="Drag to reorder">⠿</span>
                        {renaming?.kind === 'page' && renaming.m === mi && renaming.s === si
                          ? renameInput(renaming, s.label)
                          : (
                            <span className={pageLocked ? 'lbl locked' : 'lbl'}>
                              {s.label}
                              {pageLocked && <span className="rail-lock" title="This page is live — its id is immutable after publish">🔒</span>}
                            </span>
                          )}
                        <span className="grow" />
                        {pmark && <span className={pmark.level === 'error' ? 'm-dot bad' : 'm-dot warn'} title={pmark.text}>⚠</span>}
                        <span className="rail-count small dim">{s.placedWidgets.length}</span>
                        {!pageLocked && !locked && (
                          <button
                            type="button"
                            className="row-x"
                            title="Delete this page"
                            onClick={(e) => { e.stopPropagation(); cb.onDeletePage(mi, si); }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="rail-add ghost small" disabled={locked} onClick={cb.onAddMenu}>+ Add menu</button>
      </div>
      <RailChecks findings={findings} onSelect={cb.onSelect} />
    </div>
  );
}

/** Footer (§4.5): how many live checks need attention, expandable, each item jumps to it. */
function RailChecks({ findings, onSelect }: { findings: readonly Finding[]; onSelect: (s: Sel) => void }) {
  const [open, setOpen] = useState(false);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  if (!findings.length) return null;
  return (
    <div className="rail-checks">
      <button type="button" className="lnk small" onClick={() => setOpen(!open)}>
        {errors.length ? <span className="bad">{errors.length} to fix</span> : <span>0 to fix</span>}
        {warnings.length > 0 && <span className="warn"> · {warnings.length} suggestions</span>}
        <span className="dim"> {open ? '▾' : '▸'}</span>
      </button>
      {open && findings.map((x, i) => (
        <div key={i} className={x.level === 'error' ? 'small bad' : 'small warn'}>
          {(() => {
            const m = x.m, s = x.s;
            if (m === undefined) return <b>{x.where}</b>;
            return (
              <button
                type="button"
                className="lnk"
                onClick={() => onSelect(s !== undefined && s !== null ? { kind: 'screen', m, s } : { kind: 'menu', m })}
              >
                {x.where}
              </button>
            );
          })()}
          : {x.text}
        </div>
      ))}
    </div>
  );
}
