import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '../../portals/shared/web-core/api';
import { useSession } from '../../portals/shared/web-core/session-core';
import { parseLayout } from './layout';
import { COLS, TIERS } from '../../portals/shared/widgets/core/grid';
import type { Tier } from '../../portals/shared/widgets/core/grid';
import type { WidgetDef } from '../../portals/shared/widgets/core/manifest';
import { WIDGETS } from '../../portals/shared/widgets/registry';
import { useConnection } from '../connection';
import { BUILDER_PORTALS, TIER_LABEL, worksIn } from '../model';
import { ConfirmDialog } from './ConfirmDialog';
import { DesignCanvas } from './DesignCanvas';
import { ExportPanel } from './ExportPanel';
import {
  autoSlugId, blankLayout, loadLocalDraft, move, placeWidget, saveLocalDraft, screenResources,
  screenRoute, seedLayout, sameLayout, uniqueId, validateLayout,
} from './layout';
import type { LayoutMenu, LayoutScreen, PortalLayout } from './layout';
import { MenuInspector } from './MenuInspector';
import { OverflowMenu } from './OverflowMenu';
import { PlacedInspector } from './PlacedInspector';
import { Rail } from './Rail';
import { ScreenInspector } from './ScreenInspector';
import { parseView } from './selection';
import type { Sel } from './selection';
import { StartChooser } from './StartChooser';
import { SubmitSheet } from './SubmitSheet';
import { Toast } from './Toast';
import { emptyHistory, pushHistory, redoHistory, undoHistory } from './history';
import type { History } from './history';
import { WidgetPicker } from './WidgetPicker';
import { useLastDecision, usePendingPublish, useServerLayouts } from './publish-model';

const DEFS: ReadonlyMap<string, WidgetDef> = new Map(WIDGETS.map((w) => [w.id, w]));

/**
 * The portal builder for admins (plans/portal-builder-redesign.md): one WYSIWYG screen
 * where the rail IS the portal sidebar, widgets are placed on a true-width canvas, the
 * first state is a plain-words choice (live portal / blank / import), every destructive
 * act is undoable or confirmed, and submitting runs the four-eyes publish flow — the
 * maker's own submission is decided by a different platform administrator.
 *
 * The editor copy stays in this browser between visits; publish ids of live menus/pages
 * are locked; while an approval is pending, editing is locked.
 */
