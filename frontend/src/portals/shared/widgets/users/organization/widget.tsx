/**
 * users.organization component — list · search/filter · view · add · modify ·
 * deactivate · activate · remove, URL-backed state per ui-std §7.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWidgetRuntime } from '../../core/runtime';
import { useSession } from '../../../web-core/session-core';
import { Alert, Button, EmptyState, Panel, PageHeader } from '../../../ui/atoms';
import { UserDetails } from './UserDetails';
import { Drawer } from '../../kit/Drawer';
import { UserForm } from './UserForm';
import { UserList } from './UserList';
import { UserListSkeleton } from './UserListSkeleton';
import { NoticeBar } from '../../kit/Notice';
import type { Notice } from '../../kit/Notice';
import { UserToolbar } from './UserToolbar';
import {
  matchesFilter, matchesQuery, STATUS_FILTERS, toProblem, useOrgOptions, useRoleOptions, useUserCommand, useUserList,
} from './model';
import type { StatusFilter, UserCommand, UserFormValues, UserRow } from './model';

const STATUS_IDS = STATUS_FILTERS.map((f) => f.id);

export function UsersOrganization() {
  const { port, context } = useWidgetRuntime();
  const session = useSession();
  const meId = session.user?.userId ?? null;
  const rootOrgId = context.orgId ?? '';

  // ---- URL state: ?org= &q= &status= &user=<id|new> &edit=1
  const [params, setParams] = useSearchParams();
  const orgId = params.get('org') ?? rootOrgId;
  const query = params.get('q') ?? '';
  const statusParam = params.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam && STATUS_IDS.includes(statusParam) ? statusParam : 'current';
  const openId = params.get('user');
  const editing = params.get('edit') === '1';

  const patch = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(next)) {
            if (v === null || v === '') n.delete(k);
            else n.set(k, v);
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  // ---- server state
  const orgs = useOrgOptions(port, rootOrgId);
  const list = useUserList(port, orgId);
  const formOpen = openId === 'new' || editing;
  const roles = useRoleOptions(port, orgId, formOpen);
  const cmd = useUserCommand(port, orgId);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const say = (kind: Notice['kind'], text: string, undo?: Notice['undo']) =>
    setNotice({ id: Date.now(), kind, text, undo });

  const users = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { current: 0, ACTIVE: 0, DISABLED: 0, ARCHIVED: 0 };
    for (const u of users) for (const f of STATUS_IDS) if (matchesFilter(u, f)) c[f] += 1;
    return c;
  }, [users]);
  const visible = useMemo(
    () => users.filter((u) => matchesFilter(u, status) && matchesQuery(u, query.trim())),
    [users, status, query],
  );
  const openUser: UserRow | undefined = openId && openId !== 'new' ? users.find((u) => u.id === openId) : undefined;
  const orgName = orgs.data?.find((o) => o.id === orgId)?.legalName ?? session.user?.tenantName ?? 'this organization';

  // ---- drawer navigation
  const open = (u: UserRow) => {
    cmd.reset();
    patch({ user: u.id, edit: null });
  };
  const forceClose = () => {
    setDirty(false);
    setConfirmDiscard(false);
    cmd.reset();
    patch({ user: null, edit: null });
  };
  const requestClose = () => {
    if (formOpen && dirty) setConfirmDiscard(true);
    else forceClose();
  };
  const backToDetails = () => {
    setDirty(false);
    setConfirmDiscard(false);
    cmd.reset();
    patch({ edit: null });
  };

  // ---- commands
  const run = (c: UserCommand, onOk: (saved: UserRow) => void) =>
    cmd.mutate(c, {
      onSuccess: onOk,
      onError: (e) => {
        const p = toProblem(e);
        // drawer shows its own problem; also announce when the drawer is not the context
        if (!openId) say('bad', p.message);
      },
    });

  const submitForm = (values: UserFormValues) => {
    if (openId === 'new') {
      run({ kind: 'create', values }, (saved) => {
        setDirty(false);
        say('ok', `Added ${saved.fullName}.`);
        patch({ user: saved.id, edit: null, status: null, q: null });
      });
    } else if (openUser) {
      run({ kind: 'update', user: openUser, values, rolesEditable: openUser.id !== meId }, (saved) => {
        setDirty(false);
        say('ok', `Saved changes to ${saved.fullName}.`);
        patch({ edit: null });
      });
    }
  };

  const activate = (u: UserRow) =>
    run({ kind: 'activate', user: u }, (saved) => say('ok', `${saved.fullName} is active again and can sign in.`));

  const deactivate = (u: UserRow) =>
    run({ kind: 'deactivate', user: u }, (saved) =>
      say('ok', `${saved.fullName} was deactivated.`, { label: 'Undo', run: () => activate(saved) }),
    );

  const remove = (u: UserRow) =>
    run({ kind: 'remove', user: u }, (saved) => {
      say('ok', `${saved.fullName} was removed.`);
      forceClose();
    });

  const reload = () => {
    cmd.reset();
    void list.refetch();
  };

  // ---- render
  const listProblem = list.error ? toProblem(list.error) : null;
  const compact = context.tier === 'xs';
  const drawerProblem = cmd.error ? toProblem(cmd.error) : null;
  const filtersActive = query.trim() !== '' || status !== 'current';

  let body;
  if (list.isPending) {
    body = <UserListSkeleton />;
  } else if (listProblem?.status === 403) {
    body = (
      <EmptyState
        title="You can’t manage users here"
        hint={`${listProblem.message}. Ask an administrator for the user.manage permission on ${orgName}.`}
      />
    );
  } else if (listProblem) {
    body = (
      <div className="grid gap-3">
        <Alert kind="bad">Couldn’t load users — {listProblem.message}</Alert>
        <div>
          <Button variant="ghost" onClick={() => void list.refetch()}>Try again</Button>
        </div>
      </div>
    );
  } else if (users.length === 0) {
    body = <EmptyState title="No users yet" hint={`Add the first user for ${orgName}.`} />;
  } else if (visible.length === 0) {
    body = (
      <div className="grid justify-items-center gap-3">
        <EmptyState title="No users match" hint="Try a different search or status filter." />
        {filtersActive && (
          <Button variant="ghost" onClick={() => patch({ q: null, status: null })}>Clear filters</Button>
        )}
      </div>
    );
  } else {
    body = <UserList users={visible} compact={compact} meId={meId} selectedId={openId} onOpen={open} />;
  }

  const summary = list.data
    ? `${orgName} · ${counts.ACTIVE} active${counts.DISABLED ? ` · ${counts.DISABLED} deactivated` : ''}`
    : orgName;

  return (
    <Panel className="min-w-0 p-4 sm:p-5">
      <PageHeader
        title="Users"
        subtitle={summary}
        actions={
          <Button variant="primary" onClick={() => { cmd.reset(); patch({ user: 'new', edit: null }); }}>
            + Add user
          </Button>
        }
      />
      <NoticeBar notice={notice} onDismiss={dismissNotice} />
      <UserToolbar
        orgs={orgs.data}
        orgId={orgId}
        onOrg={(id) => patch({ org: id === rootOrgId ? null : id, user: null, edit: null })}
        query={query}
        onQuery={(q) => patch({ q })}
        status={status}
        onStatus={(s) => patch({ status: s === 'current' ? null : s })}
        counts={counts}
      />
      <div className={list.isFetching && !list.isPending ? 'opacity-70 transition-opacity' : undefined}>{body}</div>

      {openId && (
        <Drawer
          title={openId === 'new' ? 'Add user' : editing ? 'Edit user' : openUser?.fullName ?? 'User'}
          subtitle={openId === 'new' ? `New member of ${orgName}` : openUser ? `@${openUser.username} · ${orgName}` : undefined}
          onClose={requestClose}
          banner={
            confirmDiscard ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-raised px-5 py-3 text-[13px]">
                <span className="flex-1">Discard your unsaved changes?</span>
                <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
                <Button variant="danger" onClick={openId === 'new' ? forceClose : backToDetails}>Discard</Button>
              </div>
            ) : undefined
          }
        >
          {openId === 'new' ? (
            <UserForm
              key="new"
              mode="create"
              roles={roles.data}
              rolesLoading={roles.isPending}
              busy={cmd.isPending}
              problem={drawerProblem}
              onSubmit={submitForm}
              onCancel={requestClose}
              onDirtyChange={setDirty}
              onReload={reload}
            />
          ) : !openUser ? (
            list.isPending ? (
              <div className="p-5"><UserListSkeleton rows={1} /></div>
            ) : (
              <div className="p-5">
                <EmptyState title="User not found" hint="They may have been moved or you may have lost access." />
              </div>
            )
          ) : editing ? (
            <UserForm
              key={`${openUser.id}:${openUser.version}`}
              mode="edit"
              user={openUser}
              roles={roles.data}
              rolesLoading={roles.isPending}
              rolesLockedReason={openUser.id === meId ? 'You can’t change your own roles — ask another administrator.' : undefined}
              busy={cmd.isPending}
              problem={drawerProblem}
              onSubmit={submitForm}
              onCancel={() => (dirty ? setConfirmDiscard(true) : backToDetails())}
              onDirtyChange={setDirty}
              onReload={reload}
            />
          ) : (
            <UserDetails
              user={openUser}
              isMe={openUser.id === meId}
              busy={cmd.isPending}
              problem={drawerProblem}
              onEdit={() => { cmd.reset(); patch({ edit: '1' }); }}
              onDeactivate={() => deactivate(openUser)}
              onActivate={() => activate(openUser)}
              onRemove={() => remove(openUser)}
              onReload={reload}
            />
          )}
        </Drawer>
      )}
    </Panel>
  );
}
