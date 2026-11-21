# Architecture Chapter 13 — Money Movement, Bank Connectors, Bill Payments (PSP & EMI)

**Parent Document:** [docs/architecture.md](file:///home/arun/FinancialServicesPlatform/docs/architecture.md)
**Detailed Plan:** [plans/bank-connectors-bill-payments-plan.md](file:///home/arun/FinancialServicesPlatform/plans/bank-connectors-bill-payments-plan.md)

---

> **Status:** **PLANNED (approved architecture, not yet built).** The authoritative executable
> plan — stages 0–6, sealed-interface sketches, regulatory citations — lives in
> `plans/bank-connectors-bill-payments-plan.md`. This chapter is the normative architecture:
> the shapes, invariants, and boundaries every future PR for this domain is measured against.

---

## 1. What this domain adds, and what it deliberately does not touch

Two new services, both fully isolated (plugin-platform rules for process/schema/credentials):

| Service | Port | Book | Owns |
|---|---|---|---|
| `psp-service` | :8085 | TigerBeetle `PSP` book | Rail abstraction, connectors, clearing positions, merchant payable, settlement sweep |
| `emi-service` | :8086 | TigerBeetle `EMI` book | Customer wallets (prepaid, BoN-regulated), bill-payment sagas, digital-asset ledgers |
| `recon-worker` | (no port) | read-only | Statement/recon ingests; feeds saga dispositions; pages on invariant breaks |

This chapter is **additive**: the CORE book, the approval engine, the notification plane
(chapter 12), and the auth plane (chapter 02 §7) change **not one line**. Both services
are client applications of core (identity, permission lookups) and consumers of the
connector registry (a shared library, not a network hop).

**Business models:** PSP = pass-through acquiring — in-flight funds in **nominal clearing
positions that must be zero every settlement cycle** (never customer-facing wallets);
EMI = **real prepaid wallets** (platform-held float, mirrored 1:1 in a trust account).
The regulatory grounding: Namibia PSD-1 (PSP licensing), PSD-3 (e-money), VAA 10/2023 +
BoN Custody Rules — full mapping in plan §12.2/§12.7.

**Hard wallet constraint (PSD-3 §9.1.1):** regulated e-money balances are **NAD-only,
redeemable at par**. ZAR/USD/GBP positions are bank-linked/on-sent accounts, not wallet
balances. Loyalty/points are never convertible to cash or e-money (PSD-3 §9.1.3).

## 2. Sealed protocol taxonomy (normative shape)

```java
public sealed interface ProviderProtocol {
    sealed interface SessionBound extends ProviderProtocol
            permits Iso8583Protocol, TerminalStreamProtocol {}
    sealed interface MessageTyped extends ProviderProtocol
            permits Iso20022PacsProtocol, Iso20022PainProtocol, NachaProtocol {}
    sealed interface HttpBased extends ProviderProtocol
            permits RestOpenBankingProtocol, UpiProtocol, BillerRestProtocol,
                    WalletRailProtocol, CustodianRestProtocol {}
}
public sealed interface RailCapability {
    record Sequential(int maxInFlightPerSession) implements RailCapability {}
    record Parallel(int maxInFlight, Duration connectTimeout, Duration readTimeout) implements RailCapability {}
    record StatusProbe(Duration freshnessWindow) implements RailCapability {}
}
public sealed interface RailResult {
    record Accepted(String railRef, Instant eta) implements RailResult {}
    record AcceptedPending(String railRef) implements RailResult {}
    record Rejected(String code, boolean permanent) implements RailResult {}
    record Failed(FailureKind kind) implements RailResult {}
}
public sealed interface FailureKind {
    record CommUnreachable(Duration observedFor) implements FailureKind {}
    record TemporarilyUnavailable(int retryAfterSeconds) implements FailureKind {}
    record RateLimited(Duration movingWindowReset) implements FailureKind {}
    record DefinitiveFailure(String railCode) implements FailureKind {}
}
```

Rules (all compile-time-enforced by these seals):
- Adding a bank/rail = **config row + credentials**, never a redeploy. Adapters are per
  *rail family* (~6 classes for N banks), selected by `RailCapability` per config row.
- Services **never see HTTP status codes** — only these seals.
- Parallel rails are guarded by a bulkhead semaphore per `(connector, host)`; sequential
  rails by a per-session `KeyLocks` mutex (second concurrent caller fails fast, never corrupts).
- **Bank communication-protocol support (plan §3.4):** each configured bank pins a
  **transport channel + message format + ISO 20022 dictionary version** as a profile row —
  a new bank is config, never code.
  * *Transports (sealed `TransportChannel`):* `MtlsHttpChannel`, `VpnHttpChannel`,
    `TcpSessionChannel` (ISO 8583 sockets), `SftpChannel` (batch in/out-baskets), `MqChannel`.
  * *Formats:* ISO 8583 (auth/reversal/probe MTIs) · ISO 20022 (`pain.001`, `pacs.008`,
    `pacs.002`, `camt.053/.054`, dictionary version pinned per bank) · SWIFT MT wrapper
    (legacy only) · NACHA/ACH batch · bank REST/JSON · biller REST · CSV/statement batches.
  * *Acceptance gate:* sandbox conformance suite per bank profile (pay/query/reverse/
    statement round-trip + breaker drill) before the bank is enabled; Stage 0 protocol
    survey signs off one profile per registry bank (FNB, Nedbank, Standard Bank, Bank BIC,
    Letshego Namibia).
  * Session-bound channels own logon/keepalive and map session loss to
    `FailureKind.CommUnreachable` (never silent retry); SFTP cadence misses are recon
    warnings, not breaker events; raw message text never survives parsing (§2c).
- The pins go into `shared/` in Stage 1 so psp/emi compile against one module.

## 3. The bill-payment space ladder (pending-transfer two-phase)

Bill payments are a permissible e-money service by name (PSD-3 §10.1.9). Money **never
moves irreversibly until confirmation**:

1. **Hold:** linked **pending transfer** `DR WALLET, CR BILL_CLEARING` — customer sees
   "pending"; funds are held, reversible, and *no provider has been trusted yet*.
2. **Submit** to biller via connector (outside any DB/TB transaction).
3. **done → commit pending** · **revert → void pending** · **ambiguous → stays pending**.

**Ambiguity doctrine (the invariant with teeth):** a timeout on an *already-submitted*
message is **never** treated as failure. Void requires only: definitive rejection,
TTL expiry, a `probe()` verdict, or a recon finding. Enforced in the saga engine, not the
adapter, so no connector implementation can violate it.

**The configurable "space"** = `fsp.emi-space-grace-seconds` plus a **per-biller
reversal-class** column (`biller_contract.reversal_class ∈ A|B|C`, plan §12.3: A reversible-anytime,
B reversible-by-contract-window with recon proof, C non-reversible). Contract-silent billers
default to **C** (conservative). Post-commit reversal is always four-eyes + recon evidence.

## 4. Exactly-once stack (no double debit/credit)

Six independent layers — any one is sufficient:

1. Unique `(service, kind, idempotency_key)` — dedup of client retries and internal replays.
2. Provider-side idempotency key = SHA-256 of (saga id + counterparty ref + amount + currency)
   — a variation in any of those changes the key, so money can never collide two obligations.
3. TigerBeetle pending uniqueness on `user_data_128 = sagaId` — a duplicate commit is a no-op.
4. **Outbox is the sole rail submitter** (claim via conditional UPDATE — same pattern as
   the §12.9 `ChannelDispatcher`); paused/resumed clusters can never double-submit.
5. Connector replay cache: the same message replays its recorded result.
6. Daily recon equality per book and cross-book — breach = P0 page.

## 5. Failure doctrine (fail fast, gracefully)

| Mechanism | Rule |
|---|---|
| Timeouts | connect 2 s, read 8 s (`HttpBased`) / 15 s (`SessionBound`) |
| Circuit breaker | resilience4j per `(connector, counterparty)`: 3 consecutive comm failures or 5/60 s → **OPEN**; in OPEN every message **fails locally with zero provider contact** until cooldown; one HALF_OPEN probe to close |
| Rate limiting | sliding-window counter per connector honoring the provider window; a `429` re-seeds the window from `Retry-After`/`X-RateLimit-Reset` and **does not open the breaker** (rate limit ≠ failure); requests during reset fail locally |
| Ambiguity | §3 rule above applies to breaker outcomes too: comm failure after submit ⇒ `PENDING_RECOGNITION`, breaker opens, nothing re-issued until cooldown **and** a probe clears the ambiguity |
| Scales out how | single instance per service (advisory-lock boot guard on the sweepers); distributed breaker state only when load demands (plan §12.5) |

## 6. SKU & digital-asset value capture

* **SKU purchases:** core is the order brain (inventory plugin reserves); EMI executes the
  money as a **linked pending chain** (wallet → SKU clearing + tax liability + fee),
  committed on fulfilment confirm, voided on expiry/refund. Price is fingerprint-quoted;
  a repo price change between quote and charge is a four-eyes-visible event.
* **Tax:** rate-bucket accounts (`TAX_LIABILITY_STD` 15%, `TAX_LIABILITY_ZERO` marker),
  bucket four-eyes-configured and snapshotted per JE; monthly `Σ tax booked == VAT return` recon.
* **Digital assets:** separate TigerBeetle **ledgers** per asset class; every asset leg mirrors
  a fiat leg (cross-ledger recon). **Closed-loop-first:** platform-issued units are
  non-transferable/non-resalable (VAA Schedule-2 exclusion — no VASP licence triggered);
  public virtual assets are blocked until a VASP licence-class decision (plan §12.1) —
  never self-custody at launch; use a Class R custodian.

## 7. Regulatory traceability (full table in plan §12.7)

Selected bindings: trust/merchant-pool **100% daily** coverage with ≤1-business-day fix
(PSD-3 §13.1.5 / PSD-1 §12.2.4) → recon-worker P0 page; merchant pay-over ≤2 business days
(PSD-1 §12.2.3) → settlement sweep; bill-payment disputes resolved ≤15 business days
(PSD-1 §16.2) → saga dispute SLA timer; custody record checks + external recon ≤2 months
(VAA Rules 13/15) → asset recon cadence; **dormancy sweeper** (6mo → 1mo notice → 3yr hold
→ transfer to BoN, PSD-3 §15) → new Stage-2 scheduled job.

## 8. Stage plan (summary)

Stages 0–6 in plan §11 produce, in order: schemas (V32 EMI / V33 PSP) + recon-worker skeleton →
sealed registry + breakers/limiter + tests → EMI wallets → bill-payment sagas → SKU money →
PSP clearing sweep → recon invariants & paging. Each stage is independently verifiable and
gated by `make docs-check` + gradle suites + the boot-verified migration ledger.
