import { clsx } from 'clsx';
import { Chip } from '../../../ui/atoms';
import { UserAvatar } from './UserAvatar';
import type { UserRow } from './model';

export interface UserIdentityProps {
  user: UserRow;
  me: boolean;
}

/** Avatar + full name + @username (+ "You"). */
export function UserIdentity({ user, me }: UserIdentityProps) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar name={user.fullName} status={user.status} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={clsx('truncate font-semibold', user.status !== 'ACTIVE' && 'text-dim')}>{user.fullName}</span>
          {me && <Chip tone="info">You</Chip>}
        </span>
        <span className="mono text-dim block truncate">@{user.username}</span>
      </span>
    </span>
  );
}
