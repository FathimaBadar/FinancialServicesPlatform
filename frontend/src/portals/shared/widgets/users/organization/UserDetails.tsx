import { useState } from 'react';
import { Alert, Button, Chip, KvPair, StatusBadge } from '../../../ui/atoms';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { UserAvatar } from './UserAvatar';
import { absoluteTime, relativeTime } from './model';
import type { Problem, UserRow } from './model';

export interface UserDetailsProps {
  user: UserRow;
  isMe: boolean;
  busy: boolean;
  problem: Problem | null;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onRemove: () => void;
  onReload: () => void;
}

type Pending = 'deactivate' | 'remove' | null;

/** Read-only view of one user + every lifecycle action available from its current state. */
export function UserDetails({
  user, isMe, busy, problem, onEdit, onDeactivate, onActivate, onRemove, onReload,
}: UserDetailsProps) {
  const [pending, setPending] = useState<Pending>(null);
  const removed = user.status === 'ARCHIVED';
  const selfReason = 'You can’t deactivate or remove your own account.';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5">
        <div className="flex items-center gap-4">
          <UserAvatar name={user.fullName} status={user.status} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold">{user.fullName}</div>
            <div className="mono text-dim truncate">@{user.username}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge status={user.status} />
              {isMe && <Chip tone="info">You</Chip>}
              {user.isApplicant && <Chip>KYC applicant</Chip>}
              {user.checker && <Chip tone="info">Checker</Chip>}
            </div>
          </div>
        </div>

        {problem && (
          <Alert kind="bad">
            {problem.message}
            {problem.code === 'STALE_WRITE' && (
              <button type="button" className="ml-2 font-extrabold underline" onClick={onReload}>
                Reload user
              </button>
            )}
          </Alert>
        )}

        {user.status === 'DISABLED' && (
          <Alert kind="warn">Deactivated — this user can’t sign in and holds no permissions until reactivated.</Alert>
        )}
        {removed && (
          <Alert kind="info">
            Removed {relativeTime(user.archivedAt)}. The record is kept for audit and retention, but the user can never sign in again.
          </Alert>
        )}

        <section aria-label="Contact" className="grid gap-3 sm:grid-cols-2">
          <KvPair label="Email">{user.email ?? '—'}</KvPair>
          <KvPair label="Phone">{user.phone ?? '—'}</KvPair>
        </section>

        <section aria-label="Access">
          <div className="text-dim mb-1.5 text-[10.5px] font-bold uppercase tracking-[.14em]">Roles</div>
          {user.roles.length === 0 ? (
            <p className="text-dim text-sm">
              {user.status === 'ACTIVE' ? 'No roles — this user can sign in but can’t do anything yet.' : 'No roles assigned.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {user.roles.map((r) => (
                <Chip key={r.id} tone="accent">{r.name}</Chip>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Record" className="grid gap-3 sm:grid-cols-2">
          <KvPair label="Created">
            <span title={absoluteTime(user.createdAt)}>{relativeTime(user.createdAt)}</span>
          </KvPair>
          <KvPair label="Last updated">
            <span title={absoluteTime(user.updatedAt)}>{relativeTime(user.updatedAt)}</span>
          </KvPair>
          <KvPair label="User ID" mono>{user.id}</KvPair>
        </section>

        {pending === 'deactivate' && (
          <InlineConfirm
            title={`Deactivate ${user.fullName}?`}
            confirmLabel="Deactivate"
            tone="danger"
            busy={busy}
            onCancel={() => setPending(null)}
            onConfirm={() => {
              onDeactivate();
              setPending(null);
            }}
          >
            They’re signed out of everything within moments and can’t sign in. Their roles are kept, so you can reactivate them at any time.
          </InlineConfirm>
        )}
        {pending === 'remove' && (
          <InlineConfirm
            title={`Remove ${user.fullName}?`}
            confirmLabel="Remove user"
            tone="danger"
            busy={busy}
            onCancel={() => setPending(null)}
            onConfirm={() => {
              onRemove();
              setPending(null);
            }}
          >
            This can’t be undone. The user loses access permanently; their record stays in the audit trail. To pause access instead, deactivate them.
          </InlineConfirm>
        )}
      </div>

      {!removed && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          <Button variant="primary" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          {user.status === 'ACTIVE' ? (
            <Button
              variant="ghost"
              disabled={busy || isMe}
              title={isMe ? selfReason : undefined}
              onClick={() => setPending('deactivate')}
            >
              Deactivate
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy || isMe} onClick={onActivate} aria-busy={busy}>
              {busy ? 'Activating…' : 'Activate'}
            </Button>
          )}
          <span className="flex-1" />
          <Button
            variant="danger"
            disabled={busy || isMe}
            title={isMe ? selfReason : undefined}
            onClick={() => setPending('remove')}
          >
            Remove
          </Button>
          {isMe && <p className="text-dim w-full text-[12px]">{selfReason}</p>}
        </div>
      )}
    </div>
  );
}
