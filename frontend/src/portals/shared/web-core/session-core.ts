/**
 * Core of the browser session — ported from SME `BrowserSessionService` + portal auth.
 * The browser sees ONLY a user summary + permission keys from `/api/me/permissions`; the
 * IdP token lives server-side behind the BFF session (FAPI2 UI mandate). Non-component
 * surface (types, loaders, hook): session.tsx owns the react-refresh-safe provider.
 *
 * Hydration chain (once per portal load):
 *   GET /bff/session → user summary (or false)
 *   GET /api/me/permissions → held permission keys (through gateway → core RBAC)
 *   GET /api/tenants/{tid} → tenant subType for org-portal eligibility
 */
import { createContext, useContext } from 'react';
import { apiGet, apiPost, ApiError } from './api';
import type { PortalConfig } from '../../portal-config';

export interface SessionUser {
  userId: string;
  username: string;
  fullName: string;
  tenantId: string;
  tenantName: string | null;
  tenantType: string | null;
  roles: string[];
}

export interface TenantSummary {
  id: string;
  subType: string | null;
  status: string;
  type: string;
  legalName: string | null;
  parentTenantId: string | null;
  depth: number;
  hierarchyPath: string;
}

export interface SessionState {
  status: 'loading' | 'anon' | 'authed';
  user: SessionUser | null;
  permissions: string[];
  tenant: TenantSummary | null;
}

export const NO_SESSION: SessionState = { status: 'loading', user: null, permissions: [], tenant: null };

/** GET /bff/session (BffSessionController). */
export async function fetchWho(): Promise<SessionUser | null> {
  try {
    const r = await apiGet<{ authenticated: boolean; user: SessionUser | null }>('/bff/session');
    return r.authenticated ? r.user : null;
  } catch {
    return null;
  }
}

/** Org-portal eligibility: the session's tenant subType must match the portal. */
export async function loadTenant(tenantId: string): Promise<TenantSummary | null> {
  try {
    return await apiGet<TenantSummary>(`/api/tenants/${tenantId}`);
  } catch {
    return null;
  }
}

export async function loadPermissions(): Promise<string[]> {
  try {
    const r = await apiGet<{ tenantId: string; permissions: string[] }>('/api/me/permissions');
    return r.permissions;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'AUTH_REQUIRED') throw e; // session expired → bounce to login
    return [];
  }
}

export async function doLogin(username: string, password: string): Promise<SessionUser> {
  await apiPost('/bff/auth/login', { username, password });
  const user = await fetchWho();
  if (!user) throw new ApiError({ status: 0, title: 'Login failed', detail: 'session could not be established' });
  return user;
}

/** Top-level form post so the browser follows the session teardown. */
export async function doLogout(): Promise<void> {
  try {
    await apiPost('/bff/auth/logout');
  } finally {
    window.location.href = '/login';
  }
}

/** Eligibility of ONE hydrated session against ONE portal identity. */
export function portalEligible(portal: PortalConfig, user: SessionUser | null, tenant: TenantSummary | null): boolean {
  if (!user) return false;
  if (portal.tenantSubType === 'PLATFORM') return user.tenantType === 'PLATFORM';
  if (tenant && tenant.subType) return tenant.subType === portal.tenantSubType;
  return false;
}

export interface SessionCtl extends SessionState {
  eligible: boolean | undefined; // undefined while loading tenant detail
  refresh: () => Promise<void>;
}

export const SessionCtx = createContext<SessionCtl>({ ...NO_SESSION, eligible: undefined, refresh: async () => {} });

export function useSession(): SessionCtl {
  return useContext(SessionCtx);
}

/** OR-semantics permission check against held keys (SME AccessService.can). */
export function can(permissions: string[], anyOf: string[]): boolean {
  return anyOf.some((k) => permissions.includes(k));
}
