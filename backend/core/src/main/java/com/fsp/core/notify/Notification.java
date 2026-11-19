package com.fsp.core.notify;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One notification row = one durable pointer a person was given (F-12: a checker is
 * pointed at pending four-eyes work without polling). The table is ALSO the push queue:
 * the dispatcher claims rows by moving {@code pushed_at} off NULL. Content is deliberately
 * PII-free (AGENTS §2c / FAPI data minimization): generic title/body, a type, and a link.
 */
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    public UUID id;

    @Column(name = "person_id", nullable = false)
    public UUID personId;

    @Column(name = "tenant_id", nullable = false)
    public UUID tenantId;

    /** Notification kind — Phase-0: APPROVAL_OPEN. */
    @Column(nullable = false)
    public String type;

    /** The canonical approval op this pointer is about (BANK_ACCOUNT_CREATE, USER_CREATE, …). */
    @Column(name = "op_type", nullable = false)
    public String opType;

    @Column(nullable = false)
    public String title;

    @Column(nullable = false)
    public String body;

    @Column(name = "resource_type", nullable = false)
    public String resourceType;

    @Column(name = "resource_id", nullable = false)
    public UUID resourceId;

    /** Portal-relative in-app path (e.g. /approvals) — navigation only, never authority. */
    @Column(nullable = false)
    public String link;

    @Column(name = "read_at")
    public Instant readAt;

    /** NULL until the push dispatcher resolved this row (delivered, unreachable, or skipped). */
    @Column(name = "pushed_at")
    public Instant pushedAt;

    /** Bounded retry: incremented on non-definitive provider failures; give up at 3. */
    @Column(name = "push_attempts", nullable = false)
    public int pushAttempts;

    /** WEBPUSH | APNS | FCM | NONE (no channel available / no credentials / no subscriptions). */
    @Column(name = "push_via")
    public String pushVia;

    @Column(name = "created_at", insertable = false, updatable = false)
    public Instant createdAt;
}
