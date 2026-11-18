package com.fsp.core.plugin.events;

import org.springframework.data.repository.CrudRepository;

import java.util.List;

/** Repository for plugin event subscriptions. */
public interface PluginEventSubscriptionRepository extends CrudRepository<PluginEventSubscription, PluginEventSubscription.Id> {

    List<PluginEventSubscription> findByPluginCode(String pluginCode);
}
