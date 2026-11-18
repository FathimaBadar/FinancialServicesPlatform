-- SIGNED PORTAL DELIVERY (plans/signed-portal-delivery-plan.md S1)
-- Signed delivery bundles per portal + widget asset digest column.
-- V8/V9 are taken (approval_payload / ui_widget_harness — applied).

-- Widgets may declare the sha256 of their BUILT asset chunk ("sha256:<64 hex>").
-- The bundle embeds it; the SPA refuses dynamic import on mismatch (SRI-style).
ALTER TABLE ui_widgets ADD COLUMN bundle_sha256 VARCHAR(80) NULL;

-- Append-only signed bundles; exactly one CURRENT row per portal (partial unique).
CREATE TABLE ui_bundles (
    id          UUID PRIMARY KEY,
    portal      VARCHAR(40)  NOT NULL,
    current     BOOLEAN      NOT NULL DEFAULT TRUE,
    kid         VARCHAR(80)  NOT NULL,   -- signing key id (trust-store lookup)
    alg         VARCHAR(16)  NOT NULL,   -- ES256
    digest      VARCHAR(80)  NOT NULL,   -- sha256:<hex> of the canonical payload
    payload     TEXT         NOT NULL,   -- canonical JSON (sorted keys, no whitespace)
    jws         TEXT         NOT NULL,   -- JWS compact serialization over canonical payload
    layout_id   UUID         NULL REFERENCES ui_layouts(id),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CHECK (current IN (TRUE, FALSE))
);
CREATE UNIQUE INDEX ux_ui_bundles_current ON ui_bundles (portal) WHERE current;
CREATE INDEX ix_ui_bundles_history ON ui_bundles (portal, created_at DESC);

-- Registry digest default for widgets registered without a built-asset hash:
-- delivered as "sha256:unregistered" → SPA treats chunk integrity as UNVERIFIED (not failed).
