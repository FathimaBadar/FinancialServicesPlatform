/**
 * GAP-NO-MENU probes: a portal's menu comes only from its published layout. No layout →
 * the portal says "No menu configured" (never a coded fallback menu, never a tamper verdict).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { verifyDelivery } from './delivery';
import { NoMenuConfigured } from './NoMenuConfigured';

const failWith = (status: number) => () => Promise.reject(Object.assign(new Error('x'), { status }));

describe('GAP-NO-MENU · delivery outcomes', () => {
  it('no published layout (404) is "missing", not a tamper verdict', async () => {
    expect(await verifyDelivery('merchant', failWith(404))).toEqual({ kind: 'missing' });
  });
  it('an expired session (401) forces re-authentication', async () => {
    expect(await verifyDelivery('merchant', failWith(401))).toEqual({ kind: 'reauth' });
  });
  it('an unreachable delivery fails closed', async () => {
    expect(await verifyDelivery('merchant', failWith(503))).toMatchObject({ kind: 'closed', reason: 'delivery_unreachable' });
  });
  it('an unsigned bundle fails closed', async () => {
    const bundle = { id: 'b', portal: 'merchant', kid: 'k', alg: 'ES256', digest: 'sha256:0', payload: '{}', jws: 'a.b' };
    expect(await verifyDelivery('merchant', () => Promise.resolve(bundle))).toMatchObject({ kind: 'closed', reason: 'jws_malformed' });
  });
});

describe('GAP-NO-MENU · the portal says so', () => {
  it('names the portal and that no menu is configured', () => {
    const html = renderToStaticMarkup(createElement(NoMenuConfigured, { label: 'Merchant' }));
    expect(html).toContain('No menu configured for this portal');
    expect(html).toContain('Merchant');
    expect(html).not.toContain('tampered');
  });
});
