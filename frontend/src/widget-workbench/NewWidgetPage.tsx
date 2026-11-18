/**
 * New widget (paste) — the end of the LLM loop in docs/skills/fsp-widget-author/SKILL.md:
 *   1. copy the skill into any LLM + type the requirement;
 *   2. paste the LLM's reply here;
 *   3. Check & register: the dev-only Vite plugin (tools/widget-pack/vite-plugin.ts) stages the
 *      files, loads them, runs TypeScript + ESLint (+ the pack's tests); this page registers the
 *      widget with core under YOUR session (PUT /api/ui/widgets — ui.widget.register, core
 *      re-checks); the plugin then moves the folder into widgets/<area>/<name>/ and the preview
 *      opens. Placing it on a portal screen stays the Builder's four-eyes publish.
 * Dev server only: in a production build the endpoints do not exist and this page says so.
 */
import { useMemo, useState } from 'react';
import { apiPut, readProblem } from '../portals/shared/web-core/api';
import { WORKBENCH_PORTAL } from '../portals/portal-config';
import { useConnection } from './connection';
import { llmInput, parsePack } from './pack/pack';
import type { PackIssue } from './pack/pack';

interface Check {
  step: string;
  ok: boolean;
  output: string;
}

interface StageResult {
  ok: boolean;
  id?: string;
  area?: string;
  name?: string;
  sha?: string;
  files?: string[];
  checks: Check[];
  issues: PackIssue[];
  registration?: Record<string, unknown> | null;
  error?: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'failed'; result: StageResult | null; message?: string }
  | { kind: 'registering'; result: StageResult }
  | { kind: 'done'; result: StageResult; registered: string; path: string };

const ENDPOINT = '/__fsp/widget-pack';

