import { Button, Chip } from '../../../ui/atoms';
import type { RoleView } from './model';

export interface RoleTableProps {
  roles: RoleView[];
  canManage: boolean;
  onOpen: (id: string) => void;
}

const HEAD = 'whitespace-nowrap px-5 py-3.5 text-left text-[10.5px] font-bold uppercase tracking-[.08em]';

/** The organization's roles: name, description, and Edit (View for read-only holders). */
export function RoleTable({ roles, canManage, onOpen }: RoleTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-[var(--color-action-secondary)] text-[var(--color-action-text)]">
          <tr>
            <th scope="col" className={HEAD}>Role name</th>
            <th scope="col" className={HEAD}>Description</th>
            <th scope="col" className={`${HEAD} !text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="bg-surface-sunken">
              <td className="border-t border-line px-5 py-3.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="mono text-[13px] font-semibold">{r.key}</span>
                  {r.status === 'PENDING_CREATE' ? <Chip tone="warn">Awaiting approval</Chip>
                    : r.pendingApprovalId ? <Chip tone="warn">Change pending</Chip>
                    : r.protectedRole ? <Chip tone="info">Built-in</Chip> : null}
                </span>
              </td>
              <td className="border-t border-line px-5 py-3.5 text-[13px]">{r.name}</td>
              <td className="border-t border-line px-5 py-3.5 text-right">
                <Button variant="ghost" data-action={canManage ? 'role.update' : undefined} onClick={() => onOpen(r.id)}
                  aria-label={`${canManage ? 'Edit' : 'View'} ${r.key}`}>
                  {canManage ? '✎ Edit' : 'View'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
