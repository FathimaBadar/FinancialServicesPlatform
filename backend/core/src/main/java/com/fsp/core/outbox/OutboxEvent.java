package com.fsp.core.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "aggregate_type", nullable = false)
    public String aggregateType;
    @Column(name = "aggregate_id", nullable = false)
    public UUID aggregateId;
    @Column(name = "event_name", nullable = false)
    public String eventName;
    /** Raw JSON text; cast on write because the column is jsonb (a varchar bind is rejected by Postgres). */
    @Column(nullable = false, columnDefinition = "jsonb")
    @org.hibernate.annotations.ColumnTransformer(write = "?::jsonb")
    public String payload;
    @Column(name = "correlation_id", nullable = false)
    public String correlationId;
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now();
    @Column(name = "published_at")
    public Instant publishedAt;
}
