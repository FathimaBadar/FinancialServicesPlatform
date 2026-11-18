import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../ui/atoms';

export interface InlineConfirmProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-place confirmation (never window.confirm): states the consequence, defaults focus to
 * Cancel so Enter cannot fire a destructive action by accident.
 */
export function InlineConfirm({ title, children, confirmLabel, tone, busy, onConfirm, onCancel }: InlineConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div role="alertdialog" aria-label={title} className="rounded-xl border border-line-strong bg-raised p-4">
      <div className="text-sm font-extrabold">{title}</div>
      <div className="text-dim mt-1 text-[13px] leading-relaxed">{children}</div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
