/**
 * ONE verify-then-parse path for a portal's signed delivery bundle — shared by the boot gate
 * (SignedMenuGate: this portal's sidebar) and every surface that must read ANOTHER portal's
 * published menu (rbac.matrix: the rows of a role's permissions). The fetch is injected so each
 * caller keeps its own transport (same-origin /api via the BFF — never a token in the browser);
 * the trust decision is always the build-pinned verifier + the payload schema + the portal bind.
 */
import { signedLayoutSchema } from './signed-layout';
import type { SignedLayout } from './signed-layout';
import { verifySignedBundle } from './verify';
import type { SignedBundle } from './verify';

export type Delivery =
  | { kind: 'layout'; layout: SignedLayout }
  | { kind: 'missing' }
  | { kind: 'reauth' }
  | { kind: 'closed'; reason: string; evidenceId: string };

export async function verifyDelivery(portal: string, fetchBundle: () => Promise<SignedBundle>): Promise<Delivery> {
  let bundle: SignedBundle;
  try {
    bundle = await fetchBundle();
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
  // a validly signed bundle of ANOTHER portal must never stand in for this one (replay / swap)
  if (parsed.data.portal !== portal) return { kind: 'closed', reason: 'portal_mismatch', evidenceId: crypto.randomUUID() };
  return { kind: 'layout', layout: parsed.data };
}
