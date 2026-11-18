package com.fsp.core.plugin.events;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Repository for the core-owned plugin event feed. */
public interface PluginEventFeedRepository extends JpaRepository<PluginEventFeed, Long> {

    List<PluginEventFeed> findByPluginCodeAndSeqGreaterThanOrderBySeqAsc(String pluginCode, long after);

    @Query("SELECT MAX(f.seq) FROM PluginEventFeed f WHERE f.pluginCode = :pluginCode")
    Optional<Long> maxSeqForPlugin(@Param("pluginCode") String pluginCode);

    List<PluginEventFeed> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
