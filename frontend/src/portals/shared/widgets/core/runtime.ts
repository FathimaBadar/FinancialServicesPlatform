/**
 * Widget runtime hooks — SME WIDGET_CONTEXT + PAGE_SELECTION + data port, React form.
 * Non-component surface (context + hooks): context.tsx owns the react-refresh-safe
 * widget-context provider; widget components fetch with plain hooks from here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Tier } from './grid';
import type { WidgetDataPortLike, WidgetHostContextLike } from './manifest';

export interface WidgetRuntimeValue {
  context: WidgetHostContextLike & { tier: Tier; widthPx: number };
  port: WidgetDataPortLike;
}

export const WidgetCtx = createContext<WidgetRuntimeValue | null>(null);

export function useWidgetRuntime(): WidgetRuntimeValue {
  const v = useContext(WidgetCtx);
  if (!v) throw new Error('useWidgetRuntime outside a widget host');
  return v;
}

/** Tiny selection store — page-level signal store (SME PAGE_SELECTION). */
export function usePageSelection(initial: Record<string, string> = {}) {
  const [sel, setSel] = useState<Record<string, string>>(initial);
  const select = useCallback((key: string, value: string) => {
    setSel((s) => (s[key] === value ? s : { ...s, [key]: value }));
  }, []);
  return useMemo(() => ({ selection: sel, select }), [sel, select]);
}

/**
 * The standard data lifecycle for widget components: fetch through the host's
 * port, expose loading/ready/empty/error/forbidden + retry. Widgets stay
 * declarative; the port records everything (network panel + diagnostics).
 */
export function usePortData<T>(
  run: (port: WidgetDataPortLike) => Promise<T>,
  deps: unknown[] = [],
): {
  state: 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
  data: T | null;
  problem?: { title: string; detail: string; code?: string };
  reload: () => void;
} {
  const rt = useContext(WidgetCtx);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error' | 'forbidden'>('loading');
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<{ title: string; detail: string; code?: string } | undefined>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // superseded runs (reload → new effect) resolve into nothing: the old closure is dead
    let active = true;
    if (!rt) {
      setState('error');
      return undefined;
    }
    setState('loading');
    run(rt.port)
      .then((d) => {
        if (!active) return undefined;
        setData(d);
        setState(d === null || d === undefined || (Array.isArray(d) && d.length === 0) ? 'empty' : 'ready');
        return undefined;
      })
      .catch((e: unknown) => {
        if (!active) return undefined;
        const msg = e instanceof Error ? e.message : String(e);
        if (/AUTH_FORBIDDEN|403/.test(msg)) setState('forbidden');
        else {
          setProblem({ title: 'Request failed', detail: msg, code: 'ERR' });
          setState('error');
        }
        return undefined;
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { state, data, problem, reload: () => setTick((t) => t + 1) };
}
