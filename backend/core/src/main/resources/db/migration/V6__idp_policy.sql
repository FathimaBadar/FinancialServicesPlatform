-- V6: Identity provider policy + federated identity mappings.
-- Native FSP IdP is the DEFAULT for every tenant (absence of a row == FSP_NATIVE);
-- a tenant admin may override with a THIRD_PARTY issuer for their subtree (vision §3.3,
-- guide §1 trust boundaries). The IdP service owns authentication; core keeps only the
-- canonical person graph (four-eyes anchors stay person-based).

CREATE TABLE IF NOT EXISTS idp_configs (
    tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    provider        VARCHAR(32)  NOT NULL DEFAULT 'FSP_NATIVE',      -- FSP_NATIVE | THIRD_PARTY
    issuer_url      VARCHAR(512),                                    -- required when THIRD_PARTY
    audience        VARCHAR(255),
    client_id       VARCHAR(255),
    jwks_uri        VARCHAR(512),
    policy_version  INTEGER      NOT NULL DEFAULT 0,
    updated_by      UUID,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT idp_provider_shape CHECK (
        (provider = 'FSP_NATIVE')
        OR (provider = 'THIRD_PARTY' AND issuer_url IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS idp_identities (
    identity_id  UUID PRIMARY KEY,
    issuer       VARCHAR(512) NOT NULL,
    subject      VARCHAR(512) NOT NULL,
    person_id    UUID         NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    tenant_id    UUID         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_idp_identity UNIQUE (issuer, subject)
);
CREATE INDEX IF NOT EXISTS ix_idp_identity_person ON idp_identities(person_id);
CREATE INDEX IF NOT EXISTS ix_idp_identity_tenant ON idp_identities(tenant_id);

-- Capability protecting tenant-scoped IdP policy management (IdP-owned endpoint; gateway re-issues identity).
INSERT INTO permissions (key, title, risk, component)
VALUES ('idp.manage', 'Manage tenant identity provider', 'WRITE', 'identity')
ON CONFLICT (key) DO NOTHING;

-- Tenant admins manage their own subtree policy; platform admin reaches everything.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'idp.manage' FROM roles r WHERE r.key = 'TENANT_ADMIN'
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-000000000101', 'idp.manage'
ON CONFLICT (role_id, permission_key) DO NOTHING;
