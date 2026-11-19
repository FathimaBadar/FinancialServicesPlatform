/**
 * rbac.matrix — an organization's roles and what each may do (GAP-1). The view lives in the URL:
 * no ?role → the roles table; ?role=new → Create Role; ?role=<id> → that role's details + matrix.
 * Makers REQUEST changes; checkers decide them in Approvals.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWidgetRuntime } from '../../core/runtime';
import { useSession } from '../../../web-core/session-core';
import type { PortalId } from '../../../web-core/menu';
import { Button, PageHeader, Panel } from '../../../ui/atoms';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { StatePanel } from '../../kit/StatePanel';
import { isForbidden, toProblem } from '../../kit/problem';
import { RoleForm } from './RoleForm';
import { RoleTable } from './RoleTable';
import { useCatalog, useRoleCommand, useRoles } from './model';
import type { RoleCommand } from './model';

const NEW = 'new';

export function RbacMatrix() {
  const { port, context } = useWidgetRuntime();
  const orgId = context.orgId ?? '';
  const [params, setParams] = useSearchParams();
  const roles = useRoles(port, orgId);
  const catalog = useCatalog(port);
  const cmd = useRoleCommand(port, orgId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismiss = useCallback(() => setNotice(null), []);
  const held = useMemo(() => new Set(context.permissions), [context.permissions]);
  const canManage = held.has('role.manage');
  // the matrix mirrors the sidebar of the portal this org's users sign in to: the admin console for
  // the platform's own roles, the org portals for a tenant's (also when the admin acts as one)
  const { actAs } = useSession();
  const menuPortal: PortalId = context.portal === 'PLATFORM' && !actAs ? 'platform' : 'org';

  const list = roles.data ?? [];
  const view = params.get('role');
  const open = useCallback((id: string | null) => {
    cmd.reset();
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('role', id);
      else n.delete('role');
      return n;
    });
  }, [cmd, setParams]);

  const run = (c: RoleCommand, done: string) => cmd.mutate(c, {
    onSuccess: (res) => {
      setNotice({ id: Date.now(), kind: 'ok', text: `${done} Awaiting a checker (reference ${res.pendingApprovalId.slice(0, 8)}).` });
      open(c.kind === 'create' ? res.roleId : c.kind === 'delete' ? null : c.role.id);
    },
  });

  if (roles.isPending || catalog.isPending) return <StatePanel kind="loading" title="Loading roles" />;
  if (roles.isError) {
    return isForbidden(roles.error)
      ? <StatePanel kind="forbidden" title="Not allowed here" hint="Viewing roles needs role.view or role.manage." />
      : <StatePanel kind="error" title="Couldn’t load roles" hint={toProblem(roles.error).message} onRetry={() => void roles.refetch()} />;
  }
  if (catalog.isError) {
    return <StatePanel kind="error" title="Couldn’t load the permission catalog" hint={toProblem(catalog.error).message} onRetry={() => void catalog.refetch()} />;
  }

  const selected = view && view !== NEW ? list.find((r) => r.id === view) ?? null : null;
  const formRole = view === NEW && canManage ? null : selected;
  const showForm = (view === NEW && canManage) || selected !== null;

  return (
    <Panel className="p-4 sm:p-6">
      <NoticeBar notice={notice} onDismiss={dismiss} />
      {showForm ? (
        <RoleForm
          key={formRole?.id ?? NEW}
          role={formRole}
          portal={menuPortal}
          catalog={catalog.data ?? []}
          held={held}
          canManage={canManage}
          busy={cmd.isPending}
          problem={cmd.isError ? toProblem(cmd.error).message : null}
          onCancel={() => open(null)}
          onCreate={(v, keys) => run({ kind: 'create', key: v.key, name: v.name, permissionKeys: keys }, `Role ${v.key} requested.`)}
          onRequestChange={(keys) => formRole && run({ kind: 'update', role: formRole, permissionKeys: keys }, 'Change requested.')}
          onRequestDelete={() => formRole && run({ kind: 'delete', role: formRole }, `Deletion of ${formRole.key} requested.`)}
        />
      ) : (
        <div className="mx-auto max-w-5xl">
          <PageHeader
            title="Roles"
            subtitle="Manage system roles and access levels. Changes are four-eyes: you request, a checker approves."
            actions={canManage ? <Button variant="primary" data-action="role.create" onClick={() => open(NEW)}>+ Create Role</Button> : undefined}
          />
          {view && view !== NEW && <div className="mb-3"><StatePanel kind="empty" title="That role no longer exists" /></div>}
          {list.length ? <RoleTable roles={list} canManage={canManage} onOpen={open} /> : <StatePanel kind="empty" title="No roles yet" />}
        </div>
      )}
    </Panel>
  );
}
