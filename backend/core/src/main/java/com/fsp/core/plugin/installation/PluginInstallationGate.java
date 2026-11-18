package com.fsp.core.plugin.installation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Readiness gate per installation (vision §6.6 gap G14). A plugin flips to ACTIVE only
 *  when every manifest gate reports ACTIVE. */
@Entity
@Table(name = "plugin_installation_gates")
@IdClass(PluginInstallationGate.Id.class)
public class PluginInstallationGate {

    public static class Id {
        public UUID installationId;
        public String gate;

        public Id() {}
        public Id(UUID installationId, String gate) {
            this.installationId = installationId;
            this.gate = gate;
        }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Id id)) return false;
            return installationId.equals(id.installationId) && gate.equals(id.gate);
        }
        @Override public int hashCode() {
            return installationId.hashCode() * 31 + gate.hashCode();
        }
    }

    @jakarta.persistence.Id
    @Column(name = "installation_id")
    public UUID installationId;

    @jakarta.persistence.Id
    @Column(name = "gate")
    public String gate;

    @Column(nullable = false)
    public String status; // PENDING | ACTIVE | FAILED

    public Instant updatedAt = Instant.now();

    protected PluginInstallationGate() {}
    public PluginInstallationGate(UUID installationId, String gate, String status) {
        this.installationId = installationId;
        this.gate = gate;
        this.status = status;
    }
}
