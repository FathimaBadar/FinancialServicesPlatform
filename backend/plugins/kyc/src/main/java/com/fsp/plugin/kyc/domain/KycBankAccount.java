package com.fsp.plugin.kyc.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "kyc_bank_accounts")
public class KycBankAccount {

    public static final String STATUS_PENDING_APPROVAL = "PENDING_APPROVAL";
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_REVOKED = "REVOKED";

    @Id
    public UUID id;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "owner_tenant_id", nullable = false)
    public UUID ownerTenantId;

    @Column(name = "holder_name", nullable = false)
    public String holderName;

    @Column(name = "bank_name", nullable = false)
    public String bankName;

    @Column(name = "branch_code", nullable = false)
    public String branchCode;

    @Column(name = "account_number", nullable = false)
    public String accountNumber;

    @Column(name = "account_type", nullable = false)
    public String accountType;

    @Column(nullable = false)
    public String status;

    @Column(name = "requested_by")
    public UUID requestedBy;

    @Column(name = "approved_by")
    public UUID approvedBy;

    @Version
    public long version;

    @Column(nullable = false, updatable = false)
    public Instant createdAt = Instant.now();

    public KycBankAccount() {}
}
