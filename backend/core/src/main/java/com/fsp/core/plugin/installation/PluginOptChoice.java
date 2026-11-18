package com.fsp.core.plugin.installation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** OPT_IN / OPT_OUT choice a tenant makes for a plugin whose ancestor uses INHERIT/OPT_IN policy. */
@Entity
@Table(name = "plugin_opt_choices")
@IdClass(PluginOptChoice.Id.class)
public class PluginOptChoice {

    public static class Id {
        public UUID tenantId;
        public String pluginCode;

        public Id() {}
        public Id(UUID tenantId, String pluginCode) {
            this.tenantId = tenantId;
            this.pluginCode = pluginCode;
        }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Id id)) return false;
            return tenantId.equals(id.tenantId) && pluginCode.equals(id.pluginCode);
        }
        @Override public int hashCode() {
            return tenantId.hashCode() * 31 + pluginCode.hashCode();
        }
    }

    @jakarta.persistence.Id
    @Column(name = "tenant_id")
    public UUID tenantId;

    @jakarta.persistence.Id
    @Column(name = "plugin_code")
    public String pluginCode;

    @Column(nullable = false)
    public String choice; // OPT_IN | OPT_OUT

    public Instant createdAt = Instant.now();

    protected PluginOptChoice() {}
    public PluginOptChoice(UUID tenantId, String pluginCode, String choice) {
        this.tenantId = tenantId;
        this.pluginCode = pluginCode;
        this.choice = choice;
    }
}
