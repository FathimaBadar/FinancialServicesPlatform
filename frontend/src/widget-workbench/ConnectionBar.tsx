import { useConnection } from './connection';
import { useTheme, type ThemeChoice } from './theme';

/** The bar at the top of the workbench: signed in or not, as whom, and what to do about it.
 *  On builder routes it collapses to a dot + identity (§4.7) — the builder has its own header. */
export function ConnectionBar() {
  const c = useConnection();
  const { theme, setTheme, resolved } = useTheme();
  const on = c.status === 'connected';
  const compact = typeof window !== 'undefined' && window.location.pathname.startsWith('/builder');
  return (
    <div className={compact ? 'conn compact' : 'conn'} data-connection={c.status}>
      <span className={on ? 'dot on' : 'dot'} data-state={resolved} />
      <b>{on ? 'FSP API' : 'Fixtures'}</b>
      <select
        className="small"
        aria-label="Colour theme"
        title={`Theme: ${theme === 'system' ? `system (${resolved})` : theme}`}
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeChoice)}
      >
        <option value="system">System ({resolved})</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      {!compact && <span className="mono dim small">same-origin /api → BFF → gateway → core</span>}
      {!compact && <span className="grow" />}
      {c.status === 'checking' && <span className="small dim" role="status">Checking the session…</span>}
      {c.status === 'connected' && (
        <>
          {!compact && (
            <span className="small">
              signed in as <b>{c.who}</b> · org <span className="mono">{c.orgName ?? c.orgId ?? '—'}</span> ·{' '}
              {c.permissions.length} permissions
            </span>
          )}
          {compact && <span className="small">{c.who}</span>}
          <label className="chk small">
            <input
              type="checkbox"
              checked={c.useRealAccess}
              onChange={() => c.setUseRealAccess(!c.useRealAccess)}
            />
            use my real permissions and org
          </label>
          <button type="button" className="lnk" onClick={() => void c.refresh()}>Refresh</button>
          <button type="button" className="lnk" onClick={() => void c.signOut()}>Sign out</button>
        </>
      )}
      {c.status === 'signed-out' && (
        <>
          <span className="small warn">Fixtures only. Sign in for live data, the registry server and publishing.</span>
          <button type="button" className="btn primary" onClick={c.signIn}>Sign in</button>
        </>
      )}
      {c.status === 'not-eligible' && (
        <>
          <span className="small bad">
            Signed in as {c.who}, but the workbench is for platform staff. Fixtures still work.
          </span>
          <button type="button" className="lnk" onClick={() => void c.signOut()}>Sign out</button>
        </>
      )}
    </div>
  );
}
