import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** rendered between header and body (e.g. a discard-changes prompt) */
  banner?: ReactNode;
  /** wide sheet (tabbed records); default 480px */
  wide?: boolean;
}

/**
 * Modal side sheet (full-screen on phones). Esc / backdrop close through `onClose`
 * (which may refuse while there are unsaved changes); focus returns to the opener.
 */
export function Drawer({ title, subtitle, onClose, children, banner, wide }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        // keep keyboard focus inside the sheet
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-line bg-panel shadow-2xl outline-none ${wide ? 'sm:max-w-[760px]' : 'sm:max-w-[480px]'}`}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="truncate text-lg">{title}</h2>
            {subtitle && <p className="text-dim mt-0.5 truncate text-[13px]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-dim grid h-8 w-8 place-items-center rounded-full border border-line text-lg leading-none hover:border-line-strong hover:text-[var(--color-text)]"
          >
            ×
          </button>
        </header>
        {banner}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
