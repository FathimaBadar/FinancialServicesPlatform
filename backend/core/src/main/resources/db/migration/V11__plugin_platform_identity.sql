-- V11: Plugin platform identity (P1 of plans/plugin-platform-plan.md)
-- oauth_clients: IdP registry of machine clients (BFF + plugins). client_credentials
-- grant with private_key_jwt + DPoP; no refresh tokens; status checked per request (I7).
-- client_grants: machine permission grants (client_id -> permission, owner_tenant scoped).
-- approvals.client_id: attributing plugin-mediated approvals to the plugin client.

-- ===== IdP OAuth client registry (machine clients) =====
CREATE TABLE oauth_clients (
    client_id       VARCHAR(128) PRIMARY KEY,
    client_type     VARCHAR(16)  NOT NULL DEFAULT 'MACHINE',   -- PERSON_APP | MACHINE
    jwks            JSONB        NOT NULL,                      -- public JWKS (client-auth + DPoP keys)
    grant_types     JSONB        NOT NULL DEFAULT '["client_credentials"]',
    status          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE | SUSPENDED | DEACTIVATED
    owner_tenant_id UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_ttl_s     INTEGER      NOT NULL DEFAULT 300,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT oauth_client_type_shape CHECK (client_type IN ('PERSON_APP','MACHINE')),
    CONSTRAINT oauth_client_status_shape CHECK (status IN ('ACTIVE','SUSPENDED','DEACTIVATED'))
);
CREATE INDEX ix_oauth_clients_owner ON oauth_clients(owner_tenant_id);

-- ===== Machine client permission grants =====
-- A grant binds a client to a permission at an owner tenant (or its ancestors via chain logic
-- in PermissionService.effectiveKeysForClient). Kind distinguishes MACHINE vs ON_BEHALF grants.
CREATE TABLE client_grants (
    client_id              VARCHAR(128) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    owner_tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    operation_or_permission VARCHAR(128) NOT NULL,
    kind                   VARCHAR(16)  NOT NULL DEFAULT 'MACHINE',  -- MACHINE | ON_BEHALF
    granted_by             UUID,                                     -- person who granted
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, owner_tenant_id, operation_or_permission, kind)
);
CREATE INDEX ix_client_grants_client ON client_grants(client_id);
CREATE INDEX ix_client_grants_owner ON client_grants(owner_tenant_id);

-- ===== Approvals: client attribution (plugin-mediated approvals) =====
ALTER TABLE approval_requests ADD COLUMN client_id VARCHAR(128) NULL REFERENCES oauth_clients(client_id);
CREATE INDEX ix_approvals_client_id ON approval_requests(client_id);

-- ===== Permissions (zero grants — AGENTS §5b: new permission = deliberate role migration) =====
INSERT INTO permissions (key, title, risk, component)
VALUES
    ('plugin.register', 'Register a plugin type', 'FOUR_EYES', 'platform'),
    ('plugin.install', 'Install a plugin on a tenant', 'FOUR_EYES', 'platform'),
    ('plugin.manage', 'Manage plugin registrations and installations', 'FOUR_EYES', 'platform')
ON CONFLICT (key) DO NOTHING;

-- Platform admin holds all plugin permissions.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN (
    SELECT unnest(ARRAY['plugin.register','plugin.install','plugin.manage']) AS key
) p WHERE r.key = 'PLATFORM_ADMIN'
ON CONFLICT (role_id, permission_key) DO NOTHING;
