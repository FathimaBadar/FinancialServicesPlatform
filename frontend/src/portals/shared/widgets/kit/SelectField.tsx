import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  options: readonly { value: string; label: string }[];
  /** shown as the first, empty option */
  placeholder?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

/** Labelled select with hint + error wired through aria-describedby / aria-invalid. */
export function SelectField({ label, options, placeholder, hint, error, optional, className, ...select }: SelectFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between text-[12px] font-semibold">
        <span>{label}</span>
        {optional && <span className="text-dim text-[11px] font-normal">Optional</span>}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx('fsp-field cursor-pointer', error && '!border-status-danger', select.disabled && 'opacity-60')}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[12px] text-status-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-dim mt-1 text-[12px]">{hint}</p>
      ) : null}
    </div>
  );
}
