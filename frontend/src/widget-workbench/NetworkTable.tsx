import type { CallRecord } from '../portals/shared/widgets/core/ports';
import { preview } from './model';

export interface NetworkTableProps {
  frameLabel: string;
  calls: readonly CallRecord[];
}

/** Every call the focused frame's widget made through its port (SME widget page "Network"). */
export function NetworkTable({ frameLabel, calls }: NetworkTableProps) {
  return (
    <section className="net">
      <header>
        <b>Network ({frameLabel} frame)</b>
        <span className="dim">every call goes through the widget&apos;s port: source → resolved request → answer</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>#</th><th>kind</th><th>name</th><th>params</th><th>target</th><th>status</th><th>ms</th><th>answer</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c, i) => (
            <tr key={c.seq ?? i} className={c.status === 'error' || c.status === 'forbidden' ? 'err' : undefined}>
              <td>{c.seq ?? i + 1}</td>
              <td>{c.kind}</td>
              <td className="mono">{c.name}</td>
              <td className="mono small">{c.params ? preview(c.params, 60) : ''}</td>
              <td className="mono small">{c.resolved}</td>
              <td>{c.status}</td>
              <td>{c.ms ?? ''}</td>
              <td className="mono small ans">{c.detail ?? preview(c.response)}</td>
            </tr>
          ))}
          {calls.length === 0 && (
            <tr>
              <td colSpan={8} className="dim">No calls (not permitted, hidden on this tier, or nothing to load).</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
