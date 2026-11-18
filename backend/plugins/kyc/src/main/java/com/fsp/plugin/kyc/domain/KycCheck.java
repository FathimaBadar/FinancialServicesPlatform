package com.fsp.plugin.kyc.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "kyc_checks")
public class KycCheck {

    public static final String CHECK_IDENTITY = "IDENTITY";
    public static final String CHECK_SANCTIONS = "SANCTIONS";

    public static final String RESULT_PASS = "PASS";
    public static final String RESULT_FAIL = "FAIL";
    public static final String RESULT_MANUAL_REVIEW = "MANUAL_REVIEW";

    @Id
    public UUID id;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "owner_tenant_id", nullable = false)
    public UUID ownerTenantId;

    @Column(nullable = false)
    public String checkType;      // IDENTITY|SANCTIONS

    @Column(nullable = false)
    public String result;         // PASS|FAIL|MANUAL_REVIEW

    public String details;

    @Column(nullable = false)
    public boolean simulated = true;

    @Column(nullable = false, updatable = false)
    public Instant checkedAt = Instant.now();

    protected KycCheck() {}

    public KycCheck(UUID id, UUID caseId, UUID ownerTenantId, String checkType,
                    String result, String details) {
        this.id = id;
        this.caseId = caseId;
        this.ownerTenantId = ownerTenantId;
        this.checkType = checkType;
        this.result = result;
        this.details = details;
    }
}
