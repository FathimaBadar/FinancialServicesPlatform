package com.fsp.core.plugin.installation;

import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.UUID;

/** Repository for readiness gates per installation. */
public interface PluginInstallationGateRepository extends CrudRepository<PluginInstallationGate, PluginInstallationGate.Id> {

    List<PluginInstallationGate> findByInstallationId(UUID installationId);

    List<PluginInstallationGate> findByInstallationIdAndStatus(UUID installationId, String status);
}
