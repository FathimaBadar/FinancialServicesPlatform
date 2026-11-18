/**
 * The workbench's connection to the real FSP API (SME widget-workbench/connection.ts).
 *
 * FAPI 2.0: the workbench is never an OAuth client. Signing in is a full-page redirect
 * BFF → PAR → the IdP's hosted sign-in page; afterwards the browser holds only the BFF
 * session cookie + CSRF value and talks same-origin `/api/**` (BFF → gateway → core).
 * Tokens, DPoP keys and client credentials stay server-side. Core remains the only policy
 * decision point: "use my real permissions" only PREVIEWS access client-side.
 */
import { createContext, useContext } from 'react';

export type ConnectionStatus = 'checking' | 'signed-out' | 'connected' | 'not-eligible';

export interface ConnectionValue {
  status: ConnectionStatus;
  who: string;
  orgId: string | null;
  orgName: string | null;
  /** the signed-in user's permission keys (empty when signed out) */
  permissions: readonly string[];
  /** may save / submit layouts and register widgets (core re-checks every call) */
  canBuild: boolean;
  /** live frames use the signed-in user's permissions and org */
  useRealAccess: boolean;
  setUseRealAccess: (v: boolean) => void;
  signIn: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const ConnectionCtx = createContext<ConnectionValue | null>(null);

export function useConnection(): ConnectionValue {
  const v = useContext(ConnectionCtx);
  if (!v) throw new Error('useConnection outside ConnectionProvider');
  return v;
}

/** Hosted sign-in (full-page redirect, FAPI2) returning to where the developer was. */
export function hostedSignIn(): void {
  const back = window.location.pathname + window.location.search;
  window.location.href = `/bff/auth/login?return_to=${encodeURIComponent(back)}`;
}
