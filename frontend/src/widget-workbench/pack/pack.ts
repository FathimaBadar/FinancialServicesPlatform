/**
 * FSP widget pack — the text an LLM produces from docs/skills/fsp-widget-author/SKILL.md and
 * a developer pastes into the workbench's "New widget" page. Pure parsing + static checks,
 * shared by the browser (instant feedback) and the dev-only Vite plugin (authoritative,
 * tools/widget-pack/vite-plugin.ts), which also type-checks, lints and loads the code.
 *
 *   === FSP-WIDGET-PACK v1 ===
 *   id: inventory.lowstock
 *   label: Low stock
 *   summary: one line
 *   === FILE: index.tsx ===
 *   …
 *   === FILE: widget.tsx ===
 *   …
 *   === END PACK ===
 *
 * Pack code is UNTRUSTED (LLM output): it may only import the design system + widget runtime,
 * never reach the network directly (all data goes through the port + data.ts mappings), and
 * may only touch its own folder.
 */

export interface PackFile {
  name: string;
  content: string;
}

export interface WidgetPack {
  id: string;
  area: string;
  name: string;
  label: string;
  summary: string;
  files: PackFile[];
}

export interface PackIssue {
  file?: string;
  message: string;
}

export type ParseResult = { ok: true; pack: WidgetPack } | { ok: false; issues: PackIssue[] };

export const PACK_HEADER = '=== FSP-WIDGET-PACK v1 ===';
const FILE_RE = /^=== FILE: (.+?) ===\s*$/;
const END_RE = /^=== END PACK ===\s*$/;

/** "<area>.<name>", lower-case letters/digits, exactly two segments (folder <area>/<name>). */
export const WIDGET_ID_RE = /^[a-z][a-z0-9]{1,30}\.[a-z][a-z0-9]{1,30}$/;
const FILE_NAME_RE = /^[A-Za-z][A-Za-z0-9-]{0,40}\.(tsx|ts)$/;
export const MAX_FILES = 12;
export const MAX_BYTES = 200_000;

/** Module specifiers pack code may import (exact), plus same-folder relatives (./x). */
export const ALLOWED_IMPORTS: readonly string[] = [
  'react',
  'clsx',
  'zod',
  'date-fns',
  'lucide-react',
  '@tanstack/react-query',
  '../../core/manifest',
  '../../core/grid',
  '../../core/runtime',
  '../../core/sources',
  '../../core/ports',
  '../../../ui/atoms',
  '../../../ui/status-maps',
  '../../../web-core/api',
  '../../kit/Drawer',
  '../../kit/FormField',
  '../../kit/SelectField',
  '../../kit/TextAreaField',
  '../../kit/InlineConfirm',
  '../../kit/Notice',
];