async function devCall<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-FSP-Widget-Pack': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 && path === '/skill') throw new Error('SKILL.md not generated yet — run: bun run widgets:skill');
  if (!res.ok && res.headers.get('content-type')?.includes('application/json') !== true) {
    throw new Error('The widget-pack tool runs only on the dev server (bun run workbench).');
  }
  if (path === '/skill') return (await res.text()) as T;
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function NewWidgetPage() {
  const conn = useConnection();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copied, setCopied] = useState<string | null>(null);
  const [requirement, setRequirement] = useState('');

  const preview = useMemo(() => (text.trim() ? parsePack(text) : null), [text]);

  /** Copies the skill alone, or the full LLM input: skill + the requirement + the answer instruction. */
  const copyForLlm = async (withRequirement: boolean) => {
    try {
      const skill = await devCall<string>('/skill');
      const input = withRequirement ? llmInput(skill, requirement) : skill;
      await navigator.clipboard.writeText(input);
      setCopied(withRequirement
        ? `Copied the LLM input (${Math.round(input.length / 1000)} kB: skill + your requirement). Paste it into a new LLM chat and send it.`
        : `Copied SKILL.md (${Math.round(skill.length / 1000)} kB) — paste it into your LLM, then your requirement.`);
    } catch (e) {
      setCopied(e instanceof Error ? e.message : String(e));
    }
  };

  const checkAndRegister = async () => {
    setPhase({ kind: 'checking' });
    let result: StageResult;
    try {
      result = await devCall<StageResult>('/stage', { text });
    } catch (e) {
      setPhase({ kind: 'failed', result: null, message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (!result.ok || !result.id || !result.sha) {
      setPhase({ kind: 'failed', result });
      return;
    }
    setPhase({ kind: 'registering', result });

    // register with core under the signed-in session (core decides ui.widget.register)
    let registered: string;
    if (conn.status !== 'connected') {
      registered = 'Not registered with core — sign in (bar above), then Registry → Register.';
    } else {
      try {
        await apiPut('/api/ui/widgets', result.registration);
        registered = 'Registered with core (ui.widget.register).';
      } catch (e) {
        const p = readProblem(e);
        registered = `Core refused the registration (${p.status} ${p.code ?? ''}): ${p.detail} — the code is still added; register later from Registry.`;
      }
    }

    // Vite full-reloads the page as soon as the folder lands (possibly before /commit answers):
    // point the address bar at the preview FIRST, so whichever reload happens lands there.
    const back = window.location.href;
    const outcome = new URLSearchParams({ added: `src/portals/shared/widgets/${result.area}/${result.name}`, registered });
    const previewUrl = `${WORKBENCH_PORTAL.basePath}/w/${result.id}?${outcome.toString()}`;
    window.history.replaceState(window.history.state, '', previewUrl);
    try {
      const c = await devCall<{ ok: boolean; path?: string; error?: string }>('/commit', { id: result.id, sha: result.sha });
      if (!c.ok) throw new Error(c.error ?? 'commit failed');
      setPhase({ kind: 'done', result, registered, path: c.path ?? '' });
      window.location.assign(previewUrl);
    } catch (e) {
      window.history.replaceState(window.history.state, '', back);
      setPhase({ kind: 'failed', result, message: e instanceof Error ? e.message : String(e) });
    }
  };

  const busy = phase.kind === 'checking' || phase.kind === 'registering';
  const result = phase.kind === 'failed' || phase.kind === 'registering' || phase.kind === 'done' ? phase.result : null;

  return (
    <>
      <h1>New widget</h1>

      <h2>1 · Describe the widget</h2>
      <p className="dim small">
        What should it show, who uses it, what can they do? Name the data if you know it (e.g. &ldquo;pending approvals for my
        organization, newest first, with approve and reject&rdquo;). Optionally paste a sample API response after it.
      </p>
      <textarea
        aria-label="Widget requirement"
        className="pack"
        style={{ minHeight: '7rem', fontFamily: 'inherit', fontSize: 13 }}
        value={requirement}
        onChange={(e) => setRequirement(e.target.value)}
        placeholder="e.g. A card listing my organization's users who are disabled, with a button to re-activate each one."
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" disabled={requirement.trim().length < 10} onClick={() => void copyForLlm(true)}>
          Copy LLM input
        </button>
        <span className="dim small">
          skill + your requirement, ready to paste into any LLM chat ·{' '}
          <button type="button" className="lnk" onClick={() => void copyForLlm(false)}>copy the skill only</button>
        </span>
      </div>
      {copied && <p className="small ok">{copied}</p>}

      <h2>2 · Paste the LLM&apos;s reply</h2>
      <p className="dim small">
        Copy its whole reply (it contains a block starting <span className="mono">=== FSP-WIDGET-PACK v1 ===</span>). If it answered
        <span className="mono"> NEEDS BACKEND</span>, the data doesn&apos;t exist yet; a developer has to add the endpoint first.
      </p>

      <textarea
        aria-label="LLM reply containing the widget pack"
        className="mono pack"
        spellCheck={false}
        value={text}
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value);
          if (phase.kind !== 'idle' && !busy) setPhase({ kind: 'idle' });
        }}
        placeholder="Paste the LLM's reply here…"
      />

      {preview && !preview.ok && (
        <div className="small">
          <p className="bad">The pack isn&apos;t valid yet — ask the LLM to fix these (paste this list back to it):</p>
          <IssueList issues={preview.issues} />
        </div>
      )}
      {preview?.ok && (
        <p className="small">
          <span className="ok">Pack looks complete:</span> <b>{preview.pack.label}</b> · <span className="mono">{preview.pack.id}</span> →{' '}
          <span className="mono">shared/widgets/{preview.pack.area}/{preview.pack.name}/</span> ({preview.pack.files.map((f) => f.name).join(', ')})
        </p>
      )}

      <h2>3 · Check &amp; register</h2>
      <p className="dim small">
        Writes <span className="mono">shared/widgets/&lt;area&gt;/&lt;name&gt;/</span>, type-checks and lints it, registers it with core
        and opens the preview. Put it on a portal from the Portal builder (four-eyes publish).
      </p>
      <div className="row-b" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <button type="button" className="btn primary" disabled={busy || !preview?.ok} onClick={() => void checkAndRegister()}>
          {phase.kind === 'checking' ? 'Checking… (TypeScript + ESLint)' : phase.kind === 'registering' ? 'Registering…' : 'Check & register'}
        </button>
        {conn.status !== 'connected' && <span className="warn small">Signed out: the code will be added, but registering with core needs a sign-in.</span>}
      </div>

      {phase.kind === 'failed' && phase.message && <p className="bad">{phase.message}</p>}
      {result && (
        <>
          {result.issues.length > 0 && (
            <>
              <h2>Problems</h2>
              <IssueList issues={result.issues} />
            </>
          )}
          {result.checks.length > 0 && (
            <>
              <h2>Checks</h2>
              <table>
                <thead><tr><th>Step</th><th>Result</th><th>Output</th></tr></thead>
                <tbody>
                  {result.checks.map((c) => (
                    <tr key={c.step} className={c.ok ? undefined : 'err'}>
                      <td>{c.step}</td>
                      <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? 'passed' : 'failed'}</td>
                      <td><pre className="mono small" style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 220, overflow: 'auto' }}>{c.output || '—'}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {phase.kind === 'failed' && <p className="small dim">Nothing was kept. Paste the failures back to the LLM, then paste its corrected pack here.</p>}
            </>
          )}
        </>
      )}

      {phase.kind === 'done' && (
        <div className="small" style={{ marginTop: 12 }}>
          <p className="ok">Added <span className="mono">{phase.path}</span>.</p>
          <p className={phase.registered.startsWith('Registered') ? 'ok' : 'warn'}>{phase.registered}</p>
          <p>
            <a className="btn primary" href={`${WORKBENCH_PORTAL.basePath}/w/${phase.result.id}`}>Open the preview</a>{' '}
            <span className="dim">(a full page load, so this build&apos;s registry includes the new widget)</span>
          </p>
        </div>
      )}
    </>
  );
}

function IssueList({ issues }: { issues: PackIssue[] }) {
  return (
    <ul className="small mono" style={{ paddingLeft: '1.2em' }}>
      {issues.map((i, n) => (
        <li key={n}>{i.file ? `${i.file}: ` : ''}{i.message}</li>
      ))}
    </ul>
  );
}
