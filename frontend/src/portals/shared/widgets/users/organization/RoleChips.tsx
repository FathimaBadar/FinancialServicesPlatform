import { Chip } from '../../../ui/atoms';
import type { RoleRef } from './model';

export interface RoleChipsProps {
  roles: RoleRef[];
  /** show at most this many, then "+n" */
  max?: number;
}

/** Compact role summary for list rows. */
export function RoleChips({ roles, max = 2 }: RoleChipsProps) {
  if (roles.length === 0) return <span className="text-dim text-xs">No roles</span>;
  const shown = roles.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((r) => (
        <Chip key={r.id} tone="accent">{r.name}</Chip>
      ))}
      {roles.length > shown.length && <Chip>+{roles.length - shown.length}</Chip>}
    </span>
  );
}
