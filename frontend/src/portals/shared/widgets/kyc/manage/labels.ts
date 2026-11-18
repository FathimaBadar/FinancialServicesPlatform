import type { StatusTone } from '../../../ui/status-maps';
import type { CaseStatus, Risk } from './model';

/** One wording + tone per case state, everywhere in the widget. */
export const CASE_STATUS_STYLE: Record<CaseStatus, { tone: StatusTone; label: string }> = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  TENANT_PENDING: { tone: 'info', label: 'Setting up' },
  SUBMITTED: { tone: 'info', label: 'Screening' },
  PENDING_REVIEW: { tone: 'warn', label: 'Awaiting review' },
  REQUEST_INFO: { tone: 'accent', label: 'Info requested' },
  APPROVED: { tone: 'ok', label: 'Approved' },
  REJECTED: { tone: 'bad', label: 'Rejected' },
  STALLED: { tone: 'bad', label: 'Stalled' },
};

export const RISK_TONE: Record<Risk, StatusTone> = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad' };
export const RISK_LABEL: Record<Risk, string> = { LOW: 'Low risk', MEDIUM: 'Medium risk', HIGH: 'High risk' };

