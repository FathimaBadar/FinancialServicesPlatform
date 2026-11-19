/** Inline toast with an Undo affordance (§4.8): "Removed Widgets · Settings" + Undo. */
import { useEffect } from 'react';

export interface ToastProps {
  text: string;
  /** When present (an edit recorded in history) show the Undo button. */
  undoable: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export function Toast({ text, undoable, onUndo, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [text, onDismiss]);
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      {undoable && <button type="button" className="lnk" onClick={onUndo}>Undo</button>}
      <button type="button" className="lnk dim" aria-label="Dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}
