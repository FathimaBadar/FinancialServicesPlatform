import { useState } from 'react';
import { Alert, Button, KvPair } from '../../../ui/atoms';
import { InlineConfirm } from '../../kit/InlineConfirm';
import { BranchStatusChip } from './BranchStatusChip';
import { PendingChangePanel } from './PendingChangePanel';
import { approvedByText, changeBlocker, dateTime } from './model';
import type { BranchRow } from './model';

export interface BranchDetailsProps {
  branch: BranchRow;
  canManage: boolean;
  /** a maker command (delete) is running */
  busy: boolean;
  /** the last maker command's failure, in words */
  problem: string | null;
  deciding: boolean;
  decisionProblem: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDecide: (approve: boolean, reason: string) => void;
}

/** One branch: who created / approved it and when, its pending change, and the maker actions. */
export function BranchDetails({
  branch, canManage, busy, problem, deciding, decisionProblem, onEdit, onDelete, onDecide,
}: BranchDetailsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blocker = changeBlocker(branch, canManage);
  const decided = branch.status === 'REJECTED' ? 'Rejected' : 'Approved';
  const showActions = canManage && (branch.status === 'ACTIVE' || branch.status === 'PENDING');
  // Drawer layout (same as users.organization): a padded body that scrolls, and the maker
  // actions in a footer bar under it — aligned with the drawer header's px-5, never clipped.
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="branch-details">
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5">
        <section aria-label="Branch record" className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <KvPair label="Code" mono>{branch.code}</KvPair>
          <KvPair label="Status"><BranchStatusChip branch={branch} /></KvPair>
          <KvPair label="Created by">{branch.makerName}</KvPair>
          <KvPair label="Created">{dateTime(branch.createdAt)}</KvPair>
          <KvPair label="Approved by">{approvedByText(branch)}</KvPair>
          <KvPair label={decided}>{dateTime(branch.decidedAt)}</KvPair>
        </section>
        {branch.status === 'REJECTED' && branch.decisionReason && (
          <Alert kind="bad">Rejected: {branch.decisionReason}</Alert>
        )}

        {branch.pending && (
          <PendingChangePanel
            branch={branch}
            pending={branch.pending}
            busy={deciding}
            problem={decisionProblem}
            onDecide={onDecide}
          />
        )}

        {problem && <Alert kind="bad">{problem}</Alert>}

        {showActions && confirmDelete && (
          <InlineConfirm
            title={`Delete ${branch.name}?`}
            confirmLabel="Send deletion for approval"
            tone="danger"
            busy={busy}
            onConfirm={onDelete}
            onCancel={() => setConfirmDelete(false)}
          >
            A checker must approve the deletion. Until then the branch stays active and roles can keep using it.
          </InlineConfirm>
        )}
      </div>

      {showActions && !confirmDelete && (
        <div className="grid gap-2 border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" data-action="branch.edit" disabled={blocker !== null || busy} onClick={onEdit}>
              Rename
            </Button>
            <Button variant="danger" data-action="branch.delete" disabled={blocker !== null || busy}
              onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
          {blocker && <p className="text-dim text-right text-[12px]" data-testid="branch-change-blocked">{blocker}</p>}
        </div>
      )}
      {!canManage && (
        <p className="text-dim border-t border-line px-5 py-4 text-[12px]">
          View only — changing branches needs the role.manage permission.
        </p>
      )}
    </div>
  );
}
