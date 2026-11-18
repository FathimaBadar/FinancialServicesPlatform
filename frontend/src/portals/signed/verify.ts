/**
 * Offline verification of a signed portal delivery bundle
 * (plans/signed-portal-delivery-plan.md §3 — the SPA side of slice S2).
 *
 * The trust anchor is the BUILD-PINNED JWKS (trust-store.json): kids discovered
 * at runtime are never trusted. Checks run in order and any failure fails CLOSED —
 * the caller renders the tampered boundary, never a degraded UI (verify-then-render):
 *   1. kid ∈ pinned store, alg is exactly ES256 (header parsed BEFORE any payload JSON)
 *   2. WebCrypto ECDSA P-256 verify of the JWS over the delivered signing input
 *   3. recomputed sha256(payload as delivered) == bundle.digest
 *   4. only now is the payload parsed
 */
import trustStore from './trust-store.json';

export interface SignedBundle {
  id: string;
  portal: string;
  kid: string;
  alg: string;
  digest: string;   // "sha256:<64 hex>" over the delivered payload string
  payload: string;  // canonical JSON as delivered (JWS covers these exact bytes)
  jws: string;      // JWS compact: header.payload.signature
}

export interface PinnedKey {
  kid: string;
  alg: string;
  kty: string;
  crv: string;
  x: string;
  y: string;
}

export type VerifyVerdict =
  | { ok: true; payload: unknown; kid: string }
  | { ok: false; reason: string; evidenceId: string };

let PINNED: PinnedKey[] = trustStore.keys;

/** Test hook: pin an alternate key set (used only by unit tests to prove the pinned
 *  store is the sole trust path). Never called at runtime. */
export function _testSetPinnedKeys(keys: PinnedKey[]): void {
  PINNED = keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** ArrayBuffer-backed copy — satisfies crypto.subtle's BufferSource typing strictly. */
function intoBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** sha256 hex over UTF-8 text. Exported for the verified chunk-import guard. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', intoBuffer(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verify one bundle. NEVER throws — every failure returns a closed verdict with evidence. */
export async function verifySignedBundle(bundle: SignedBundle): Promise<VerifyVerdict> {
  const evidenceId = crypto.randomUUID();
  try {
    const parts = bundle.jws.split('.');
    if (parts.length !== 3) return closed(evidenceId, 'jws_malformed');

    // 1. header + trust store (before ANY payload JSON parsing — alg-confusion refuses early)
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as {
      alg?: string; kid?: string;
    };
    if (bundle.alg !== 'ES256' || header.alg !== 'ES256') return closed(evidenceId, 'alg_not_allowed');
    if (header.kid !== bundle.kid) return closed(evidenceId, 'kid_header_mismatch');
    const pinned = PINNED.find((k) => k.kid === bundle.kid);
    if (!pinned) return closed(evidenceId, 'kid_not_pinned');
    if (pinned.alg !== 'ES256' || pinned.kty !== 'EC' || pinned.crv !== 'P-256')
      return closed(evidenceId, 'key_unusable');

    // 2. signature over the delivered signing input (minimal JWK — some runtimes reject
    //    extra members like kid/alg in the import input)
    const importJwk = { kty: pinned.kty, crv: pinned.crv, x: pinned.x, y: pinned.y };
    const key = await crypto.subtle.importKey('jwk', importJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signingInput = intoBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, intoBuffer(b64urlToBytes(parts[2])), signingInput,
    );
    if (!verified) return closed(evidenceId, 'signature_invalid');

    // 3. the delivered payload must BE the signed payload (an edited payload field with the
    //    original JWS fails here even though the old signature still validates)
    const signedPayload = new TextDecoder().decode(b64urlToBytes(parts[1]));
    if (signedPayload !== bundle.payload) return closed(evidenceId, 'payload_not_signed');
    const digest = `sha256:${await sha256Hex(bundle.payload)}`;
    if (digest !== bundle.digest) return closed(evidenceId, 'digest_drift');

    // 4. only now parse
    const payload = JSON.parse(bundle.payload) as unknown;
    return { ok: true, payload, kid: bundle.kid };
  } catch {
    return closed(evidenceId, 'verification_error');
  }
}

function closed(evidenceId: string, reason: string): VerifyVerdict {
  return { ok: false, reason, evidenceId };
}

/** Human-readable failure line for the tampered boundary (no secrets, no PII). */
export function reasonLabel(reason: string): string {
  switch (reason) {
    case 'kid_not_pinned': return 'Signing key is not in this build\'s trust store';
    case 'signature_invalid': return 'Signature does not validate';
    case 'payload_not_signed': return 'Delivered payload is not the signed payload';
    case 'digest_drift': return 'Content hash drifted from the signed digest';
    case 'alg_not_allowed': return 'Signing algorithm is not allowed';
    case 'kid_header_mismatch': return 'Key id mismatch inside the delivery';
    case 'jws_malformed': return 'Delivery signature structure invalid';
    case 'payload_shape': return 'Signed payload is not a layout this build understands';
    case 'portal_mismatch': return 'Signed layout belongs to a different portal';
    case 'delivery_withheld': return 'No signed layout has been published for this portal';
    case 'delivery_unreachable': return 'The signed layout could not be fetched';
    case 'verification_error': return 'The signed layout could not be verified';
    default: return 'Verification failed';
  }
}
