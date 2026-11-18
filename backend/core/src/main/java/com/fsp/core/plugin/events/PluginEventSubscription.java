package com.fsp.core.plugin.events;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** Which events a plugin subscribes to (from its manifest). Core's dispatcher copies
 *  matching outbox events into plugin_event_feed. */
@Entity
@Table(name = "plugin_event_subscriptions")
@IdClass(PluginEventSubscription.Id.class)
public class PluginEventSubscription {

    public static class Id {
        public String pluginCode;
        public String eventName;

        public Id() {}
        public Id(String pluginCode, String eventName) {
            this.pluginCode = pluginCode;
            this.eventName = eventName;
        }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Id id)) return false;
            return pluginCode.equals(id.pluginCode) && eventName.equals(id.eventName);
        }
        @Override public int hashCode() {
            return pluginCode.hashCode() * 31 + eventName.hashCode();
        }
    }

    @jakarta.persistence.Id
    public String pluginCode;

    @jakarta.persistence.Id
    public String eventName;

    protected PluginEventSubscription() {}
    public PluginEventSubscription(String pluginCode, String eventName) {
        this.pluginCode = pluginCode;
        this.eventName = eventName;
    }
}
