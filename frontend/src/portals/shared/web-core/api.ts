/**
 * THE one network path for portal code (SME `WidgetDataPort` idea, FSP BFF lane):
 * every call goes through the same-origin BFF — cookie session, CSRF double-submit,
 * token stays server-side (FAPI2 UI mandate). Never fetch, never cookies:false.
 */
export interface ApiProblem {
  status: number;
  code?: string;
  title: string;
  detail: string;
}

export class ApiError extends Error implements ApiProblem {
  readonly status: number;
  readonly code?: string;
  readonly title: string;
  readonly detail: string;
  readonly problem: ApiProblem;
  constructor(p: ApiProblem) {
    super(`${p.code ?? p.status}: ${p.detail}`);
    this.status = p.status;
    this.code = p.code;
    this.title = p.title;
    this.detail = p.detail;
    this.problem = p;
  }
}

export function readProblem(err: unknown): ApiProblem {
  if (err instanceof ApiError) return { status: err.status, code: err.code, title: err.title, detail: err.message };
  return { status: 0, title: 'Network error', detail: String(err instanceof Error ? err.message : err) };
}

let csrf: { headerName: string; token: string } | null = null;

/** Materializes the CSRF cookie once per session (BffSessionController /bff/csrf). */
export async function ensureCsrf(): Promise<void> {
  if (csrf) return;
  const r = await fetch('/bff/csrf', { credentials: 'same-origin' });
  if (r.ok) csrf = (await r.json()) as { headerName: string; token: string };
}

/** GETs session-cached CSRF token (after ensureCsrf); force = re-read the cookie. */
export async function getCsrf(force = false): Promise<string | null> {
  if (!csrf || force) await ensureCsrf();
  return csrf?.token ?? null;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiOpts {
  method?: HttpMethod;
  body?: unknown;
  /** skip the CSRF dance (GET) */
  raw?: boolean;
  /**
   * AGENTS §2e: every mutation carries an Idempotency-Key. Pass the SAME key to retry one
   * logical action; omitted → a fresh UUIDv4 per call.
   */
  idempotencyKey?: string;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Same-origin BFF call. `/api/...` rides BffProxyController → gateway → core;
 * `/bff/...` are the session-control endpoints. 401 → `AuthRequiredError`.
 */
export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/problem+json, application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = await getCsrf();
    if (token) headers['X-XSRF-TOKEN'] = token;
    headers['Idempotency-Key'] = opts.idempotencyKey ?? newIdempotencyKey();
  }
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).catch(() => {
    throw new ApiError({ status: 0, title: 'Network error', detail: 'BFF unreachable' });
  });
  if (r.status === 401) throw new ApiError({ status: 401, code: 'AUTH_REQUIRED', title: 'Not authenticated', detail: 'session required' });
  if (r.status === 403) {
    // ui-std §5.2: a denial names WHAT was denied — keep the server's detail + code when present
    const pd = (await r.json().catch(() => null)) as { code?: string; detail?: string } | null;
    throw new ApiError({
      status: 403,
      code: 'AUTH_FORBIDDEN',
      title: pd?.code ?? 'Forbidden',
      detail: pd?.detail ?? 'the server refused this call',
    });
  }
  if (!r.ok) {
    const pd = (await r.json().catch(() => null)) as
      | { code?: string; title?: string; detail?: string }
      | null;
    throw new ApiError({
      status: r.status,
      code: pd?.code,
      title: pd?.title ?? `HTTP ${r.status}`,
      detail: pd?.detail ?? r.statusText,
    });
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const apiGet = <T,>(path: string) => api<T>(path, { method: 'GET' });

export function apiPost<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'POST', body });
}

export function apiPut<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'PUT', body });
}

export function apiPatch<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'PATCH', body });
}

export function apiDelete<T>(path: string) {
  return api<T>(path, { method: 'DELETE' });
}
