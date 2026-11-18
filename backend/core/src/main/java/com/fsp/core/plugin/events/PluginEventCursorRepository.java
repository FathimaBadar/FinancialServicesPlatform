package com.fsp.core.plugin.events;

import org.springframework.data.repository.CrudRepository;

import java.util.Optional;

/** Repository for per-plugin ack cursors. */
public interface PluginEventCursorRepository extends CrudRepository<PluginEventCursor, String> {

    Optional<PluginEventCursor> findById(String pluginCode);
}
