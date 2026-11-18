import { useEffect } from 'react';
import { clsx } from 'clsx';

export interface Notice {
  id: number;
  kind: 'ok' | 'bad';
  text: string;
  undo?: { label: string; run: () => void };
}

export interface NoticeProps {
  notice: Notice | null;
  onDismiss: () => void;
}

/** Polite live region for action outcomes; success auto-dismisses, errors stay until closed. */
export function NoticeBar({ notice, onDismiss }: NoticeProps) {
  useEffect(() => {
    if (!notice || notice.kind === 'bad') return undefined;
    const t = window.setTimeout(onDismiss, notice.undo ? 8000 : 5000);
    return () => window.clearTimeout(t);
  }, [notice, onDismiss]);

  return (
    <div aria-live="polite" className="min-h-0">
      {notice && (
        <div
          role={notice.kind === 'bad' ? 'alert' : 'status'}
          className={clsx(
            'mb-3 flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px]',
            notice.kind === 'ok' ? 'fsp-chip-ok border-transparent' : 'fsp-chip-bad border-transparent',
          )}
        >
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.undo && (
            <button type="button" className="font-extrabold underline underline-offset-2" onClick={notice.undo.run}>
              {notice.undo.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="px-1 font-extrabold opacity-70 hover:opacity-100" onClick={onDismiss}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
