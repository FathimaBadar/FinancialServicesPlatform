package com.fsp.core.plugin.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Ack cursor per plugin: last acknowledged seq in the feed. */
@Entity
@Table(name = "plugin_event_cursors")
public class PluginEventCursor {

    @Id
    public String pluginCode;

    @Column(nullable = false)
    public long lastAckSeq;

    public Instant updatedAt = Instant.now();

    protected PluginEventCursor() {}
    public PluginEventCursor(String pluginCode, long lastAckSeq) {
        this.pluginCode = pluginCode;
        this.lastAckSeq = lastAckSeq;
    }
}