/** Things LLM code must never contain (the port + data.ts are the only way to the server). */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bfetch\s*\(/, why: 'direct fetch() — read through port.request(...) instead' },
  { re: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|navigator\.sendBeacon/, why: 'direct network access' },
  { re: /\beval\s*\(|\bnew\s+Function\s*\(/, why: 'dynamic code evaluation' },
  { re: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/, why: 'raw HTML injection' },
  { re: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/, why: 'browser storage / cookies' },
  { re: /window\.location|document\.location|window\.open\s*\(|\bpostMessage\s*\(/, why: 'navigation / cross-window messaging' },
  { re: /import\.meta|\bprocess\.|\brequire\s*\(|\bimport\s*\(/, why: 'environment access or dynamic import' },
  { re: /:\s*any\b|\bas\s+any\b|<any>|any\[\]/, why: 'the any type (use unknown and narrow)' },
  { re: /https?:\/\//, why: 'absolute URL (only /api/... paths in data.ts)' },
  { re: /(className|style)[^\n]*#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, why: 'hard-coded colour (use design tokens)' },
];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

export function folderOf(id: string): { area: string; name: string } {
  const [area, name] = id.split('.');
  return { area, name };
}

/** Strip chat wrapping: a leading ``` fence line and trailing ``` line around a block. */
function unfence(block: string): string {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length && /^```[\w-]*\s*$/.test(lines[0].trim())) lines.shift();
  if (lines.length && /^```\s*$/.test(lines[lines.length - 1].trim())) lines.pop();
  return lines.join('\n') + '\n';
}

export function parsePack(text: string): ParseResult {
  const issues: PackIssue[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === PACK_HEADER);
  if (start < 0) return { ok: false, issues: [{ message: `No "${PACK_HEADER}" line — paste the whole pack the LLM produced.` }] };

  const meta: Record<string, string> = {};
  const files: PackFile[] = [];
  let current: { name: string; body: string[] } | null = null;
  let ended = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const f = FILE_RE.exec(line.trim());
    if (f || END_RE.test(line.trim())) {
      if (current) files.push({ name: current.name, content: unfence(current.body.join('\n')) });
      current = f ? { name: f[1].trim(), body: [] } : null;
      if (!f) {
        ended = true;
        break;
      }
      continue;
    }
    if (current) current.body.push(line);
    else {
      const m = /^([a-z]+):\s*(.*)$/.exec(line.trim());
      if (m) meta[m[1]] = m[2].trim();
    }
  }
  if (!ended) issues.push({ message: 'The pack has no "=== END PACK ===" line — it may have been cut off; copy it again.' });

  const id = meta.id ?? '';
  if (!WIDGET_ID_RE.test(id)) issues.push({ message: `id "${id}" must look like "area.name" (lower-case letters and digits, two parts).` });
  if (!meta.label) issues.push({ message: 'label: is missing.' });
  issues.push(...checkFiles(files, id));
  if (issues.length) return { ok: false, issues };
  const { area, name } = folderOf(id);
  return { ok: true, pack: { id, area, name, label: meta.label, summary: meta.summary ?? '', files } };
}

function checkFiles(files: PackFile[], id: string): PackIssue[] {
  const issues: PackIssue[] = [];
  const names = new Set<string>();
  let bytes = 0;
  if (files.length === 0) issues.push({ message: 'The pack has no files.' });
  if (files.length > MAX_FILES) issues.push({ message: `At most ${MAX_FILES} files per widget.` });
  for (const f of files) {
    bytes += f.content.length;
    if (!FILE_NAME_RE.test(f.name)) {
      issues.push({ file: f.name, message: 'File names are plain names in the widget folder (letters, digits, -), ending .ts or .tsx — no folders.' });
      continue;
    }
    if (names.has(f.name)) issues.push({ file: f.name, message: 'Duplicate file.' });
    names.add(f.name);
  }
  for (const f of files) if (FILE_NAME_RE.test(f.name)) issues.push(...checkSource(f, names));
  if (bytes > MAX_BYTES) issues.push({ message: `The pack is larger than ${MAX_BYTES / 1000} kB.` });
  for (const required of ['index.tsx', 'widget.tsx', 'data.ts']) {
    if (!names.has(required)) issues.push({ message: `${required} is required.` });
  }
  const index = files.find((f) => f.name === 'index.tsx');
  if (index && id) {
    if (!index.content.includes('defineWidget(')) issues.push({ file: 'index.tsx', message: 'must call defineWidget({...}).' });
    if (!new RegExp(`id:\\s*['"]${id.replace('.', '\\.')}['"]`).test(index.content)) {
      issues.push({ file: 'index.tsx', message: `the manifest id must be '${id}' (same as the pack header).` });
    }
    if (!/export\s+default\b/.test(index.content)) issues.push({ file: 'index.tsx', message: 'must `export default` the widget.' });
  }
  return issues;
}

function checkSource(f: PackFile, siblings: Set<string>): PackIssue[] {
  const issues: PackIssue[] = [];
  // comments may mention anything; check code only
  const code = f.content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    if (spec.startsWith('./')) {
      const base = spec.slice(2);
      if (base.includes('/') || ![`${base}.ts`, `${base}.tsx`].some((n) => siblings.has(n))) {
        issues.push({ file: f.name, message: `import "${spec}" — only files in this pack.` });
      }
      continue;
    }
    if (!ALLOWED_IMPORTS.includes(spec)) {
      issues.push({ file: f.name, message: `import "${spec}" is not allowed (design system + widget runtime only).` });
    }
  }
  for (const rule of FORBIDDEN) {
    // data.ts is where /api paths live; absolute URLs are still banned there
    if (rule.re.test(code)) issues.push({ file: f.name, message: `not allowed: ${rule.why}.` });
  }
  if (f.name !== 'data.ts' && /['"`]\/api\//.test(code)) {
    issues.push({ file: f.name, message: '"/api/..." paths belong in data.ts only — components use logical source names.' });
  }
  return issues;
}

/* ------------------------------------------------------------- endpoints */

export interface Endpoint {
  /** operation id from core's catalog or the plugin manifest */
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** BFF path the browser calls, e.g. /api/tenants/{tenantId}/users */
  path: string;
  permission: string;
  risk: string;
  title: string;
}

export interface DataRequest {
  method: string;
  path: string;
  query?: readonly string[];
}

/** Path templates are equal when they match segment by segment ({x} matches any {y}). */
function sameTemplate(a: string, b: string): boolean {
  const sa = a.split('/');
  const sb = b.split('/');
  if (sa.length !== sb.length) return false;
  return sa.every((s, i) => (s.startsWith('{') && sb[i].startsWith('{')) || s === sb[i]);
}

/**
 * Validates a loaded data.ts against the endpoint catalog: every entry must be named
 * "<widget id>.<thing>", call an existing operation (method + path template), and never
 * carry its own query string (use `query: [...]` allow-lists).
 */
export function checkDataModule(
  id: string,
  mod: { sources?: Record<string, Record<string, DataRequest>>; commands?: Record<string, Record<string, DataRequest>> },
  endpoints: readonly Endpoint[],
): PackIssue[] {
  const issues: PackIssue[] = [];
  const check = (kind: 'sources' | 'commands', entries: Record<string, Record<string, DataRequest>> | undefined) => {
    for (const [name, perPortal] of Object.entries(entries ?? {})) {
      if (!name.startsWith(`${id}.`)) issues.push({ file: 'data.ts', message: `${kind} "${name}" must be named "${id}.<something>".` });
      for (const [portal, req] of Object.entries(perPortal)) {
        const where = `${kind} "${name}" [${portal}]`;
        if (!req || typeof req.path !== 'string' || typeof req.method !== 'string') {
          issues.push({ file: 'data.ts', message: `${where}: needs { method, path }.` });
          continue;
        }
        if (kind === 'sources' && req.method !== 'GET') issues.push({ file: 'data.ts', message: `${where}: sources are GET; writes go in commands.` });
        if (kind === 'commands' && req.method === 'GET') issues.push({ file: 'data.ts', message: `${where}: commands are writes (POST/PUT/PATCH/DELETE).` });
        if (req.path.includes('?')) issues.push({ file: 'data.ts', message: `${where}: no "?" in path — list allowed params in query: [...].` });
        const hit = endpoints.find((e) => e.method === req.method && sameTemplate(e.path, req.path.split('?')[0]));
        if (!hit) issues.push({ file: 'data.ts', message: `${where}: ${req.method} ${req.path} is not an existing endpoint (see the skill's endpoint list).` });
      }
    }
  };
  check('sources', mod.sources);
  check('commands', mod.commands);
  return issues;
}

/** The text the user pastes into an LLM: the skill, then the requirement, then the answer rule. */
export function llmInput(skill: string, requirement: string): string {
  return [
    skill.trim(),
    '',
    '---',
    '',
    '# Requirement',
    '',
    requirement.trim(),
    '',
    '---',
    '',
    'Follow the fsp-widget-author skill above exactly. Answer with one sentence and the widget pack (§1 step 4),',
    'or with NEEDS BACKEND (§1 step 2), or with at most two questions if something essential is ambiguous (§1 step 3).',
    '',
  ].join('\n');
}
