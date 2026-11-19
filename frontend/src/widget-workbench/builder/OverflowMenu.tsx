/** The ⋯ overflow menu (§4.9): low-frequency actions (Export, Discard draft) live here. */
import { useEffect, useRef, useState } from 'react';

export interface MenuEntry {
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

export function OverflowMenu({ items }: { items: readonly MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="ovm" ref={ref}>
      <button type="button" className="btn" aria-label="More actions" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="ovm-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={it.destructive ? 'ovm-item bad' : 'ovm-item'}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
