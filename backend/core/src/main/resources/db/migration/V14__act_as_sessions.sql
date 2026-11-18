-- V14: Act-as tenant ("sudo into a tenant", plans/act-as-tenant-plan.md)
-- A person holding tenant.act_as at their home org can act as any tenant strictly below it.
-- The session names the real person and the target tenant; every audit row written while
-- acting carries both actor_id (real person) and acting_tenant_id / act_session_id.

-- ===== Act-as sessions =====
CREATE TABLE act_as_sessions (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    person_id    UUID         NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    home_tenant_id UUID       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    target_tenant_id UUID     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    ended_at     TIMESTAMPTZ,
    end_reason   VARCHAR(32)
);
-- one live session per person
CREATE UNIQUE INDEX ux_act_as_sessions_live ON act_as_sessions (person_id) WHERE ended_at IS NULL;
CREATE INDEX ix_act_as_sessions_target ON act_as_sessions(target_tenant_id, started_at);

-- ===== Audit: never hide the real person while acting =====
ALTER TABLE audit_log ADD COLUMN acting_tenant_id UUID;
ALTER TABLE audit_log ADD COLUMN act_session_id VARCHAR(36);
CREATE INDEX ix_audit_logs_acting_tenant ON audit_log (acting_tenant_id) WHERE acting_tenant_id IS NOT NULL;
CREATE INDEX ix_audit_logs_act_session ON audit_log (act_session_id) WHERE act_session_id IS NOT NULL;

-- ===== Permission: tenant.act_as (FOUR_EYES) =====
INSERT INTO permissions (key, title, risk, component)
VALUES ('tenant.act_as', 'Act as a tenant below your own (sudo)', 'FOUR_EYES', 'tenant')
ON CONFLICT (key) DO NOTHING;

-- Grant to PLATFORM_ADMIN at platform root (covers BOTH platform-admin AND admin-checker —
-- both bootstrap persons hold that role in V2 seed). A fresh SELECT-from-permissions grant
-- was cut in V2, BEFORE this key existed, so the explicit grant is required (V11 pattern).
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN (SELECT 'tenant.act_as' AS key) p
WHERE r.key = 'PLATFORM_ADMIN'
ON CONFLICT (role_id, permission_key) DO NOTHING;
