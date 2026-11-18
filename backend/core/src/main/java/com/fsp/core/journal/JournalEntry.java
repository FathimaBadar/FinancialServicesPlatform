package com.fsp.core.journal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "journal_entries")
public class JournalEntry {

    public static final class Status {
        public static final String DRAFT = "DRAFT";
        public static final String PENDING_CHECKER = "PENDING_CHECKER";
        public static final String READY = "READY";
        public static final String SUBMITTING = "SUBMITTING";
        public static final String COMMITTED = "COMMITTED";
        public static final String COMMIT_UNKNOWN = "COMMIT_UNKNOWN";
        public static final String FINALIZED = "FINALIZED";
        public static final String REJECTED = "REJECTED";
        public static final String REVERSED = "REVERSED";

        /** Closed enum for bounded search contracts (guide §4A: unknown status → 400). */
        public static final java.util.List<String> VALID = java.util.List.of(DRAFT, PENDING_CHECKER, READY,
            SUBMITTING, COMMITTED, COMMIT_UNKNOWN, FINALIZED, REJECTED, REVERSED);
    }

    @Id
    public UUID id;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(name = "book_id", nullable = false)
    public UUID bookId;
    @Column(name = "period_id")
    public UUID periodId;
    @Column(name = "entry_type", nullable = false)
    public String entryType = "MANUAL";
    @Column(name = "posting_date", nullable = false)
    public LocalDate postingDate;
    @Column(name = "value_date", nullable = false)
    public LocalDate valueDate;
    public String description;
    public String reference;
    @Column(nullable = false, length = 3)
    public String currency;
    @Column(name = "total_debits", nullable = false)
    public BigDecimal totalDebits;
    @Column(name = "total_credits", nullable = false)
    public BigDecimal totalCredits;
    @Column(nullable = false)
    public String status = Status.DRAFT;
    @Column(name = "plan_hash")
    public String planHash;
    @Column(name = "tb_transfer_ids", nullable = false)
    public String tbTransferIds = "";
    @Column(name = "maker_id", nullable = false)
    public UUID makerId;
    @Column(name = "checker_id")
    public UUID checkerId;
    @Column(name = "finalized_at")
    public Instant finalizedAt;
    @Column(nullable = false)
    @Version
    public long version;
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();
}
