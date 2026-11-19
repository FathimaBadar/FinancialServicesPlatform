/** Modal confirm for destructive edits (§4.8): menu delete, discard draft. Never a browser dialog. */
import { useEffect } from 'react';

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, destructive, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className={destructive ? 'btn danger' : 'btn primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
