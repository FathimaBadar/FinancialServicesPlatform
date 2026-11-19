/**
 * bank.accounts (F-10) — data contributions: list source + file command.
 * Names are prefix-scoped to the widget id (bank.accounts.*). Exported as named
 * bindings (sources/commands) — that is what `contributed()` in core/sources.ts merges.
 */
import type { DataSources } from '../../core/sources';

// core BankAccountController — BFF /api/tenants/{tenantId}/bank-accounts → gateway /v1/...
export const sources: DataSources = {
  'bank.accounts.list': { '*': { method: 'GET', path: '/api/tenants/{tenantId}/bank-accounts' } },
};

// maker files the org's settlement account (Idempotency-Key is added by web-core/api)
export const commands: DataSources = {
  'bank.accounts.create': { '*': { method: 'POST', path: '/api/tenants/{tenantId}/bank-accounts' } },
};
