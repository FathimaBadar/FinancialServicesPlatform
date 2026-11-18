/**
 * Verify-then-render boot gate (plans/signed-portal-delivery-plan.md §3). Fetches the
 * portal's signed delivery bundle, verifies it OFFLINE against the build-pinned trust
 * store, parses the verified payload, and only then renders children — with the layout
 * on SignedLayoutCtx for the shell + layout screens. Any tamper evidence renders the
 * fail-closed TamperedBoundary — never a degraded menu, never a cached layout.
 *
 * Policy: portals enrolled via `signedDelivery: true` (PortalConfig) REFUSE a missing
 * bundle too (a withheld delivery is a downgrade attack — fail closed). Unenrolled portals
 * boot from the build-time menu registry until their layout is published.
 *
 * Authentication comes first: bundle delivery is an authenticated read, so the gate only
 * verifies once a session exists. No session, or a 401 (token expired/revoked), forces
 * re-authentication through the hosted IdP sign-in (FAPI2 error-UX map: "invalid token →
 * force re-authentication") — never a tamper verdict, and nothing renders in between.
 */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { apiGet } from '../shared/web-core/api';
import { FullscreenSpinner } from '../shared/web-core/guards';
import { useSession } from '../shared/web-core/session-core';
import { TamperedBoundary } from './TamperedBoundary';
import { SignedLayoutCtx, signedLayoutSchema } from './signed-layout';
import type { SignedLayout } from './signed-layout';
import { reasonLabel, verifySignedBundle } from './verify';
import type { SignedBundle } from './verify';

export interface SignedMenuGateProps {
  portal: string;
  /** When true, an absent bundle is ALSO a closed verdict (no downgrade route). */
  required: boolean;
  children: ReactNode;
}

type Delivery =
  | { kind: 'layout'; layout: SignedLayout }
  | { kind: 'missing' }
  | { kind: 'reauth' }
  | { kind: 'closed'; reason: string; evidenceId: string };

async function verifyDelivery(portal: string): Promise<Delivery> {
  let bundle: SignedBundle;
  try {
    bundle = await apiGet<SignedBundle>(`/api/ui/bundles/${encodeURIComponent(portal)}`);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) return { kind: 'reauth' };
    if (status === 404) return { kind: 'missing' };
    return { kind: 'closed', reason: 'delivery_unreachable', evidenceId: crypto.randomUUID() };
  }
  const verdict = await verifySignedBundle(bundle);
  if (!verdict.ok) return { kind: 'closed', reason: verdict.reason, evidenceId: verdict.evidenceId };
  const parsed = signedLayoutSchema.safeParse(verdict.payload);
  if (!parsed.success) return { kind: 'closed', reason: 'payload_shape', evidenceId: crypto.randomUUID() };
  // a validly signed bundle of ANOTHER portal must never unlock this one (replay / swap)
  if (parsed.data.portal !== portal) return { kind: 'closed', reason: 'portal_mismatch', evidenceId: crypto.randomUUID() };
  return { kind: 'layout', layout: parsed.data };
}

export function SignedMenuGate(props: SignedMenuGateProps): ReactNode {
  const session = useSession();
  const authed = session.status === 'authed';
  const { data, isPending } = useQuery({
    // per user: a new sign-in always re-verifies, never reuses another identity's verdict
    queryKey: ['ui', 'signed-delivery', props.portal, session.user?.userId ?? null],
    queryFn: () => verifyDelivery(props.portal),
    enabled: authed,
    staleTime: 60_000,
    retry: 0, // money-grade rule (ui-std §7): zero auto-retries — the outcome is surfaced
  });

  if (session.status === 'loading') return <FullscreenSpinner label="Restoring session" />;
  if (!authed || data?.kind === 'reauth') return <Navigate to="/login" replace />;
  if (isPending || !data) return <FullscreenSpinner label="Verifying signed delivery" />;

  if (data.kind === 'closed') {
    return <TamperedBoundary portal={props.portal} reason={reasonLabel(data.reason)} evidenceId={data.evidenceId} />;
  }
  if (data.kind === 'missing') {
    return props.required ? (
      <TamperedBoundary portal={props.portal} reason={reasonLabel('delivery_withheld')} evidenceId={crypto.randomUUID()} />
    ) : (
      // unenrolled portal: build-time registry until its layout publishes
      <SignedLayoutCtx.Provider value={null}>{props.children}</SignedLayoutCtx.Provider>
    );
  }
  return <SignedLayoutCtx.Provider value={data.layout}>{props.children}</SignedLayoutCtx.Provider>;
}
