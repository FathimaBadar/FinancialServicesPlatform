package com.fsp.core.plugin.installation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/** Per-tenant activation of a plugin type. Four-eyes gated; state machine
 *  PENDING_APPROVAL → PROVISIONING → ACTIVE ⇄ SUSPENDED → DEACTIVATED (never deleted). */
@Entity
@Table(name = "plugin_installations",
    uniqueConstraints = @jakarta.persistence.UniqueConstraint(columnNames = {"plugin_code", "tenant_id"}))
public class PluginInstallation {

    @Id
    public UUID id;

    @Column(nullable = false)
    public String pluginCode;

    @Column(nullable = false)
    public String pluginVersion;

    @Column(nullable = false)
    public UUID tenantId;

    @Column(nullable = false)
    public String status; // PENDING_APPROVAL | PROVISIONING | ACTIVE | SUSPENDED | DEACTIVATED

    @Column(nullable = false)
    public String inheritancePolicy; // INHERIT | REQUIRED | OPT_OUT | OPT_IN | PROHIBITED

    @Column(nullable = false)
    public String inheritanceOrigin; // DIRECT | INHERITED_FROM:<tenantId>

    @Column(columnDefinition = "JSONB")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    public String config;

    @Version
    public long version;

    public Instant createdAt = Instant.now();

    public Instant updatedAt = Instant.now();

    protected PluginInstallation() {}

    public PluginInstallation(UUID id, String pluginCode, String pluginVersion, UUID tenantId,
                              String status, String inheritancePolicy, String inheritanceOrigin,
                              String config) {
        this.id = id;
        this.pluginCode = pluginCode;
        this.pluginVersion = pluginVersion;
        this.tenantId = tenantId;
        this.status = status;
        this.inheritancePolicy = inheritancePolicy;
        this.inheritanceOrigin = inheritanceOrigin;
        this.config = config;
    }
}
