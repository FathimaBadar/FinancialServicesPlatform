package com.fsp.plugin.kyc.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Domain history for the UI — not evidence (core is authoritative for audit). */
@Entity
@Table(name = "kyc_case_events")
public class KycCaseEvent {

    @Id
    public UUID id;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "owner_tenant_id", nullable = false)
    public UUID ownerTenantId;

    @Column(nullable = false)
    public String eventType;        // CASE_CREATED|CASE_SUBMITTED|CASE_UPDATED|CASE_DECIDED|...

    @Column(columnDefinition = "JSONB")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    public String payload;

    @Column(nullable = false, updatable = false)
    public Instant createdAt = Instant.now();

    public KycCaseEvent() {}
}
