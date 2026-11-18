import { Chip } from '../../../ui/atoms';
import type { StatusTone } from '../../../ui/status-maps';
import { CASE_STATUS_STYLE, RISK_LABEL, RISK_TONE } from './labels';
import type { CaseStatus, CheckResult, Risk } from './model';

export interface CaseStatusChipProps {
  status: CaseStatus;
  stalled?: boolean;
}

export function CaseStatusChip({ status, stalled }: CaseStatusChipProps) {
  const s = CASE_STATUS_STYLE[status];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Chip tone={s.tone}>{s.label}</Chip>
      {stalled && status !== 'STALLED' && <Chip tone="bad">Stalled</Chip>}
    </span>
  );
}

export interface RiskChipProps {
  risk: Risk | null;
}

export function RiskChip({ risk }: RiskChipProps) {
  if (!risk) return <span className="text-dim text-xs">Not rated</span>;
  return <Chip tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</Chip>;
}

const CHECK_STYLE: Record<CheckResult, { tone: StatusTone; label: string }> = {
  PASS: { tone: 'ok', label: 'Clear' },
  MANUAL_REVIEW: { tone: 'warn', label: 'Needs review' },
  FAIL: { tone: 'bad', label: 'Failed' },
};

export interface CheckChipProps {
  result: CheckResult;
}

export function CheckChip({ result }: CheckChipProps) {
  const s = CHECK_STYLE[result];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
