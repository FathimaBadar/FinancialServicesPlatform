package com.fsp.idp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Read/write projection of the tenant-scoped Identity Provider configuration (V6). */
@Entity
@Table(name = "idp_configs")
public class IdpConfig {

    @Id
    @Column(name = "tenant_id")
    public UUID tenantId;
    @Column(nullable = false)
    public String provider;          // FSP_NATIVE | THIRD_PARTY
    @Column(name = "issuer_url")
    public String issuerUrl;
    public String audience;
    @Column(name = "client_id")
    public String clientId;
    @Column(name = "jwks_uri")
    public String jwksUri;
    @Column(name = "policy_version", nullable = false)
    public int policyVersion;
    @Column(name = "updated_by")
    public UUID updatedBy;
    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt = Instant.now();
}
