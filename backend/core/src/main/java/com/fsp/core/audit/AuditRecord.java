package com.fsp.core.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "actor_id")
    public UUID actorId;
    @Column(name = "checker_id")
    public UUID checkerId;
    @Column(name = "tenant_id")
    public UUID tenantId;
    @Column(name = "book_id")
    public UUID bookId;
    @Column(name = "action_type", nullable = false)
    public String actionType;
    @Column(name = "resource_type", nullable = false)
    public String resourceType;
    @Column(name = "resource_id")
    public String resourceId;
    @Column(name = "before_state_hash")
    public String beforeStateHash;
    @Column(name = "after_state_hash")
    public String afterStateHash;
    @Column(name = "correlation_id", nullable = false)
    public String correlationId;
    @Column(name = "ip_address")
    public String ipAddress;
    @Column(name = "client_id")
    public String clientId;
    @Column(name = "acting_tenant_id")
    public UUID actingTenantId;
    @Column(name = "act_session_id", length = 36)
    public String actSessionId;
    @Column(nullable = false)
    public boolean simulated;
    @Column(name = "timestamp_utc", nullable = false, updatable = false)
    public Instant timestampUtc = Instant.now();
}
