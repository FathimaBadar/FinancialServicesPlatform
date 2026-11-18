import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Input } from '../../ui/atoms';

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

/** Labelled input with hint + error wired through aria-describedby / aria-invalid. */
export function FormField({ label, hint, error, optional, className, ...input }: FormFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between text-[12px] font-semibold">
        <span>{label}</span>
        {optional && <span className="text-dim text-[11px] font-normal">Optional</span>}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(error && '!border-status-danger', input.disabled && 'opacity-60')}
        {...input}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[12px] text-status-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-dim mt-1 text-[12px]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
