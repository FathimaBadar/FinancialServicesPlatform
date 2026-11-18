package com.fsp.core.idempotency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Transport-level idempotency record (AGENTS.md §2e). */
@Entity
@Table(name = "idempotency_records")
public class IdempotencyRecord {

    public static final class State {
        public static final String PENDING = "PENDING";
        public static final String DONE = "DONE";
    }

    @Id
    public UUID id;

    @Column(name = "user_id", nullable = false)
    public UUID userId;

    @Column(name = "request_key", nullable = false, length = 128)
    public String requestKey;

    @Column(nullable = false, length = 10)
    public String method;

    @Column(nullable = false, length = 255)
    public String path;

    @Column(name = "request_hash", nullable = false, length = 64)
    public String requestHash;

    @Column(nullable = false, length = 16)
    public String state = State.PENDING;

    @Column(name = "status_code")
    public Integer statusCode;

    @Column(name = "content_type", length = 100)
    public String contentType;

    @Column(name = "response_body")
    public byte[] responseBody;

    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();

    @Column(name = "completed_at")
    public Instant completedAt;
}
