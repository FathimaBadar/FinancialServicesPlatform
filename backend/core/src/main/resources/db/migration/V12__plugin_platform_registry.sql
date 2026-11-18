-- V12: Plugin platform registry + installations (P2 of plans/plugin-platform-plan.md)
-- plugin_types: a plugin type + version registered platform-wide (manifest hashed + stored).
-- baseUrl is the plugin's gateway-facing base URL (used by the gateway for upstream routing).
-- plugin_installations: per-tenant activation with four-eyes, inheritance, readiness gates.
-- plugin_opt_choices: OPT_IN/OPT_OUT choices for inheritance policy.
-- plugin_event_subscriptions / plugin_event_feed / plugin_event_cursors: core-owned pull feed.

-- ===== Plugin type registry =====
CREATE TABLE plugin_types (
    id          UUID PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL,
    version     VARCHAR(32)  NOT NULL,
    baseUrl     VARCHAR(512) NOT NULL,
    manifest    JSONB        NOT NULL,
    manifest_hash VARCHAR(64)  NOT NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'PENDING_APPROVAL',
    registered_by UUID      NOT NULL,
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_by   UUID,
    approved_at   TIMESTAMPTZ,
    CONSTRAINT plugin_type_status CHECK (status IN ('PENDING_APPROVAL','REGISTERED','SUSPENDED','DEACTIVATED')),
    UNIQUE (code, version)
);
CREATE INDEX ix_plugin_types_code ON plugin_types(code);

-- ===== Per-tenant installation =====
CREATE TABLE plugin_installations (
    id                UUID PRIMARY KEY,
    plugin_code       VARCHAR(64) NOT NULL,
    plugin_version    VARCHAR(32) NOT NULL,
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status            VARCHAR(16) NOT NULL DEFAULT 'PENDING_APPROVAL',
    inheritance_policy VARCHAR(16) NOT NULL DEFAULT 'INHERIT',
    inheritance_origin VARCHAR(32) NOT NULL DEFAULT 'DIRECT',
    config            JSONB,
    version           BIGINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT plugin_installation_status CHECK (status IN ('PENDING_APPROVAL','PROVISIONING','ACTIVE','SUSPENDED','DEACTIVATED')),
    CONSTRAINT plugin_installation_policy CHECK (inheritance_policy IN ('INHERIT','REQUIRED','OPT_OUT','OPT_IN','PROHIBITED')),
    UNIQUE (plugin_code, tenant_id)
);
CREATE INDEX ix_plugin_installations_tenant ON plugin_installations(tenant_id);
CREATE INDEX ix_plugin_installations_code ON plugin_installations(plugin_code);

-- ===== Readiness gates (vision §6.6 gap G14) =====
CREATE TABLE plugin_installation_gates (
    installation_id UUID NOT NULL REFERENCES plugin_installations(id) ON DELETE CASCADE,
    gate            VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (installation_id, gate),
    CONSTRAINT plugin_gate_status CHECK (status IN ('PENDING','ACTIVE','FAILED'))
);
CREATE INDEX ix_plugin_installation_gates_installation ON plugin_installation_gates(installation_id);

-- ===== Opt-in / opt-out choices for inheritance (§5.4) =====
CREATE TABLE plugin_opt_choices (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plugin_code VARCHAR(64) NOT NULL,
    choice      VARCHAR(16) NOT NULL DEFAULT 'OPT_OUT',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, plugin_code),
    CONSTRAINT plugin_opt_choice CHECK (choice IN ('OPT_IN','OPT_OUT'))
);

-- ===== Event subscriptions (from manifest) =====
CREATE TABLE plugin_event_subscriptions (
    plugin_code VARCHAR(64) NOT NULL,
    event_name  VARCHAR(128) NOT NULL,
    PRIMARY KEY (plugin_code, event_name)
);

-- ===== Core-owned event feed (served through the gateway, §8) =====
CREATE TABLE plugin_event_feed (
    seq            BIGSERIAL PRIMARY KEY,
    plugin_code    VARCHAR(64) NOT NULL,
    event_name     VARCHAR(128) NOT NULL,
    payload        JSONB NOT NULL,
    tenant_id      UUID,
    correlation_id UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_plugin_event_feed_plugin_seq ON plugin_event_feed(plugin_code, seq);
CREATE INDEX ix_plugin_event_feed_tenant ON plugin_event_feed(tenant_id, created_at DESC);

-- ===== Ack cursor per plugin =====
CREATE TABLE plugin_event_cursors (
    plugin_code VARCHAR(64) PRIMARY KEY,
    last_ack_seq BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
