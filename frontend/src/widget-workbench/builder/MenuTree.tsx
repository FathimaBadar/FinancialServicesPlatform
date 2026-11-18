import { useState } from 'react';
import type { DragEvent } from 'react';
import { DND_MENU, DND_SCREEN, carries } from './dnd';
import type { PortalLayout } from './layout';
import type { Sel } from './selection';

export interface MenuTreeProps {
  layout: PortalLayout;
  sel: Sel;
  onSelect: (s: Sel) => void;
  onAddMenu: () => void;
  onAddScreen: (mi: number) => void;
  onMoveMenu: (from: number, to: number) => void;
  onMoveScreen: (from: { m: number; s: number }, to: { m: number; s: number }) => void;
}

/** Menus → submenus (screens); drag ⠿ to reorder menus, drag submenus within or across menus. */
export function MenuTree({ layout, sel, onSelect, onAddMenu, onAddScreen, onMoveMenu, onMoveScreen }: MenuTreeProps) {
  const [over, setOver] = useState<string | null>(null);

  const allow = (e: DragEvent, key: string, ...types: string[]) => {
    if (!carries(e, ...types)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(key);
  };
  const screenFrom = (e: DragEvent) => {
    const [m, s] = e.dataTransfer.getData(DND_SCREEN).split(':').map(Number);
    return Number.isInteger(m) && Number.isInteger(s) ? { m, s } : null;
  };

  return (
    <>
      <div className="pane-h">
        <b>Menus</b>
        <span className="grow" />
        <button type="button" className="btn" onClick={onAddMenu}>+ menu</button>
      </div>
      <div className="tree">
        {layout.menus.map((m, mi) => {
          const menuSel = sel?.kind === 'menu' && sel.m === mi;
          return (
            <div
              key={`${m.id}:${mi}`}
              className={over === `m${mi}` ? 'tm drop-over' : 'tm'}
              onDragOver={(e) => allow(e, `m${mi}`, DND_MENU)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const from = Number(e.dataTransfer.getData(DND_MENU));
                if (Number.isInteger(from)) onMoveMenu(from, mi);
              }}
            >
              <div className={menuSel ? 'tm-row sel' : 'tm-row'} onClick={() => onSelect({ kind: 'menu', m: mi })}>
                <span
                  className="handle"
                  title="Drag to reorder"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MENU, String(mi));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  ⠿
                </span>
                {m.icon && <span aria-hidden>{m.icon}</span>}
                <span className="lbl">{m.label || <span className="warn">(no label)</span>}</span>
                <span className="grow" />
                <button
                  type="button"
                  className="lnk"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddScreen(mi);
                  }}
                >
                  + sub
                </button>
              </div>
              <div
                className={over === `s${mi}` ? 'subs drop-over' : 'subs'}
                onDragOver={(e) => allow(e, `s${mi}`, DND_SCREEN)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(null);
                  const from = screenFrom(e);
                  if (from) onMoveScreen(from, { m: mi, s: m.screens.length });
                }}
              >
                {m.screens.map((s, si) => {
                  const on = sel !== null && sel.kind !== 'menu' && sel.m === mi && sel.s === si;
                  return (
                    <div
                      key={`${s.id}:${si}`}
                      className={['ts', on ? 'sel' : '', over === `s${mi}:${si}` ? 'drop-over' : ''].filter(Boolean).join(' ')}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData(DND_SCREEN, `${mi}:${si}`);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => allow(e, `s${mi}:${si}`, DND_SCREEN)}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver(null);
                        const from = screenFrom(e);
                        if (from) onMoveScreen(from, { m: mi, s: si });
                      }}
                      onClick={() => onSelect({ kind: 'screen', m: mi, s: si })}
                    >
                      <span className="handle">⠿</span>
                      <span className="lbl">{s.label || <span className="warn">(no label)</span>}</span>
                      <span className="grow" />
                      <span className="dim small">{s.placedWidgets.length}</span>
                    </div>
                  );
                })}
                {m.screens.length === 0 && <div className="dim small pad-s">No submenus: core rejects this menu.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
