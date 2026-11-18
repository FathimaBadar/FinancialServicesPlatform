import { useConnection } from './connection';

/** The bar at the top of the workbench: signed in or not, as whom, and what to do about it. */
export function ConnectionBar() {
  const c = useConnection();
  const on = c.status === 'connected';
  return (
    <div className="conn" data-connection={c.status}>
      <span className={on ? 'dot on' : 'dot'} />
      <b>{on ? 'FSP API' : 'Fixtures'}</b>
      <span className="mono dim small">same-origin /api → BFF → gateway → core</span>
      <span className="grow" />
      {c.status === 'checking' && <span className="small dim">Checking the session…</span>}
      {c.status === 'connected' && (
        <>
          <span className="small">
            signed in as <b>{c.who}</b> · org <span className="mono">{c.orgName ?? c.orgId ?? '—'}</span> ·{' '}
            {c.permissions.length} permissions
          </span>
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
