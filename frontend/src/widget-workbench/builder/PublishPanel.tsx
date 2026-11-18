import { useState } from 'react';
import { readProblem } from '../../portals/shared/web-core/api';
import { useSession } from '../../portals/shared/web-core/session-core';
import { useConnection } from '../connection';
import { parseLayout } from './layout';
import type { PortalLayout } from './layout';
import { usePendingPublish, usePublishActions, useServerLayouts } from './publish-model';
import type { LayoutView } from './publish-model';

export interface PublishPanelProps {
  layout: PortalLayout;
  errorCount: number;
  onOpen: (layout: PortalLayout) => void;
}

function when(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : '';
}

/**
 * Publish (SME builder "Publish", FSP four-eyes): save the editor's layout as the server
 * draft, submit it, and a DIFFERENT person approves it — the maker never sees an approve
 * control for their own submission (ui-std §5.2). On approval core publishes the layout
 * and signs the portal's delivery bundle; the portal verifies it before rendering.
 */
export function PublishPanel({ layout, errorCount, onOpen }: PublishPanelProps) {
  const conn = useConnection();
  const session = useSession();
  const me = session.user?.userId ?? null;
  const rootTenantId = session.user?.tenantId ?? null;
  const enabled = conn.status === 'connected' && conn.canBuild;
  const { draft, published } = useServerLayouts(layout.portal, enabled);
  const pending = usePendingPublish(rootTenantId, draft.data?.id ?? null, enabled && !!draft.data);
  const act = usePublishActions(layout.portal, rootTenantId);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ bad: boolean; text: string } | null>(null);

  if (conn.status !== 'connected') {
    return <p className="dim">Publishing needs a signed-in session (bar above). Without one, use Export.</p>;
  }
  if (!conn.canBuild) {
    return <p className="bad">Signed in as {conn.who}, without ui.layout.manage — you can preview and export, not publish.</p>;
  }

  const busy = act.save.isPending || act.submit.isPending || act.approve.isPending || act.reject.isPending;
  const fail = (e: unknown) => setMessage({ bad: true, text: readProblem(e).detail });
  const ok = (text: string) => {
    setMessage({ bad: false, text });
    setNote('');
  };
  const open = (v: LayoutView) => {
    const l = parseLayout(v.layoutJson, layout.portal);
    if (l) {
      onOpen(l);
      ok('Opened in the editor.');
    } else setMessage({ bad: true, text: 'That layout is not readable by this build.' });
  };

  const rows: { label: string; view: LayoutView | null | undefined; loading: boolean }[] = [
    { label: 'Draft on the server', view: draft.data, loading: draft.isPending },
    { label: 'Published (what the portal draws)', view: published.data, loading: published.isPending },
  ];
  const p = pending.data ?? null;
  const mine = p !== null && p.makerId === me;

  return (
    <div className="exp">
      {message && <p className={message.bad ? 'bad' : 'ok'}>{message.text}</p>}

      <div className="pane-h">
        <b>{layout.portal}: your editor</b>
        <span className="grow" />
        <button
          type="button"
          className="btn primary"
          disabled={errorCount > 0 || busy}
          onClick={() => act.save.mutate(layout, { onSuccess: () => ok('Draft saved on the server.'), onError: fail })}
        >
          {act.save.isPending ? 'Saving…' : 'Save draft to server'}
        </button>
      </div>
      {errorCount > 0 && <p className="bad small">Fix the {errorCount} error(s) first.</p>}

      {rows.map((r) => (
        <div key={r.label}>
          <div className="pane-h">
            <b>{r.label}</b>
            <span className="grow" />
            {r.view && <button type="button" className="lnk" onClick={() => open(r.view!)}>Open in editor</button>}
          </div>
          {r.loading ? (
            <div className="dim small">Loading…</div>
          ) : r.view ? (
            <div className="small">
              {r.view.versionNum ? <span>Version {r.view.versionNum} · </span> : null}
              {r.view.status.toLowerCase()} · saved {when(r.view.updatedAt)}
              {r.view.makerId === me ? ' by you' : ''}
            </div>
          ) : (
            <div className="dim small">none</div>
          )}
        </div>
      ))}

      <div className="pane-h"><b>Approval</b></div>
      {p ? (
        <div className="small">
          Waiting for approval since {when(p.requestedAt)}{mine ? ' — submitted by you' : ''}.
          <div className="mono dim">approval {p.id}</div>
        </div>
      ) : (
        <div className="dim small">Nothing waiting.</div>
      )}

      <label className="small">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={p && !mine ? 'reason (required to reject)' : 'optional'} />
      </label>
      <div className="row-b">
        <button
          type="button"
          className="btn"
          disabled={!draft.data || !!p || busy}
          onClick={() =>
            act.submit.mutate(undefined, {
              onSuccess: () => ok('Submitted. Another platform administrator approves it to publish.'),
              onError: fail,
            })
          }
        >
          Submit draft for approval
        </button>
        {p && !mine && (
          <>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                act.approve.mutate(
                  { id: p.id, reason: note },
                  { onSuccess: () => ok(`Published: the ${layout.portal} portal draws this layout on its next load.`), onError: fail },
                )
              }
            >
              Approve and publish
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy || !note.trim()}
              title={note.trim() ? undefined : 'A rejection needs a reason (Note)'}
              onClick={() => act.reject.mutate({ id: p.id, reason: note.trim() }, { onSuccess: () => ok('Rejected.'), onError: fail })}
            >
              Reject
            </button>
          </>
        )}
        {p && mine && <span className="dim small">You submitted it: another platform administrator approves it (four-eyes).</span>}
      </div>
    </div>
  );
}
