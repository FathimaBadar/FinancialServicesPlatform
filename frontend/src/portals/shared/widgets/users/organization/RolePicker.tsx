import { clsx } from 'clsx';
import type { RoleOption } from './model';

export interface RolePickerProps {
  options: RoleOption[] | undefined;
  loading: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  /** when set, the whole picker is read-only and this explains why */
  lockedReason?: string;
  error?: string;
}

/**
 * Checkbox cards for the organization's roles. Roles the actor may not grant/revoke
 * (permissions they don't hold) are shown but locked, with the reason.
 */
export function RolePicker({ options, loading, selected, onChange, lockedReason, error }: RolePickerProps) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <fieldset className="min-w-0" aria-describedby={error ? 'role-picker-err' : undefined}>
      <legend className="mb-1 text-[12px] font-semibold">Roles</legend>
      {lockedReason && <p className="text-dim mb-2 text-[12px]">{lockedReason}</p>}
      {loading && <div className="h-16 animate-pulse rounded-xl bg-raised" aria-label="Loading roles" />}
      {!loading && (options?.length ?? 0) === 0 && (
        <p className="text-dim text-[12px]">This organization has no roles defined yet. The user can be added without one.</p>
      )}
      <div className="grid gap-2">
        {options?.map((r) => {
          const checked = selected.includes(r.id);
          const disabled = Boolean(lockedReason) || !r.assignable;
          return (
            <label
              key={r.id}
              className={clsx(
                'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                checked ? 'border-line-strong bg-raised' : 'border-line bg-sunken',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-strong',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--portal-accent)]"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(r.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="text-dim block text-[12px]">
                  <span className="mono">{r.key}</span> · {r.permissionCount} permission{r.permissionCount === 1 ? '' : 's'}
                  {!r.assignable && ' · needs permissions you don’t hold'}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id="role-picker-err" className="mt-1 text-[12px] text-status-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
