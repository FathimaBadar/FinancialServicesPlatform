package com.fsp.core.plugin.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Core-owned event feed (served through the gateway, §8). Core's dispatcher copies
 *  outbox events matching a plugin's subscriptions here. Payloads are minimal (no PII). */
@Entity
@Table(name = "plugin_event_feed")
public class PluginEventFeed {

    @Id
    @Column(name = "seq")
    public long seq;

    @Column(nullable = false)
    public String pluginCode;

    @Column(nullable = false)
    public String eventName;

    @Column(columnDefinition = "JSONB", nullable = false)
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    public String payload;

    public UUID tenantId;

    public UUID correlationId;

    public Instant createdAt = Instant.now();

    protected PluginEventFeed() {}
    public PluginEventFeed(long seq, String pluginCode, String eventName, String payload,
                           UUID tenantId, UUID correlationId) {
        this.seq = seq;
        this.pluginCode = pluginCode;
        this.eventName = eventName;
        this.payload = payload;
        this.tenantId = tenantId;
        this.correlationId = correlationId;
    }
}
