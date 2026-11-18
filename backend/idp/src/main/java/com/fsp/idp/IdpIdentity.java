package com.fsp.idp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Federated identity: (issuer, subject) → canonical person. Third-party IdPs link here. */
@Entity
@Table(name = "idp_identities")
public class IdpIdentity {

    @Id
    @Column(name = "identity_id")
    public UUID identityId;
    @Column(nullable = false)
    public String issuer;
    @Column(nullable = false)
    public String subject;
    @Column(name = "person_id", nullable = false)
    public UUID personId;
    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();
}
