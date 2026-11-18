/**
 * Verification verdicts (plans/signed-portal-delivery-plan.md acceptance 1/2/4/5):
 * valid bundle verifies offline against the build-pinned JWKS; any tamper evidence fails
 * CLOSED. Uses a dedicated test key pinned via vi.mock of trust-store.json — proving the
 * pinned store is the only trust path, and that runtime/discovered keys are irrelevant.
 */
import { describe, expect, it } from 'vitest';
import { verifySignedBundle } from './verify';
import type { SignedBundle } from './verify';

import { _testSetPinnedKeys } from './verify';

_testSetPinnedKeys([{"kid": "test-pin-1", "alg": "ES256", "kty": "EC", "crv": "P-256", "x": "vWIFPQJjmFVC62dmW5C-XfJl12LDBUUcxyNhuyzCEVM", "y": "Hzx8VYT9FBeeLTMI2Dnv287mZ8tlyC7eHRQ2k5Uz6Gk"}]);

const PAYLOAD = "{\"layoutVersion\":\"1111\",\"menus\":[],\"portal\":\"admin\",\"publishedAt\":\"2026-11-18T00:00:00Z\",\"schemaVersion\":1,\"widgets\":[]}";
const DIGEST = 'sha256:05f985db14f0fa3b15c40ad1de6079407016b7e30ff67be4745c731d50cfadc4';
const JWS = 'eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3QtcGluLTEifQ.eyJsYXlvdXRWZXJzaW9uIjoiMTExMSIsIm1lbnVzIjpbXSwicG9ydGFsIjoiYWRtaW4iLCJwdWJsaXNoZWRBdCI6IjIwMjYtMTEtMThUMDA6MDA6MDBaIiwic2NoZW1hVmVyc2lvbiI6MSwid2lkZ2V0cyI6W119.sf_my1v_ru6aPNUDAFF9fpdGggBBpN3LFmjpWrsMNwI_c2GAzP-JiJt8I7tb_55Z3B_wLaLZPQvdngpSlbZAMg';

const bundle = (over: Partial<SignedBundle> = {}): SignedBundle => ({
  id: 'b1', portal: 'admin', kid: 'test-pin-1', alg: 'ES256',
  digest: DIGEST, payload: PAYLOAD, jws: JWS, ...over,
});

describe('verifySignedBundle', () => {
  it('accepts a validly signed bundle', async () => {
    const v = await verifySignedBundle(bundle());
    expect(v.ok).toBe(true);
  });

  it('fails closed on payload tampering (digest drift)', async () => {
    const tampered = PAYLOAD.replace('"menus":[]', '"menus":[{"id":"evil"}]');
    const v = await verifySignedBundle(bundle({ payload: tampered }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('payload_not_signed');
  });

  it('fails closed when the trusted kid is not pinned (rotation gone wrong / rogue key)', async () => {
    const [, pj, sj] = JWS.split('.');
    const rogueJws = 'eyJhbGciOiAiRVMyNTYiLCAia2lkIjogInJvZ3VlLWtleSJ9.' + pj + '.' + sj;
    const v = await verifySignedBundle(bundle({ kid: 'rogue-key', jws: rogueJws }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('kid_not_pinned');
  });


  it('fails closed on wrong algorithm before parsing payload (alg-confusion)', async () => {
    const v = await verifySignedBundle(bundle({ alg: 'ES384' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('alg_not_allowed');
  });

  it('fails closed on a corrupted signature', async () => {
    const [h, p, s] = JWS.split('.');
    const badSig = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
    const v = await verifySignedBundle(bundle({ jws: `${h}.${p}.${badSig}` }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('signature_invalid');
  });

  it('fails closed when the JWS payload bytes differ from delivered payload', async () => {
    // attacker rewrites the DELIVERED payload string and recomputes digest (no signing key)
    const other = PAYLOAD.replace('"menus":[]', '"menus":[{"id":"xss"}]');
    const bytes = new TextEncoder().encode(other);
    const mac = await crypto.subtle.digest('SHA-256', bytes);
    const newDigest = 'sha256:' + [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, '0')).join('');
    const v = await verifySignedBundle(bundle({ payload: other, digest: newDigest }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('payload_not_signed');
  });
});
