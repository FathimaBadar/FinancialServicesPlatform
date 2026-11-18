package com.fsp.core.plugin.registry;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/** A registered plugin type + version (vision §6.1 in FSP terms). Registered once,
 *  platform-wide; four-eyes gates approval. Manifest stored verbatim + hashed.
 *  baseUrl is the plugin's gateway-facing base URL (used by the gateway for upstream routing). */
@Entity
@Table(name = "plugin_types",
    uniqueConstraints = @jakarta.persistence.UniqueConstraint(columnNames = {"code", "version"}))
public class PluginType {

    @Id
    public UUID id;

    @Column(nullable = false)
    public String code;

    @Column(nullable = false)
    public String version;

    @Column(nullable = false)
    public String baseUrl;

    @Column(columnDefinition = "JSONB", nullable = false)
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    public String manifest;

    @Column(nullable = false)
    public String manifestHash;

    @Column(nullable = false)
    public String status; // PENDING_APPROVAL | REGISTERED | SUSPENDED | DEACTIVATED

    @Column(nullable = false)
    public UUID registeredBy;

    public Instant registeredAt = Instant.now();

    public UUID approvedBy;

    public Instant approvedAt;

    @Version
    @Column(name = "row_version")
    public long version_;

    protected PluginType() {}

    public PluginType(UUID id, String code, String version, String baseUrl, String manifest,
                      String manifestHash, String status, UUID registeredBy) {
        this.id = id;
        this.code = code;
        this.version = version;
        this.baseUrl = baseUrl;
        this.manifest = manifest;
        this.manifestHash = manifestHash;
        this.status = status;
        this.registeredBy = registeredBy;
    }
}
