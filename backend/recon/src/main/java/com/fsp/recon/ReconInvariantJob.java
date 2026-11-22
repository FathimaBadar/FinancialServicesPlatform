package com.fsp.recon;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Stage-0 skeleton only (plan §11 Stage 6 delivers the real checks): an explicit,
 * type-checked enumeration of the recon invariants so the checklist is reviewed in code,
 * not in someone's head. Each invariant becomes a real probe when its feed lands.
 */
@Component
final class ReconInvariantJob {

    private static final Logger log = LoggerFactory.getLogger(ReconInvariantJob.class);

    @Value("${fsp.recon.sweep-interval-ms:60000}")
    long sweepIntervalMs;

    @Scheduled(fixedDelayString = "${fsp.recon.sweep-interval-ms:60000}")
    void sweep() {
        // 1. EMI float: wallet sum == trust-account bank statement (plan §1.2) — P0 page on breach.
        // 2. PSP clearing: every clearing_position sums to ZERO per settlement cycle (§1.1).
        // 3. Merchant pay-over: no merchant payable older than `pay_over_days` (PSD-1 §12.2.3).
        // 4. Cross-book: every asset_ledger leg has a matching fiat mirror leg (VAA Rules 13/15).
        // 5. Statement ingest: no connector with statement cadence > expected (recon warning, not breaker).
        log.debug("recon skeleton sweep ({} ms interval): Stage 6 wires the feeds", sweepIntervalMs);
    }
}
