/**
 * Verified chunk import (plans/signed-portal-delivery-plan.md §2.1 bundleHash).
 * The signed bundle carries sha256 of every widget's BUILT asset; widgets are only
 * imported through this guard — the module must hash-match before it can run (SRI-style,
 * computed in-process rather than via script tag attributes, so it covers dynamic imports).
 *
 * Policy: 'sha256:unregistered' → integrity UNVERIFIED: the import proceeds only when
 * `strict` is false (dev); strict mode (prod default) treats unregistered as tamper.
 */
import { sha256Hex } from './verify';

export async function importVerifiedChunk<T>(
  chunkUrl: string,
  expected: string | null,
  opts?: { strict?: boolean },
): Promise<T> {
  if (!expected || expected === 'sha256:unregistered') {
    if (opts?.strict !== false) {
      throw new TamperError('chunk_unregistered', chunkUrl);
    }
    console.warn('[signed-delivery] chunk integrity UNVERIFIED (dev):', chunkUrl);
    return import(/* @vite-ignore */ chunkUrl) as Promise<T>;
  }
  const res = await fetch(chunkUrl, { credentials: 'same-origin' });
  if (!res.ok) throw new TamperError('chunk_fetch_failed', `${chunkUrl}:${res.status}`);
  const text = await res.text();
  const hex = await sha256Hex(text);
  if (`sha256:${hex}` !== expected) {
    throw new TamperError('chunk_hash_mismatch', chunkUrl);
  }
  return import(/* @vite-ignore */ chunkUrl) as Promise<T>;
}

export class TamperError extends Error {
  constructor(public readonly code: string, public readonly chunkUrl: string) {
    super(`signed-delivery: ${code} — ${chunkUrl}`);
  }
}
