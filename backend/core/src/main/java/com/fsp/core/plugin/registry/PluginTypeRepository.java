package com.fsp.core.plugin.registry;

import org.springframework.data.repository.CrudRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Repository for registered plugin types. */
public interface PluginTypeRepository extends CrudRepository<PluginType, UUID> {

    List<PluginType> findByCode(String code);

    Optional<PluginType> findByCodeAndVersion(String code, String version);

    List<PluginType> findByCodeAndStatus(String code, String status);

    List<PluginType> findByStatus(String status);

    boolean existsByCodeAndVersion(String code, String version);
}
