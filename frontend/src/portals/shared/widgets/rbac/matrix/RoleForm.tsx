import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Chip } from '../../../ui/atoms';
import { FormField } from '../../kit/FormField';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { PermissionMatrix } from './PermissionMatrix';
import { SectionHeading } from './SectionHeading';
import { newRoleSchema } from './model';
import type { NewRoleValues, PermissionDef, RoleView } from './model';
import type { PortalId } from '../../../web-core/menu';

export interface RoleFormProps {
  /** absent = create a new role */
  role: RoleView | null;
  /** whose sidebar the permissions matrix mirrors */
  portal: PortalId;
  catalog: PermissionDef[];
  held: ReadonlySet<string>;
  canManage: boolean;
  busy: boolean;
  problem: string | null;
  onCancel: () => void;
  onCreate: (v: NewRoleValues, permissionKeys: string[]) => void;
  onRequestChange: (permissionKeys: string[]) => void;
  onRequestDelete: () => void;
}

type Errors = Partial<Record<keyof NewRoleValues, string>>;

/**
 * Maker surface for one role (create or edit): Role Details + Permissions Matrix. Nothing applies
 * until a checker approves in Approvals — there is no approve control here (ui-std §5.2).
 */
export function RoleForm({ role, portal, catalog, held, canManage, busy, problem, onCancel, onCreate, onRequestChange, onRequestDelete }: RoleFormProps) {
  const creating = role === null;
  const [values, setValues] = useState<NewRoleValues>({ key: role?.key ?? '', name: role?.name ?? '' });
  const [errors, setErrors] = useState<Errors>({});
  const [draft, setDraft] = useState<Set<string>>(() => new Set(role?.permissionKeys ?? []));
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setValues({ key: role?.key ?? '', name: role?.name ?? '' });
    setDraft(new Set(role?.permissionKeys ?? []));
    setConfirmDelete(false);
  }, [role?.id, role?.version, role?.key, role?.name, role?.permissionKeys]);

  const base = useMemo(() => role?.permissionKeys ?? [], [role?.permissionKeys]);
  const added = useMemo(() => [...draft].filter((k) => !base.includes(k)).sort(), [draft, base]);
  const removed = useMemo(() => base.filter((k) => !draft.has(k)).sort(), [draft, base]);
  const pending = role !== null && (role.status === 'PENDING_CREATE' || role.pendingApprovalId !== null);
  const editable = canManage && !pending && role?.scope !== 'PLATFORM';

  const check = (only?: keyof NewRoleValues): NewRoleValues | null => {
    const r = newRoleSchema.safeParse(values);
    const next: Errors = {};
    if (!r.success) for (const issue of r.error.issues) next[issue.path[0] as keyof NewRoleValues] ??= issue.message;
    setErrors((e) => (only ? { ...e, [only]: next[only] } : next));
    return r.success ? r.data : null;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    if (creating) {
      const ok = check();
      if (ok) onCreate(ok, [...draft].sort());
    } else if (added.length + removed.length > 0) {
      onRequestChange([...draft].sort());
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-5xl gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button type="button" variant="ghost" onClick={onCancel}>← Roles</Button>
          <h1 className="mt-2 text-[22px] font-bold">{creating ? 'Create Role' : `Edit ${role.key}`}</h1>
        </div>
        {role?.protectedRole && <Chip tone="info">Built-in — can be edited, not deleted</Chip>}
      </div>

      {pending && (
        <Alert kind="warn">
          {role.status === 'PENDING_CREATE' ? 'This role is awaiting approval to be created.' : `A ${role.pendingOperation === 'ROLE_DELETE' ? 'deletion' : 'permission change'} is awaiting approval.`}
          {' '}Reference <span className="mono">{role.pendingApprovalId?.slice(0, 8)}</span> ·{' '}
          <Link className="underline" to="/approvals">open approvals</Link>
        </Alert>
      )}
      {!canManage && <Alert kind="info">You can view roles. Changing them needs the role.manage permission.</Alert>}

      <section aria-labelledby="role-details">
        <SectionHeading id="role-details" title="Role Details" subtitle={creating ? 'Basic identification for the new role.' : 'Identification of this role. It cannot be renamed.'} />
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
          <FormField label="Role Name *" placeholder="e.g. TELLER_SUPERVISOR" value={values.key} error={errors.key}
            hint={creating ? 'A–Z, 0–9 and _ — the role’s unique key.' : undefined}
            disabled={!creating || !editable} autoComplete="off"
            onChange={(e) => setValues((v) => ({ ...v, key: e.target.value }))} onBlur={() => creating && check('key')} />
          <FormField label="Role Description *" placeholder="Brief description of responsibilities" value={values.name} error={errors.name}
            disabled={!creating || !editable} autoComplete="off"
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} onBlur={() => creating && check('name')} />
        </div>
      </section>

      <section aria-labelledby="role-matrix">
        <SectionHeading id="role-matrix" title="Permissions Matrix" subtitle="One row per menu link. Active shows the link in the menu; the other boxes grant what it can do." />
        <PermissionMatrix portal={portal} catalog={catalog} selected={draft} held={held} editable={editable} onChange={setDraft} />
      </section>

      {problem && <Alert kind="bad">{problem}</Alert>}

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-dim text-[12px]">
            {creating ? `${draft.size} permission(s) selected. A checker approves the new role before it can be assigned.`
              : added.length + removed.length === 0 ? 'No changes yet.'
              : `${added.length} to add${added.length ? ` (${added.join(', ')})` : ''} · ${removed.length} to remove${removed.length ? ` (${removed.join(', ')})` : ''}`}
          </div>
          <div className="flex gap-2">
            {!creating && !role.protectedRole && (
              <Button type="button" variant="ghost" disabled={busy || role.assignedCount > 0} data-action="role.delete"
                title={role.assignedCount > 0 ? 'Unassign this role from everyone first' : undefined}
                onClick={() => setConfirmDelete(true)}>
                Delete role
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" data-action={creating ? 'role.create' : 'role.update'}
              disabled={busy || (!creating && added.length + removed.length === 0)}>
              {busy ? 'Sending…' : creating ? 'Submit for approval' : 'Request change'}
            </Button>
          </div>
        </div>
      )}
      {confirmDelete && role && (
        <InlineConfirm title={`Delete ${role.key}?`} confirmLabel="Request deletion" tone="danger" busy={busy}
          onCancel={() => setConfirmDelete(false)} onConfirm={onRequestDelete}>
          A checker must approve the deletion before the role disappears.
        </InlineConfirm>
      )}
    </form>
  );
}
