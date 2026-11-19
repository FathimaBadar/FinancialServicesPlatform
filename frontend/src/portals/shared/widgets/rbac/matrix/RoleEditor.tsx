import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Chip, KvPair } from '../../../ui/atoms';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { PermissionChecklist } from './PermissionChecklist';
import type { PermissionDef, RoleView } from './model';

export interface RoleEditorProps {
  role: RoleView;
  catalog: PermissionDef[];
  held: ReadonlySet<string>;
  canManage: boolean;
  busy: boolean;
  problem: string | null;
  onRequestChange: (keys: string[]) => void;
  onRequestDelete: () => void;
}

/**
 * Maker surface for ONE role: edit the checklist, then "Request change" — nothing applies until a
 * checker approves (the pending banner names the approval reference). No approve control here.
 */
export function RoleEditor({ role, catalog, held, canManage, busy, problem, onRequestChange, onRequestDelete }: RoleEditorProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(role.permissionKeys));
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setDraft(new Set(role.permissionKeys));
    setConfirmDelete(false);
  }, [role.id, role.version, role.permissionKeys]);

  const added = useMemo(() => [...draft].filter((k) => !role.permissionKeys.includes(k)).sort(), [draft, role.permissionKeys]);
  const removed = useMemo(() => role.permissionKeys.filter((k) => !draft.has(k)).sort(), [draft, role.permissionKeys]);
  const pending = role.status === 'PENDING_CREATE' || role.pendingApprovalId !== null;
  const editable = canManage && !pending && role.scope !== 'PLATFORM';
  const toggle = (k: string) => setDraft((d) => {
    const n = new Set(d);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <KvPair label="Role" mono>{role.key}</KvPair>
          <KvPair label="Name">{role.name}</KvPair>
          <KvPair label="People">{role.assignedCount}</KvPair>
          <KvPair label="Version" mono>{role.version}</KvPair>
        </div>
        {role.protectedRole && <Chip tone="info">Built-in — can be edited, not deleted</Chip>}
      </div>

      {pending && (
        <div className="mt-3">
          <Alert kind="warn">
            {role.status === 'PENDING_CREATE' ? 'This role is awaiting approval to be created.' : `A ${role.pendingOperation === 'ROLE_DELETE' ? 'deletion' : 'permission change'} is awaiting approval.`}
            {' '}Reference <span className="mono">{role.pendingApprovalId?.slice(0, 8)}</span> ·{' '}
            <Link className="underline" to="/approvals">open approvals</Link>
          </Alert>
        </div>
      )}
      {!canManage && <div className="mt-3"><Alert kind="info">You can view roles. Changing them needs the role.manage permission.</Alert></div>}

      <div className="mt-4">
        <PermissionChecklist catalog={catalog} selected={draft} held={held} editable={editable} onToggle={toggle} />
      </div>

      {problem && <div className="mt-3"><Alert kind="bad">{problem}</Alert></div>}

      {editable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-dim text-[12px]">
            {added.length + removed.length === 0 ? 'No changes yet.'
              : `${added.length} to add${added.length ? ` (${added.join(', ')})` : ''} · ${removed.length} to remove${removed.length ? ` (${removed.join(', ')})` : ''}`}
          </div>
          <div className="flex gap-2">
            {!role.protectedRole && (
              <Button variant="ghost" disabled={busy || role.assignedCount > 0} data-action="role.delete"
                title={role.assignedCount > 0 ? 'Unassign this role from everyone first' : undefined}
                onClick={() => setConfirmDelete(true)}>
                Delete role
              </Button>
            )}
            <Button variant="primary" disabled={busy || added.length + removed.length === 0} data-action="role.update"
              onClick={() => onRequestChange([...draft].sort())}>
              {busy ? 'Sending…' : 'Request change'}
            </Button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="mt-3">
          <InlineConfirm title={`Delete ${role.key}?`} confirmLabel="Request deletion" tone="danger" busy={busy}
            onCancel={() => setConfirmDelete(false)} onConfirm={onRequestDelete}>
            A checker must approve the deletion before the role disappears.
          </InlineConfirm>
        </div>
      )}
    </div>
  );
}
