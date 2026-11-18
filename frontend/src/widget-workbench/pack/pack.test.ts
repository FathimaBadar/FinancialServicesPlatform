import { describe, expect, it } from 'vitest';
import { checkDataModule, llmInput, parsePack } from './pack';
import type { Endpoint } from './pack';

const INDEX = `import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { Trail } from './widget';
const w = defineWidget({ id: 'audit.trail', version: '1.0.0', label: 'Audit trail', contexts: ['ANY'], requires: ['audit.view'],
  sources: ['audit.trail.page'], size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) }, render: Trail });
export default w;
`;
const WIDGET = `import { useWidgetRuntime } from '../../core/runtime';
export function Trail() { const { context } = useWidgetRuntime(); return <div>{context.orgId}</div>; }
`;
const DATA = `import type { DataSources } from '../../core/sources';
export const sources: DataSources = { 'audit.trail.page': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/audit', query: ['page'] } } };
`;

function pack(files: Record<string, string>, id = 'audit.trail') {
  return [
    'Here is your widget:',
    '```text',
    '=== FSP-WIDGET-PACK v1 ===',
    `id: ${id}`,
    'label: Audit trail',
    'summary: who did what',
    ...Object.entries(files).flatMap(([n, c]) => [`=== FILE: ${n} ===`, '```tsx', c, '```']),
    '=== END PACK ===',
    '```',
  ].join('\n');
}

const OK = { 'index.tsx': INDEX, 'widget.tsx': WIDGET, 'data.ts': DATA };

describe('parsePack', () => {
  it('parses a pack wrapped in chat fences and strips per-file fences', () => {
    const r = parsePack(pack(OK));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack).toMatchObject({ id: 'audit.trail', area: 'audit', name: 'trail', label: 'Audit trail' });
    expect(r.pack.files.map((f) => f.name)).toEqual(['index.tsx', 'widget.tsx', 'data.ts']);
    expect(r.pack.files[0].content.startsWith('import { defineWidget }')).toBe(true);
    expect(r.pack.files[0].content).not.toContain('```');
  });

  it('rejects a cut-off pack', () => {
    const r = parsePack(pack(OK).replace('=== END PACK ===', ''));
    expect(r.ok).toBe(false);
  });

  it('rejects a bad id and a manifest id mismatch', () => {
    expect(parsePack(pack(OK, 'Audit-Trail')).ok).toBe(false);
    const r = parsePack(pack(OK, 'audit.log'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.file === 'index.tsx' && /audit\.log/.test(i.message))).toBe(true);
  });

  it.each([
    ['direct fetch', `export function T() { void fetch('/x'); return null; }`],
    ['any', `export function T(p: any) { return p; }`],
    ['storage', `export function T() { localStorage.setItem('a', 'b'); return null; }`],
    ['foreign import', `import axios from 'axios';\nexport function T() { return axios; }`],
    ['escaping import', `import x from '../../../../secrets';\nexport const T = x;`],
    ['absolute url', `export const u = 'https://evil.example';`],
    ['raw html', `export function T() { return <div dangerouslySetInnerHTML={{ __html: '' }} />; }`],
    ['api path outside data.ts', `export const p = '/api/tenants';`],
    ['hex colour', `export function T() { return <div className="text-[#ff0000]" />; }`],
    ['dynamic import', `export const m = () => import('./widget');`],
  ])('rejects %s', (_label, code) => {
    const r = parsePack(pack({ ...OK, 'widget.tsx': WIDGET + code + '\n' }));
    expect(r.ok).toBe(false);
  });

  it('rejects folders in file names and missing required files', () => {
    expect(parsePack(pack({ ...OK, '../evil.ts': 'export {}' })).ok).toBe(false);
    const { 'data.ts': _drop, ...noData } = OK;
    void _drop;
    expect(parsePack(pack(noData)).ok).toBe(false);
  });

  it('allows comments mentioning forbidden things', () => {
    const r = parsePack(pack({ ...OK, 'widget.tsx': `// never call fetch() here\n${WIDGET}` }));
    expect(r.ok).toBe(true);
  });
});

describe('checkDataModule', () => {
  const endpoints: Endpoint[] = [
    { id: 'audit.list', method: 'GET', path: '/api/tenants/{tenantId}/audit', permission: 'audit.view', risk: 'READ', title: '' },
    { id: 'user.update', method: 'PATCH', path: '/api/tenants/{tenantId}/users/{personId}', permission: 'user.manage', risk: 'WRITE', title: '' },
  ];

  it('accepts existing endpoints with matching templates (param names may differ)', () => {
    expect(checkDataModule('audit.trail', {
      sources: { 'audit.trail.page': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/audit', query: ['page'] } } },
      commands: { 'audit.trail.fix': { '*': { method: 'PATCH', path: '/api/tenants/{tenantId}/users/{id}' } } },
    }, endpoints)).toEqual([]);
  });

  it('rejects unknown endpoints, wrong prefixes, inline queries and wrong verbs', () => {
    const issues = checkDataModule('audit.trail', {
      sources: {
        'other.name': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/audit' } },
        'audit.trail.q': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/audit?size=5' } },
        'audit.trail.post': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/audit' } },
        'audit.trail.secret': { '*': { method: 'GET', path: '/api/internal/keys' } },
      },
    }, endpoints);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/must be named "audit\.trail\./);
    expect(issues.some((i) => /no "\?"/.test(i.message))).toBe(true);
    expect(issues.some((i) => /sources are GET/.test(i.message))).toBe(true);
    expect(issues.some((i) => /\/api\/internal\/keys is not an existing endpoint/.test(i.message))).toBe(true);
  });
});

describe('llmInput', () => {
  it('puts the skill first, then the requirement, then the answer rule', () => {
    const t = llmInput('# SKILL\nrules', '  Show disabled users  ');
    expect(t.indexOf('# SKILL')).toBe(0);
    expect(t).toContain('# Requirement\n\nShow disabled users\n');
    expect(t.indexOf('Show disabled users')).toBeLessThan(t.indexOf('Follow the fsp-widget-author skill'));
  });
});