export function BuilderPage() {
  const conn = useConnection();
  const [q, setQ] = useSearchParams();
  const portal = BUILDER_PORTALS.find((p) => p.key === q.get('portal')) ?? BUILDER_PORTALS[0];
  const tier: Tier = TIERS.includes(q.get('tier') as Tier) ? (q.get('tier') as Tier) : 'xs';
  const view = parseView(q.get('view'));
  const setParam = (key: string, value: string | null) =>
    setQ(
      (p) => {
        const n = new URLSearchParams(p);
        if (value === null) n.delete(key);
        else n.set(key, value);
        return n;
      },
      { replace: true },
    );

  const [layout, setLayout] = useState<PortalLayout | null>(() => loadLocalDraft(portal.key));
  const [hist, setHist] = useState<History>(emptyHistory);
  const [sel, setSel] = useState<Sel>(null);
  const [fit, setFit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'menu'; m: number } | { kind: 'discard' }>(null);
  const [picker, setPicker] = useState<{ open: boolean; at: number } | null>(null);
  const [railOpen, setRailOpen] = useState(false); // small screens: the rail becomes a drawer
  /** First render with a layout: suppresses seed-born warnings until the first edit (§4.2). */
  const pristine = useRef(layout !== null);

  const server = useQuery({
    queryKey: ['ui', 'widgets', 'server'],
    queryFn: () => apiGet<{ id: string }[]>('/api/ui/widgets'),
    enabled: conn.status === 'connected',
  });
  const serverIds = useMemo(() => (server.data ? new Set(server.data.map((w) => w.id)) : null), [server.data]);
  const pickerWidgets = useMemo(() => WIDGETS.filter((d) => worksIn(d, portal.context)), [portal.context]);
  const enabled = conn.status === 'connected' && conn.canBuild;
  const { draft, published } = useServerLayouts(portal.key, enabled);

  const findings = useMemo(() => (layout ? validateLayout(layout, DEFS, portal) : []), [layout, portal]);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');

  const mi = sel ? sel.m : -1;
  const si = sel && sel.kind !== 'menu' ? sel.s : -1;
  const menu: LayoutMenu | null = layout?.menus[mi] ?? null;
  const screen: LayoutScreen | null = menu?.screens[si] ?? null;
  const selWidget = sel?.kind === 'widget' ? sel.id : null;
  const placed = screen?.placedWidgets.find((p) => p.id === selWidget) ?? null;
  const placedDef = placed ? DEFS.get(placed.widgetId) ?? null : null;

  // publish plumbing (hooks must run unconditionally)
  const pendingLayoutId = draft.data?.id ?? null;
  const pendingQ = usePendingPublishFor(pendingLayoutId, enabled && !!pendingLayoutId);
  const pending = pendingQ.data ?? null;
  const lastDecisionQ = useLastDecisionFor(enabled);
  const lastDecision = lastDecisionQ.data ?? null;
  const publishedLayout = published.data ? parseLayout(published.data.layoutJson, portal.key) : null;
  const publishedIds = useMemo(() => {
    const ids = new Set<string>();
    publishedLayout?.menus.forEach((m) => {
      ids.add(`m:${m.id}`);
      m.screens.forEach((s) => ids.add(`p:${s.id}`));
    });
    return ids;
  }, [publishedLayout]);

  const locked = pending !== null;
  const portalLabel = portal.label;

  // switching portal loads that portal's editor copy (adjust state during render, not in an effect)
  const [shownPortal, setShownPortal] = useState(portal.key);
  if (shownPortal !== portal.key) {
    const next = loadLocalDraft(portal.key);
    setShownPortal(portal.key);
    setLayout(next);
    setHist(emptyHistory());
    setSel(null);
    pristine.current = next !== null;
  }
  useEffect(() => {
    if (layout) saveLocalDraft(layout);
  }, [layout]);

  // ---------------------------------------------------------------- edits (immutable, recorded)
  const edit = (fn: (l: PortalLayout) => void) => {
    if (!layout || locked) return;
    setHist((h) => pushHistory(h, layout));
    const next = structuredClone(layout);
    fn(next);
    setLayout(next);
    pristine.current = false;
  };
  const editScreen = (fn: (s: LayoutScreen) => void) => {
    if (mi < 0 || si < 0) return;
    edit((l) => fn(l.menus[mi].screens[si]));
  };
  const undo = () => {
    if (!layout) return;
    const r = undoHistory(hist, layout);
    if (r.layout) {
      setHist(r.hist);
      setLayout(r.layout);
      setSel(null);
    }
  };
  const redo = () => {
    if (!layout) return;
    const r = redoHistory(hist, layout);
    if (r.layout) {
      setHist(r.hist);
      setLayout(r.layout);
      setSel(null);
    }
  };

  // ---------------------------------------------------------------- structure ops
  const startLive = async () => {
    let next: PortalLayout | null = null;
    if (enabled) {
      try {
        const v = await apiGet<unknown>(`/api/ui/layouts/${encodeURIComponent(portal.key)}/published`);
        const lj = (v as { layoutJson?: string }).layoutJson;
        if (typeof lj === 'string') next = parseLayout(lj, portal.key);
      } catch {
        next = null; // not published (or unreachable) — fall through to the build-time seed
      }
    }
    const seeded = next ?? seedLayout(portal, DEFS);
    setLayout(seeded);
    setHist(emptyHistory());
    setSel(seeded.menus[0] ? { kind: 'screen', m: 0, s: 0 } : null);
    pristine.current = false;
  };

  // Deep links (?view=submit / ?view=export) must work without a chooser step: if the
  // editor copy is empty (fresh browser, like a checker clicking a notification), seed it
  // once from the live portal instead of blocking on StartChooser (§4.1).
  const deepLinked = useRef(false);
  useEffect(() => {
    if (view === null || layout || deepLinked.current) return;
    deepLinked.current = true;
    void startLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount when the URL carries a view
  }, [view, layout]);
  const startBlank = () => {
    const next = blankLayout(portal.key);
    setLayout(next);
    setHist(emptyHistory());
    setSel({ kind: 'screen', m: 0, s: 0 });
    pristine.current = false;
  };
  const importJson = (l: PortalLayout) => {
    const fixed = { ...l, portal: portal.key };
    setLayout(fixed);
    setHist(emptyHistory());
    setSel(null);
    pristine.current = false;
  };

  const addMenu = () => {
    if (!layout) return;
    const m = layout.menus.length;
    edit((l) => {
      // a menu without a page is hidden from users — create the first page right away
      l.menus.push({ id: uniqueId('new-menu', l.menus.map((x) => x.id)), label: 'New menu', screens: [{ id: uniqueId('new-page', ['new-page']), label: 'Page 1', placedWidgets: [] }] });
    });
    setSel({ kind: 'menu', m });
    renameAfter.current = { kind: 'menu', m, s: -1 };
  };
  const addPage = (m: number) => {
    if (!layout) return;
    const s = layout.menus[m]?.screens.length ?? -1;
    edit((l) => {
      const ms = l.menus[m];
      ms.screens.push({ id: uniqueId('new-page', ms.screens.map((x) => x.id)), label: 'New page', placedWidgets: [] });
    });
    setSel(s >= 0 ? { kind: 'screen', m, s } : null);
    // the label of the fresh page starts in-place rename (§4.2)
    renameAfter.current = { kind: 'page', m, s };
  };
  const deleteMenu = (m: number) => {
    setDialog({ kind: 'menu', m });
  };
  const deletePage = (m: number, s: number) => {
    if (!layout) return;
    const label = layout.menus[m]?.screens[s]?.label ?? 'page';
    edit((l) => {
      l.menus[m]?.screens.splice(s, 1);
    });
    setSel({ kind: 'menu', m });
    setToast(`Deleted “${label}” · Undo`);
  };
  const rename = (kind: 'menu' | 'page', m: number, s: number, label: string, prevLabel: string) => {
    edit((l) => {
      const mm = l.menus[m];
      if (!mm) return;
      if (kind === 'menu') {
        const nextId = autoSlugId(mm.id, prevLabel, label, l.menus.map((x) => x.id));
        mm.label = label;
        if (nextId) mm.id = nextId;
      } else {
        const ss = mm.screens[s];
        if (!ss) return;
        const nextId = autoSlugId(ss.id, prevLabel, label, mm.screens.map((x) => x.id));
        ss.label = label;
        if (nextId) ss.id = nextId;
      }
    });
  };

  const addWidget = (widgetId: string, at: number) => {
    const def = DEFS.get(widgetId);
    if (!def || !screen) return;
    const it = placeWidget(def);
    editScreen((s) => s.placedWidgets.splice(at, 0, it));
    setSel({ kind: 'widget', m: mi, s: si, id: it.id });
    setPicker(null);
    setToast(`Added “${def.label}”`);
  };
  const removeWidget = (id: string) => {
    const label = DEFS.get(screen?.placedWidgets.find((p) => p.id === id)?.widgetId ?? '')?.label ?? 'widget';
    editScreen((s) => {
      s.placedWidgets = s.placedWidgets.filter((p) => p.id !== id);
    });
    setSel({ kind: 'screen', m: mi, s: si });
    setToast(`Removed “${label}” · Undo`);
  };
  const moveSel = (by: number) => {
    if (!sel || !layout) return;
    if (sel.kind === 'menu') {
      const to = Math.max(0, Math.min(layout.menus.length - 1, sel.m + by));
      edit((l) => move(l.menus, sel.m, to));
      setSel({ kind: 'menu', m: to });
    } else if (sel.kind === 'screen') {
      const to = Math.max(0, Math.min(layout.menus[sel.m].screens.length - 1, sel.s + by));
      edit((l) => move(l.menus[sel.m].screens, sel.s, to));
      setSel({ kind: 'screen', m: sel.m, s: to });
    } else if (screen) {
      const from = screen.placedWidgets.findIndex((p) => p.id === sel.id);
      const to = Math.max(0, Math.min(screen.placedWidgets.length - 1, from + by));
      if (from !== to) edit((l) => move(l.menus[sel.m].screens[sel.s].placedWidgets, from, to));
    }
  };

  // ---------------------------------------------------------------- keyboard (§4.4, §4.8)
  /** Rename to start in the rail right away (fresh menus/pages begin with their label in edit). */
  const renameAfter = useRef<RenameSeed | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (!locked && screen) setPicker({ open: true, at: screen.placedWidgets.length });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        undo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) {
        if (typing) return;
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === 'F2' && sel) {
        e.preventDefault();
        // rename happens in the rail; opening it with the item selected is the affordance
        setRailOpen(true);
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveSel(e.key === 'ArrowUp' ? -1 : 1);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'widget' && !locked) removeWidget(sel.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- lifecycle pill (§4.1)
  const draftJson = draft.data ? (JSON.parse(draft.data.layoutJson) as PortalLayout) : null;
  const savedOnServer = layout !== null && sameLayout(layout, draftJson);
  const rejectedNewer = useMemo(() => {
    if (!lastDecision || !publishedLayout || !published.data) return false;
    return new Date(lastDecision.decidedAt ?? 0) > new Date(published.data.updatedAt);
  }, [lastDecision, publishedLayout, published.data]);
  const state = !layout
    ? null
    : pending
      ? { text: 'Waiting for approval', level: 'warn' as const, title: 'The draft is locked until a checker decides (four-eyes).' }
      : rejectedNewer
        ? { text: 'Changes requested', level: 'bad' as const, title: lastDecision?.reason ?? 'The last submission was rejected.' }
        : publishedLayout && sameLayout(layout, publishedLayout)
          ? { text: `Live · v${published.data?.versionNum ?? '—'}`, level: 'ok' as const, title: 'This editor copy is what is live.' }
          : publishedLayout
            ? { text: `Live · v${published.data?.versionNum ?? '—'} · edited`, level: 'warn' as const, title: 'Your editor copy differs from what is live.' }
            : savedOnServer
              ? { text: 'Draft (saved to server)', level: 'neutral' as const, title: 'This draft also exists on the server.' }
              : { text: 'Draft (saved locally)', level: 'neutral' as const, title: 'Only this browser has this copy.' };

  // ---------------------------------------------------------------- render
  if (!layout) {
    return (
      <section className="bd-top">
        <StartChooser
          portalLabel={portalLabel}
          liveSummary={publishedLayout ? `${publishedLayout.menus.length} menus · ${publishedLayout.menus.reduce((n, m) => n + m.screens.length, 0)} pages` : null}
          onStartLive={() => void startLive()}
          onStartBlank={startBlank}
          onImport={importJson}
          error={null}
        />
      </section>
    );
  }

  return (
    <>
      <section className="bd-top">
        <h1>Portal builder</h1>
        <label>
          Portal
          <select value={portal.key} onChange={(e) => setParam('portal', e.target.value)}>
            {BUILDER_PORTALS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {state && <span className={`pill p-${state.level}`} title={state.title}>{state.text}</span>}
        {!pristine.current && (
          <span className={errors.length ? 'badge bad' : warnings.length ? 'badge warn-b' : 'badge ok'}>
            {errors.length ? `${errors.length} to fix` : warnings.length ? `${warnings.length} suggestions` : '✓ checks clear'}
          </span>
        )}
        <span className="grow" />
        <button type="button" className="btn" disabled={!hist.past.length || locked} title="Undo (Ctrl+Z)" onClick={undo}>↺</button>
        <button type="button" className="btn" disabled={!hist.future.length || locked} title="Redo (Ctrl+Shift+Z)" onClick={redo}>↻</button>
        <button type="button" className="btn rail-toggle" onClick={() => setRailOpen(!railOpen)}>☰ Menus</button>
        <button type="button" className="btn primary" onClick={() => setParam('view', 'submit')}>Submit for approval</button>
        <OverflowMenu
          items={[
            { label: 'Export JSON…', onSelect: () => setParam('view', 'export') },
            { label: 'Discard draft…', destructive: true, onSelect: () => setDialog({ kind: 'discard' }) },
          ]}
        />
      </section>

      <div className="bd">
        <aside className={railOpen ? 'bd-left open' : 'bd-left'}>
          <Rail
            livePortalLabel={portalLabel}
            layout={layout}
            sel={sel}
            locked={locked}
            publishedIds={publishedIds}
            findings={findings}
            startRename={renameAfter.current}
            onRenamed={() => {
              renameAfter.current = null;
            }}
            onSelect={(s) => {
              setSel(s);
              if (s === null || s.kind !== 'menu') setParam('view', null);
            }}
            onOpenScreen={(m, s) => {
              setSel({ kind: 'screen', m, s });
              setParam('view', null);
              setRailOpen(false);
            }}
            onAddMenu={addMenu}
            onAddPage={addPage}
            onDeletePage={deletePage}
            onRename={rename}
            onMoveMenu={(from, to) => {
              edit((l) => move(l.menus, from, to));
              setSel({ kind: 'menu', m: to });
            }}
            onMovePage={(from, to) => {
              let finalAt = 0;
              edit((l) => {
                const [x] = l.menus[from.m].screens.splice(from.s, 1);
                const dest = l.menus[to.m].screens;
                const at = from.m === to.m && from.s < to.s ? to.s - 1 : to.s;
                finalAt = Math.min(at, dest.length);
                dest.splice(finalAt, 0, x!);
              });
              setSel({ kind: 'screen', m: to.m, s: finalAt });
            }}
          />
        </aside>

        <main className="bd-mid">
          {view === 'export' ? (
            <ExportPanel layout={layout} errorCount={errors.length} />
          ) : menu && screen ? (
            <>
              <div className="crumb">
                <span>{menu.label} › {screen.label}</span>
                <span className="mono dim small">{screenRoute(menu, screen)}</span>
                <span className="grow" />
                <span className="seg" role="tablist" aria-label="Device tier">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tier === t}
                      className={tier === t ? 'seg-btn on' : 'seg-btn'}
                      onClick={() => setParam('tier', t === 'xs' ? null : t)}
                      title={`${TIER_LABEL[t]} · ${COLS[t]} columns`}
                    >
                      {TIER_LABEL[t]}
                    </button>
                  ))}
                </span>
              </div>
              <DesignCanvas
                context={portal.context}
                tier={tier}
                items={screen.placedWidgets}
                defs={DEFS}
                selected={selWidget}
                fit={fit}
                onFit={setFit}
                locked={locked}
                onSelect={(id) => setSel({ kind: 'widget', m: mi, s: si, id })}
                onRemove={removeWidget}
                onReorder={(from, to) => editScreen((s) => move(s.placedWidgets, from, to))}
                onOpenPicker={(at) => setPicker({ open: true, at })}
                onAdd={addWidget}
              />
            </>
          ) : (
            <div className="empty">Open a page from the sidebar on the left to place widgets on it.</div>
          )}
        </main>

        {sel && !picker?.open && view !== 'submit' && (
          <aside className="bd-right">
            <div className="pane-h"><b>Inspector</b><span className="grow" /><button type="button" className="lnk" aria-label="Close inspector" onClick={() => setSel(null)}>✕</button></div>
            {sel.kind === 'menu' && menu && (
              <MenuInspector
                menu={menu}
                idLocked={publishedIds.has(`m:${menu.id}`)}
                onChange={(patch) => edit((l) => Object.assign(l.menus[mi], patch))}
                onMove={moveSel}
                onDelete={() => deleteMenu(mi)}
              />
            )}
            {sel.kind === 'screen' && menu && screen && (
              <ScreenInspector
                screen={screen}
                route={screenRoute(menu, screen)}
                resources={screenResources(screen, DEFS)}
                idLocked={publishedIds.has(`p:${screen.id}`)}
                onChange={(patch) => edit((l) => Object.assign(l.menus[mi].screens[si], patch))}
                onMove={moveSel}
                onDelete={deletePage.bind(null, mi, si)}
              />
            )}
            {sel.kind === 'widget' && placed && placedDef && (
              <PlacedInspector
                def={placedDef}
                placed={placed}
                onSpan={(t, v) =>
                  editScreen((s) => {
                    const it = s.placedWidgets.find((p) => p.id === placed.id);
                    if (it) it.span = { ...it.span, [t]: v };
                  })
                }
                onConfig={(key, v) =>
                  editScreen((s) => {
                    const it = s.placedWidgets.find((p) => p.id === placed.id);
                    if (it) it.config = { ...it.config, [key]: v };
                  })
                }
                onRemove={() => removeWidget(placed.id)}
              />
            )}
          </aside>
        )}
      </div>

      {view === 'submit' && (
        <SubmitSheet
          layout={layout as PortalLayout}
          portalLabel={portalLabel}
          findings={findings}
          errorCount={errors.length}
          onClose={() => setParam('view', null)}
          onJump={(s) => {
            setSel(s);
            setParam('view', null);
          }}
          onOpen={(l) => {
            setLayout(l);
            setSel(null);
          }}
        />
      )}

      <WidgetPicker
        open={!!picker?.open && !locked}
        widgets={pickerWidgets}
        insertAt={picker?.at ?? null}
        serverIds={serverIds}
        onPick={(id) => addWidget(id, picker?.at ?? (screen?.placedWidgets.length ?? 0))}
        onClose={() => setPicker(null)}
      />

      {dialog?.kind === 'menu' && (
        <ConfirmDialog
          title={`Delete menu “${layout.menus[dialog.m]?.label ?? ''}”?`}
          body="Its pages and everything placed on them go with it. This can be undone with ↺ until you reload."
          confirmLabel="Delete menu"
          destructive
          onConfirm={() => {
            const m = dialog.m;
            edit((l) => l.menus.splice(m, 1));
            setSel(null);
            setDialog(null);
            setToast('Menu deleted · Undo');
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'discard' && (
        <ConfirmDialog
          title="Discard this draft?"
          body="The editor copy goes back to the start choice; the live portal is not touched. This can be undone with ↺ until you reload."
          confirmLabel="Discard draft"
          destructive
          onConfirm={() => {
            setDialog(null);
            setLayout(null); // the local copy is kept in history (↺ brings it back)
            setSel(null);
            setHist(emptyHistory());
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {toast && <Toast text={toast} undoable={!locked && hist.past.length > 0} onUndo={undo} onDismiss={() => setToast(null)} />}
      {locked && view !== 'submit' && (
        <div className="locknote dim small">Waiting for approval — the draft is locked. A different platform administrator decides; open the sheet to see its state.</div>
      )}
    </>
  );
}

/** A rename the rail should start with on its next render (fresh menus/pages). */
type RenameSeed = { kind: 'menu' | 'page'; m: number; s: number };

/** Session-tenant plumbing kept out of the component tree: resolve root tenant id. */
function usePendingPublishFor(draftId: string | null, enabled: boolean) {
  const root = useRootTenantId();
  return usePendingPublish(root, draftId, enabled && !!root);
}
function useLastDecisionFor(enabled: boolean) {
  const root = useRootTenantId();
  return useLastDecision(root, enabled && !!root);
}
function useRootTenantId(): string | null {
  const session = useSession();
  return session.user?.tenantId ?? null;
}
