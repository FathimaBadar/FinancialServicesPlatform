package com.fsp.core.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "gl_accounts")
public class GlAccount {

    @Id
    public UUID id;
    @Column(name = "book_id", nullable = false)
    public UUID bookId;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(name = "parent_id")
    public UUID parentId;
    @Column(name = "tb_account_id")
    public String tbAccountId;         // u128 decimal string; null until provisioned
    @Column(name = "ledger_id", nullable = false)
    public int ledgerId;
    @Column(nullable = false)
    public int code;
    @Column(nullable = false)
    public String name;
    @Column(name = "account_type", nullable = false)
    public String accountType;         // ASSET|LIABILITY|EQUITY|INCOME|EXPENSE|CLEARING
    @Column(name = "normal_balance", nullable = false)
    public String normalBalance;       // DEBIT|CREDIT|NONE (presentation only)
    @Column(name = "balance_bound", nullable = false)
    public String balanceBound;        // NONE|DEBIT_BOUND|CREDIT_BOUND
    @Column(name = "posting_allowed", nullable = false)
    public boolean postingAllowed = true;
    @Column(nullable = false, length = 3)
    public String currency;
    @Column(nullable = false)
    public String status;              // PENDING|ACTIVE|SUSPENDED|CLOSED
    @Column(name = "created_by")
    public UUID createdBy;
    @Column(name = "approved_by")
    public UUID approvedBy;
    @Column(nullable = false)
    public long version;
}
