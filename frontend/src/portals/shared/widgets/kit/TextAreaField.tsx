import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

/** Labelled multi-line input (reasons, notes) with hint + error wiring. */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, className, ...area }, ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold">{label}</label>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx('fsp-field min-h-[76px] resize-y py-2', error && '!border-status-danger')}
        {...area}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[12px] text-status-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-dim mt-1 text-[12px]">{hint}</p>
      ) : null}
    </div>
  );
});
