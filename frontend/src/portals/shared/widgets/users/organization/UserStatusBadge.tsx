import { Chip, StatusBadge } from '../../../ui/atoms';
import type { UserStatus } from './model';

export interface UserStatusBadgeProps {
  status: UserStatus;
}

/** A staged user reads "Awaiting approval" (who acts next is a checker), every other state the shared map. */
export function UserStatusBadge({ status }: UserStatusBadgeProps) {
  return status === 'PENDING' ? <Chip tone="warn">Awaiting approval</Chip> : <StatusBadge status={status} />;
}
