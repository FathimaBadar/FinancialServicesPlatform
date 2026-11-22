import { useState } from 'react';
import type { Finding } from './layout';

export interface FindingListProps {
  findings: readonly Finding[];
}

const SHOWN_WARNINGS = 3;

/** Live layout checks: errors always listed (they block save — core would reject them); warnings fold. */
export function FindingList({ findings }: FindingListProps) {
  const [all, setAll] = useState(false);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const shown = all ? warnings : warnings.slice(0, SHOWN_WARNINGS);
  return (
    <>
      <div className="pane-h">
        <b>Checks</b>
        <span className="grow" />
        <span className={errors.length ? 'small bad' : 'small dim'}>
          {errors.length} error(s) · {warnings.length} warning(s)
        </span>
      </div>
      <div className="findings">
        {errors.map((f, i) => (
          <div key={`e${i}`} className="bad">✗ {f.where}: {f.text}</div>
        ))}
        {shown.map((f, i) => (
          <div key={`w${i}`} className="warn">! {f.where}: {f.text}</div>
        ))}
        {warnings.length > SHOWN_WARNINGS && (
          <button type="button" className="lnk small" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `+${warnings.length - SHOWN_WARNINGS} more warning(s)`}
          </button>
        )}
        {findings.length === 0 && <div className="ok">✓ ids valid, every menu has submenus, every widget fits its tier.</div>}
      </div>
    </>
  );
}
