package com.fsp.core.actas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One "act as a tenant" session (plans/act-as-tenant-plan.md, V14__act_as_sessions.sql).
 * Written and read by {@link ActAsService} with SQL; mapped here so the schema is validated
 * against the migration.
 *
 * The session names the real person (personId) and the tenant they act as (targetTenantId).
 * homeTenantId is the person's own tenant — never the one they act as.
 */
@Entity
@Table(name = "act_as_sessions")
public class ActAsSession {

    @Id
    @Column(name = "id", length = 36, nullable = false)
    public String id;

    @Column(name = "person_id", nullable = false)
    public UUID personId;

    @Column(name = "home_tenant_id", nullable = false)
    public UUID homeTenantId;

    @Column(name = "target_tenant_id", nullable = false)
    public UUID targetTenantId;

    @Column(name = "started_at", nullable = false)
    public Instant startedAt = Instant.now();

    @Column(name = "last_seen_at", nullable = false)
    public Instant lastSeenAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "ended_at")
    public Instant endedAt;

    @Column(name = "end_reason", length = 32)
    public String endReason;

    protected ActAsSession() {}

    public ActAsSession(String id, UUID personId, UUID homeTenantId, UUID targetTenantId,
                        Instant expiresAt) {
        this.id = id;
        this.personId = personId;
        this.homeTenantId = homeTenantId;
        this.targetTenantId = targetTenantId;
        this.expiresAt = expiresAt;
    }
}
