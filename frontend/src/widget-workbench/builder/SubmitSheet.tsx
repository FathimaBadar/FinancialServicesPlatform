import { useState } from 'react';
import { readProblem } from '../../portals/shared/web-core/api';
import { useSession } from '../../portals/shared/web-core/session-core';
import { useConnection } from '../connection';
import { diffSummary, diffLayouts, diffEmpty } from './diff';
import { parseLayout } from './layout';
import type { Finding, PortalLayout } from './layout';
import { usePendingPublish, usePublishActions, useServerLayouts } from './publish-model';
import type { LayoutView } from './publish-model';
import type { Sel } from './selection';

export interface SubmitSheetProps {
  layout: PortalLayout;
  portalLabel: string;
  findings: readonly Finding[];
  errorCount: number;
  onClose: () => void;
  onJump: (sel: Sel) => void;
  onOpen: (layout: PortalLayout) => void;
}

function Jump({ f, onJump }: { f: Finding; onJump: (sel: Sel) => void }) {
  const m = f.m, s = f.s;
  if (m === undefined) return null;
  return (
    <button type="button" className="lnk" onClick={() => onJump(s !== undefined && s !== null ? { kind: 'screen', m, s } : { kind: 'menu', m })}>go to it</button>
  );
}

function when(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : '';
}

/**
 * The submit sheet (§4.6): the right-side flow that used to be the "Publish" tab. It
 * shows the live checks, exactly what changes go live (diff against the published
 * layout), the note, and Save draft → Submit. A DIFFERENT person approves — the maker
 * never sees an approve control for their own submission (four-eyes, ui-std §5.2):
 * on approval core publishes the submitted snapshot and signs the delivery bundle.
 */
export function SubmitSheet({ layout, portalLabel, findings, errorCount, onClose, onJump, onOpen }: SubmitSheetProps) {
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
  const [showDiff, setShowDiff] = useState(false);

  const busy = act.save.isPending || act.submit.isPending || act.approve.isPending || act.reject.isPending;
  const fail = (e: unknown) => setMessage({ bad: true, text: readProblem(e).detail });
  const ok = (text: string) => {
    setMessage({ bad: false, text });
  };
  const open = (v: LayoutView) => {
    const l = parseLayout(v.layoutJson, layout.portal);
    if (l) {
      onOpen(l);
      onClose();
    } else setMessage({ bad: true, text: 'That layout is not readable by this build.' });
  };

  const p = pending.data ?? null;
  const mine = p !== null && p.makerId === me;
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const publishedLayout = published.data ? parseLayout(published.data.layoutJson, layout.portal) : null;
  const diff = diffLayouts(publishedLayout, layout);
  const clean = diffEmpty(diff);
  const nothingLive = !publishedLayout;

  const body = conn.status !== 'connected' || !conn.canBuild ? (
    <div className="sheet">
      <div className="pane-h"><b>Submit “{portalLabel}” for approval</b><span className="grow" /><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
      {conn.status !== 'connected'
        ? <p className="dim">Submitting needs a signed-in session. Without one, use Export.</p>
        : <p className="bad">Signed in as {conn.who}, without ui.layout.manage — you can preview and export, not publish.</p>}
    </div>
  ) : (
    <div className="sheet">
      <div className="pane-h">
        <b>Submit “{portalLabel}” for approval</b>
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
      {message && <p className={message.bad ? 'bad' : 'ok'}>{message.text}</p>}

      {/* checks (§4.6) — errors block, warnings advise "go to it" */}
      <div className="sheet-sec">
        <b className="small">Checks</b>
        {errors.length === 0 && warnings.length === 0 && <div className="ok small">✓ everything the publisher checks looks fine.</div>}
        {errors.map((f, i) => (
          <div key={`e${i}`} className="small bad">
            ✗ {f.where}: {f.text}
            <Jump f={f} onJump={onJump} />
          </div>
        ))}
        {warnings.map((f, i) => (
          <div key={`w${i}`} className="small warn">
            ! {f.where}: {f.text}
            <Jump f={f} onJump={onJump} />
          </div>
        ))}
      </div>

      {/* what changes go live (§4.6): the submitted snapshot IS this draft's JSON */}
      <div className="sheet-sec">
        <b className="small">What changes go live</b>
        {nothingLive ? (
          <div className="dim small">Nothing is live yet — the whole layout becomes the {layout.portal} portal.</div>
        ) : clean ? (
          <div className="dim small">No structural changes — only settings.</div>
        ) : (
          <div className="small">
            {diffSummary(diff)}
            <button type="button" className="lnk" onClick={() => setShowDiff(!showDiff)}>{showDiff ? 'Hide diff' : 'View diff'}</button>
          </div>
        )}
        {showDiff && publishedLayout && (
          <pre className="mono dim sheet-diff">{JSON.stringify({ live: publishedLayout, submitted: layout }, null, 2)}</pre>
        )}
        {p && <p className="dim small">Draft is locked while the publish approval is pending — the checker decides on the submitted snapshot.</p>}
      </div>

      {/* approval + actions (four-eyes) */}
      <div className="sheet-sec">
        <b className="small">Approval</b>
        {p ? (
          <div className="small">
            Waiting for approval since {when(p.requestedAt)}{mine ? ' — submitted by you' : ''}.
            <div className="mono dim">approval {p.id}</div>
            {!mine && p.payload && parseLayout(p.payload, layout.portal) ? null : !mine && <span className="bad small">Submitted snapshot is missing or unreadable — do not approve.</span>}
            <div className="dim small">The draft is locked until this approval is decided (approve or reject).</div>
          </div>
        ) : (
          <div className="dim small">Nothing waiting.</div>
        )}
      </div>

      <label className="small">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={p && !mine ? 'reason (required to reject)' : 'optional'} />
      </label>
      <div className="row-b">
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !!p}
            title={p ? 'Draft is locked while its publish approval is pending' : undefined}
            onClick={() => act.save.mutate(layout, { onSuccess: () => ok('Draft saved on the server.'), onError: fail })}
          >
            {act.save.isPending ? 'Saving…' : 'Save draft to server'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={errorCount > 0 || !draft.data || !!p || busy}
            title={errorCount > 0 ? `Fix the ${errorCount} error(s) first` : undefined}
            onClick={() =>
              act.submit.mutate(undefined, {
                onSuccess: () => ok('Submitted. Another platform administrator approves it to publish.'),
                onError: fail,
              })
            }
          >
            Submit draft for approval
          </button>
        </div>
        {p && !mine && (
          <div className="row">
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
          </div>
        )}
        {p && mine && <span className="dim small">You submitted it: another platform administrator approves it (four-eyes).</span>}
      </div>
      {(draft.data || published.data) && (
        <div className="row-b small dim">
          {published.data && (
            <span>
              Live: version {published.data.versionNum ?? '—'}, saved {when(published.data.updatedAt)}
              {' '}
              <button type="button" className="lnk" onClick={() => open(published.data!)}>open in editor</button>
            </span>
          )}
          {draft.data && (
            <span>
              Draft on the server: saved {when(draft.data.updatedAt)}{draft.data.makerId === me ? ' by you' : ''}
              {' '}
              <button type="button" className="lnk" onClick={() => open(draft.data!)}>open in editor</button>
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {body}
    </div>
  );
}
