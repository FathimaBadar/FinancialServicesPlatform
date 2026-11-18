/**
 * rbac.matrix — an organization's roles and what each may do (GAP-1). Selected role lives in the
 * URL (?role=). Makers REQUEST changes; checkers decide them in Approvals.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWidgetRuntime } from '../../core/runtime';
import { Button, PageHeader, Panel } from '../../../ui/atoms';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { StatePanel } from '../../kit/StatePanel';
import { isForbidden, toProblem } from '../../kit/problem';
import { NewRoleForm } from './NewRoleForm';
import { RoleEditor } from './RoleEditor';
import { RoleList } from './RoleList';
import { useCatalog, useRoleCommand, useRoles } from './model';
import type { RoleCommand } from './model';

export function RbacMatrix() {
  const { port, context } = useWidgetRuntime();
  const orgId = context.orgId ?? '';
  const [params, setParams] = useSearchParams();
  const roles = useRoles(port, orgId);
  const catalog = useCatalog(port);
  const cmd = useRoleCommand(port, orgId);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dismiss = useCallback(() => setNotice(null), []);
  const held = useMemo(() => new Set(context.permissions), [context.permissions]);
  const canManage = held.has('role.manage');

  const list = roles.data ?? [];
  const selectedId = params.get('role') ?? list[0]?.id ?? null;
  const selected = list.find((r) => r.id === selectedId) ?? null;
  const select = (id: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    n.set('role', id);
    return n;
  }, { replace: true });

  const run = (c: RoleCommand, done: string) => cmd.mutate(c, {
    onSuccess: (res) => {
      setNotice({ id: Date.now(), kind: 'ok', text: `${done} Awaiting a checker (reference ${res.pendingApprovalId.slice(0, 8)}).` });
      if (c.kind === 'create') {
        setCreating(false);
        select(res.roleId);
      }
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

  return (
    <Panel className="p-4">
      <PageHeader
        title="Roles and permissions"
        subtitle="Changes are four-eyes: you request, a checker approves."
        actions={canManage && !creating ? <Button variant="primary" onClick={() => { cmd.reset(); setCreating(true); }}>New role</Button> : undefined}
      />
      <NoticeBar notice={notice} onDismiss={dismiss} />
      {creating && (
        <div className="mb-4">
          <NewRoleForm busy={cmd.isPending} onCancel={() => setCreating(false)}
            onSubmit={(v) => run({ kind: 'create', key: v.key, name: v.name, permissionKeys: [] }, `Role ${v.key} requested.`)} />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <RoleList roles={list} selectedId={selectedId} onSelect={select} />
        {selected ? (
          <RoleEditor
            role={selected}
            catalog={catalog.data ?? []}
            held={held}
            canManage={canManage}
            busy={cmd.isPending}
            problem={cmd.isError ? toProblem(cmd.error).message : null}
            onRequestChange={(keys) => run({ kind: 'update', role: selected, permissionKeys: keys }, 'Change requested.')}
            onRequestDelete={() => run({ kind: 'delete', role: selected }, `Deletion of ${selected.key} requested.`)}
          />
        ) : (
          <StatePanel kind="empty" title="No roles yet" />
        )}
      </div>
    </Panel>
  );
}
