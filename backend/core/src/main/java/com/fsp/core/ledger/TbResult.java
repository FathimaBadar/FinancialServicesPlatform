package com.fsp.core.ledger;

/**
 * Sealed result of every TigerBeetle write. No exception-driven control flow for money.
 * Pattern-matched by LedgerService and JournalService.
 */
public sealed interface TbResult {

    record Ok() implements TbResult {}

    /** TigerBeetle returned a definitive per-record rejection (accounts/transfers result batch). */
    record DefinitiveRejection(String detail) implements TbResult {}

    /** Transport lost / uncertain — the caller must treat the commit as UNKNOWN. */
    record UnknownTransport(String detail) implements TbResult {}
}
