import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiPost } from '../portals/shared/web-core/api';
import { useSession } from '../portals/shared/web-core/session-core';
import { ConnectionCtx, hostedSignIn } from './connection';
import type { ConnectionStatus, ConnectionValue } from './connection';

const BUILD_KEYS = ['ui.layout.manage', 'ui.widget.register'];

export interface ConnectionProviderProps {
  children: ReactNode;
}

/** Derives the workbench connection from the BFF session (SessionProvider above it). */
export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const session = useSession();
  const [useRealAccess, setUseRealAccess] = useState(true);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/bff/auth/logout');
    } finally {
      // stay in the workbench: fixtures keep working signed out
      await session.refresh();
    }
  }, [session]);

  const value = useMemo<ConnectionValue>(() => {
    const status: ConnectionStatus =
      session.status === 'loading' ? 'checking'
      : session.status === 'anon' ? 'signed-out'
      : session.eligible === false ? 'not-eligible'
      : 'connected';
    const permissions = status === 'connected' ? session.permissions : [];
    return {
      status,
      who: session.user?.username ?? '',
      orgId: session.user?.tenantId ?? null,
      orgName: session.user?.tenantName ?? null,
      permissions,
      canBuild: BUILD_KEYS.some((k) => permissions.includes(k)),
      useRealAccess,
      setUseRealAccess,
      signIn: hostedSignIn,
      signOut,
      refresh: session.refresh,
    };
  }, [session, useRealAccess, signOut]);

  return <ConnectionCtx.Provider value={value}>{children}</ConnectionCtx.Provider>;
}
