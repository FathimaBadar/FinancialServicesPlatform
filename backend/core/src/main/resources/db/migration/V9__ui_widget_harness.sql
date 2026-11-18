-- WIDGET HARNESS — registered widgets + portal layouts (plans/widget-harness-prd.md §3). V8 was taken by approval_payload (first-come).
-- Layout publishing is four-eyes through approval_requests (OpType UI_LAYOUT_PUBLISH).

CREATE TABLE ui_widgets (
    id           varchar(160) PRIMARY KEY,          -- '<area>.<name>', e.g. 'kyc.orgs'
    version      varchar(32)  NOT NULL,
    label        varchar(120) NOT NULL,
    category     varchar(40)  NOT NULL,
    bundle       varchar(160) NOT NULL,
    portals      text         NOT NULL,             -- JSON array of portal ids
    requires     text         NOT NULL,             -- JSON array of permission cells
    status       varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    registered_by uuid        NOT NULL REFERENCES persons(id),
    version_num  bigint       NOT NULL DEFAULT 0,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE ui_layouts (
    id            uuid PRIMARY KEY,
    portal        varchar(40)  NOT NULL,
    status        varchar(20)  NOT NULL,            -- DRAFT | PUBLISHED
    layout_json   text         NOT NULL,
    schema_version int         NOT NULL DEFAULT 1,
    maker_id      uuid         NOT NULL REFERENCES persons(id),
    published_approval_id uuid REFERENCES approval_requests(id),
    version_num   bigint       NOT NULL DEFAULT 0,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ui_layouts_status_check CHECK (status IN ('DRAFT','PUBLISHED'))
);

CREATE UNIQUE INDEX ui_layouts_portal_draft ON ui_layouts (portal) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX ui_layouts_portal_published ON ui_layouts (portal) WHERE status = 'PUBLISHED';

-- New permissions (catalog is append-only). Deliberate: granted to PLATFORM_ADMIN in the
-- same migration — the platform admin IS the harness's first user (plans PRD decision 1).
INSERT INTO permissions (key, title, risk, component) VALUES
  ('ui.widget.register', 'Register UI widgets',        'WRITE',      'ui'),
  ('ui.layout.manage',   'Build and publish portals',  'FOUR_EYES',  'ui');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-000000000101', key FROM permissions WHERE key IN
  ('ui.widget.register', 'ui.layout.manage');
