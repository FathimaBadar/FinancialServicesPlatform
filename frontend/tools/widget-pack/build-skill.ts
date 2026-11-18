/**
 * bun run widgets:skill — regenerates the widget-author skill from core's LIVE operation catalog.
 *
 *   1. GET core /internal/ops/catalog  (core @FspOperation routes; dev internal credential)
 *   2. GET core /internal/ops/plugins  (registered plugin manifests' operations)
 *   3. writes src/widget-workbench/pack/endpoints.json  (the validator's allow-list)
 *   4. renders docs/skills/fsp-widget-author/SKILL.md from SKILL.template.md
 *
 * Env: FSP_CORE_URL (default http://localhost:8081), FSP_INTERNAL_CREDENTIAL (dev default).
 * Run it whenever endpoints change; commit both outputs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  permission: string;
  risk: string;
  title: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');
const REPO = join(FRONTEND, '..');
const ENDPOINTS_FILE = join(FRONTEND, 'src', 'widget-workbench', 'pack', 'endpoints.json');
const SKILL_FILE = join(REPO, 'docs', 'skills', 'fsp-widget-author', 'SKILL.md');
const TEMPLATE = join(HERE, 'SKILL.template.md');

const CORE = process.env.FSP_CORE_URL ?? 'http://localhost:8081';
const CRED = process.env.FSP_INTERNAL_CREDENTIAL ?? 'dev-internal-credential';

/** Machine-only, platform-plumbing or builder operations a portal widget must never call. */
const EXCLUDED = [
  /^approval\.open$/, /^approval\.plugin\./, /^plugin\.events\./, /^plugin\.installation\.(provisioning|ready)$/,
  /^tenant\.verification\./, /^tenant\.child\.create$/, /^ui\./, /^plugin\.register$/, /^plugin\.type\./,
  /^tenant\.act-as\./,
];

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(CORE + path, { headers: { 'X-FSP-Internal-Credential': CRED } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} (is core running on ${CORE}?)`);
  return res.json();
}

const toApi = (v1: string) => v1.replace(/^\/v1\//, '/api/');

async function main() {
  const catalog = (await getJson('/internal/ops/catalog')) as {
    digest: string;
    operations: { operationId: string; method: string; pathPattern: string; permission: string; risk: string; title: string }[];
  };
  const plugins = (await getJson('/internal/ops/plugins')) as Record<
    string,
    { operations?: { id: string; method: string; path: string; permission: string }[] } | string
  >;

  const endpoints: Endpoint[] = [];
  for (const op of catalog.operations) {
    if (!op.pathPattern.startsWith('/v1/') || EXCLUDED.some((r) => r.test(op.operationId))) continue;
    endpoints.push({
      id: op.operationId, method: op.method.toUpperCase() as Endpoint['method'], path: toApi(op.pathPattern),
      permission: op.permission ?? '', risk: op.risk ?? 'READ', title: op.title ?? '',
    });
  }
  for (const [code, v] of Object.entries(plugins)) {
    if (typeof v === 'string') continue;
    for (const op of v.operations ?? []) {
      const method = op.method.toUpperCase() as Endpoint['method'];
      endpoints.push({
        id: op.id, method, path: toApi(op.path), permission: op.permission,
        risk: method === 'GET' ? 'READ' : 'WRITE', title: `${code} plugin: ${op.id}`,
      });
    }
  }
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  mkdirSync(dirname(ENDPOINTS_FILE), { recursive: true });
  writeFileSync(ENDPOINTS_FILE, JSON.stringify({ digest: catalog.digest, endpoints }, null, 2) + '\n');

  const table = [
    '| Method | BFF path | perm | risk | what |',
    '|---|---|---|---|---|',
    ...endpoints.map((e) => `| ${e.method} | \`${e.path}\` | ${e.permission ? `\`${e.permission}\`` : '—'} | ${e.risk} | ${e.title} |`),
  ].join('\n');

  const skill = readFileSync(TEMPLATE, 'utf8')
    .replace('{{ENDPOINTS}}', table)
    .replace('{{GENERATED_AT}}', new Date().toISOString().slice(0, 10))
    .replace('{{CATALOG_DIGEST}}', catalog.digest.slice(0, 12));
  mkdirSync(dirname(SKILL_FILE), { recursive: true });
  writeFileSync(SKILL_FILE, skill);
  console.log(`widgets:skill — ${endpoints.length} endpoints → ${ENDPOINTS_FILE}\n               skill → ${SKILL_FILE}`);
}

main().catch((e: unknown) => {
  console.error(`widgets:skill failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
