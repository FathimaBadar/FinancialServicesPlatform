package com.fsp.core.plugin.installation;

import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Repository for OPT_IN/OPT_OUT choices. */
public interface PluginOptChoiceRepository extends CrudRepository<PluginOptChoice, PluginOptChoice.Id> {

    List<PluginOptChoice> findByTenantId(UUID tenantId);

    Optional<PluginOptChoice> findByTenantIdAndPluginCode(UUID tenantId, String pluginCode);
}
