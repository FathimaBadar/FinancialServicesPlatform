import { clsx } from 'clsx';
import { initialsOf } from './model';
import type { UserStatus } from './model';

export interface UserAvatarProps {
  name: string;
  status: UserStatus;
  size?: 'sm' | 'lg';
}

/** Initials disc; muted when the person cannot sign in. */
export function UserAvatar({ name, status, size = 'sm' }: UserAvatarProps) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-full border font-extrabold',
        size === 'sm' ? 'h-9 w-9 text-[12px]' : 'h-14 w-14 text-base',
        status === 'ACTIVE' ? 'border-line-strong bg-raised text-accent' : 'border-line bg-sunken text-dim',
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
