package com.fsp.core.plugin.installation;

import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Repository for per-tenant plugin installations. */
public interface PluginInstallationRepository extends CrudRepository<PluginInstallation, UUID> {

    List<PluginInstallation> findByTenantId(UUID tenantId);

    List<PluginInstallation> findByPluginCode(String pluginCode);

    List<PluginInstallation> findByPluginCodeAndTenantIdAndStatus(String pluginCode, UUID tenantId, String status);

    List<PluginInstallation> findByPluginCodeAndStatus(String pluginCode, String status);
}
