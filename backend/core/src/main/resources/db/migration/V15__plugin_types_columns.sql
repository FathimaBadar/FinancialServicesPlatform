-- V15: align plugin_types with its entity (V12 created an unquoted "baseUrl" → baseurl, and no
-- optimistic-lock column for PluginType's @Version). Applied migrations are immutable (AGENTS §2.5).
ALTER TABLE plugin_types RENAME COLUMN baseurl TO base_url;
ALTER TABLE plugin_types ADD COLUMN row_version BIGINT NOT NULL DEFAULT 0;
