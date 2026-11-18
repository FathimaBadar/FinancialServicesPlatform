import { clsx } from 'clsx';
import { Chip } from '../../../ui/atoms';
import type { RoleView } from './model';

export interface RoleListProps {
  roles: RoleView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RoleList({ roles, selectedId, onSelect }: RoleListProps) {
  return (
    <ul className="grid gap-1.5" aria-label="Roles">
      {roles.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            aria-current={selectedId === r.id ? 'true' : undefined}
            className={clsx('w-full rounded-xl border px-3 py-2 text-left',
              selectedId === r.id ? 'border-line-strong bg-raised' : 'border-line hover:bg-raised')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="mono truncate text-[12.5px] font-bold">{r.key}</span>
              {r.status === 'PENDING_CREATE' ? <Chip tone="warn">Awaiting approval</Chip>
                : r.pendingApprovalId ? <Chip tone="warn">Change pending</Chip>
                : r.protectedRole ? <Chip tone="info">Built-in</Chip> : null}
            </div>
            <div className="text-dim mt-0.5 truncate text-[12px]">
              {r.name} · {r.permissionKeys.length} permissions · {r.assignedCount} people
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
