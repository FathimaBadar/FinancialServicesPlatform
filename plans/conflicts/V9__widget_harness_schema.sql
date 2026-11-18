-- V9: widget harness schema (Phase 1 PRD §3)
-- Two tables: ui_widgets (registry) and ui_layouts (portal layouts).
-- Also seeds the two new permissions: ui.widget.register (WRITE), ui.layout.manage (FOUR_EYES).
-- Migrations are immutable — V8 already exists (approval_payload), so this is V9.

CREATE TABLE ui_widgets (
    id VARCHAR(128) PRIMARY KEY,           -- "<area>.<name>"
    version BIGINT NOT NULL DEFAULT 0,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    bundle VARCHAR(255) NOT NULL,          -- React bundle entry / asset URL
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    registered_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ui_layouts (
    portal VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',   -- DRAFT | PUBLISHED
    layout_json JSONB NOT NULL,
    maker_id UUID NOT NULL,
    published_approval_id UUID,                    -- → approval_requests when PUBLISHED
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (portal, status),
    CONSTRAINT fk_ui_layouts_approval FOREIGN KEY (published_approval_id)
        REFERENCES approval_requests(id)
);

-- At most one DRAFT + one PUBLISHED per portal is enforced by the service layer
-- (unique (portal, status) is the PK, plus status precondition checks).

-- Permission catalog additions (PRD §4)
INSERT INTO permissions (key, title, risk, component) VALUES
  ('ui.widget.register', 'Register / upsert UI widget', 'WRITE', 'platform'),
  ('ui.layout.manage',   'Manage portal layouts (draft/publish)', 'FOUR_EYES', 'platform');
