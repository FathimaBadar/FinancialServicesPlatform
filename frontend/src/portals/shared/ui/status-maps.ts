/**
 * One map: status → { tone, label } — every badge in every portal speaks this
 * (ported from SME status-maps.ts; FSP states incl. journal posting + KYC).
 */
export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent';

export interface StatusStyle {
  tone: StatusTone;
  /** THE human label — one wording per state, everywhere. */
  label: string;
}

const S: Record<string, StatusStyle> = {
  // tenants
  PENDING:       { tone: 'warn', label: 'Pending' },
  ACTIVE:        { tone: 'ok', label: 'Active' },
  SUSPENDED:     { tone: 'bad', label: 'Suspended' },
  DEACTIVATED:   { tone: 'neutral', label: 'Deactivated' },
  VERIFIED:      { tone: 'ok', label: 'Verified' },
  REJECTED:      { tone: 'bad', label: 'Rejected' },
  // KYC
  NOT_STARTED:   { tone: 'neutral', label: 'Not started' },
  DRAFT:         { tone: 'neutral', label: 'Draft' },
  IN_REVIEW:     { tone: 'info', label: 'In review' },
  APPROVED_KYC:  { tone: 'ok', label: 'Approved' },
  // journal (financial domain — §5.1 explicit posting state)
  SUBMITTED:     { tone: 'info', label: 'Submitted' },
  POSTED:        { tone: 'accent', label: 'Posted · awaiting commit' },
  COMMITTED:     { tone: 'ok', label: 'Committed' },
  UNCERTAIN:     { tone: 'bad', label: 'Uncertain' },
  RECOVERED:     { tone: 'ok', label: 'Recovered' },
  UNKNOWN:       { tone: 'bad', label: 'Unknown' },
  // approvals
  OPEN:          { tone: 'info', label: 'Open' },
  DECIDED:       { tone: 'neutral', label: 'Decided' },
  // people
  PERSON_ACTIVE: { tone: 'ok', label: 'Active' },
  PERSON_LOCKED: { tone: 'bad', label: 'Locked' },
  DISABLED:      { tone: 'warn', label: 'Deactivated' },
  ARCHIVED:      { tone: 'neutral', label: 'Removed' },
};

export function statusStyle(status: string | null | undefined): StatusStyle {
  if (!status) return { tone: 'neutral', label: '—' };
  const key = status in S ? status
    : status === 'APPROVED' ? 'APPROVED_KYC'
    : `UNKNOWN_${status}`;
  return S[key] ?? { tone: 'neutral', label: status.replace(/_/g, ' ').toLowerCase() };
}
