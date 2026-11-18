/**
 * SessionProvider — the react-refresh-safe component surface of the session system.
 * All types/loaders/hooks live in session-core.ts.
 *
 * Hydration chain (once per portal load):
 *   GET /bff/session → user summary (or false)
 *   GET /api/me/permissions → held permission keys (through gateway → core RBAC)
 *   GET /api/tenants/{tid} → tenant subType for org-portal eligibility
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from './api';
import { SessionCtx, NO_SESSION, fetchWho, loadTenant, loadPermissions, portalEligible } from './session-core';
import type { SessionCtl, SessionState } from './session-core';
import type { PortalConfig } from '../../portal-config';

export function SessionProvider({ portal, children }: { portal: PortalConfig; children: ReactNode }) {
  const [state, setState] = useState<SessionState>(NO_SESSION);
  const [eligible, setEligible] = useState<boolean | undefined>(undefined);

  const refresh = useCallback(async () => {
    const user = await fetchWho();
    if (!user) {
      setState({ status: 'anon', user: null, permissions: [], tenant: null });
      setEligible(undefined);
      return;
    }
    try {
      const [permissions, tenant] = await Promise.all([
        loadPermissions(),
        user.tenantType !== 'PLATFORM' ? loadTenant(user.tenantId) : Promise.resolve(null),
      ]);
      setState({ status: 'authed', user, permissions, tenant });
      setEligible(portalEligible(portal, user, tenant));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_REQUIRED') {
        // IdP token expired (15 min) — bounce to login, not "no access"
        setState({ status: 'anon', user: null, permissions: [], tenant: null });
        setEligible(undefined);
        return;
      }
      throw e;
    }
  }, [portal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<SessionCtl>(() => ({ ...state, eligible, refresh }), [state, eligible, refresh]);
  return <SessionCtx.Provider value={{ ...value, refresh }}>{children}</SessionCtx.Provider>;
}
