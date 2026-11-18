package com.fsp.core.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "accounting_periods")
public class AccountingPeriod {

    @Id
    public UUID id;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(name = "book_id", nullable = false)
    public UUID bookId;
    @Column(name = "fiscal_year", nullable = false)
    public int fiscalYear;
    @Column(name = "period_no", nullable = false)
    public int periodNo;
    @Column(name = "start_date", nullable = false)
    public LocalDate startDate;
    @Column(name = "end_date", nullable = false)
    public LocalDate endDate;
    @Column(nullable = false)
    public String status; // OPEN | SOFT_CLOSED | HARD_CLOSED
    @Column(name = "opened_by")
    public UUID openedBy;
    @Column(name = "closed_by")
    public UUID closedBy;
    @Column(nullable = false)
    public long version;
}
