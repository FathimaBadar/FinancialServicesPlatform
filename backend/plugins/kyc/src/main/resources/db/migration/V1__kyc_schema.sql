-- V1: KYC plugin schema (plugin-platform-plan §12.3)
-- Plugin owns its own DB (fsp_plugin_kyc); core never reads it; plugin never reads core's.

-- ===== KYC cases =====
CREATE TABLE kyc_cases (
    id               UUID PRIMARY KEY,
    owner_tenant_id  UUID NOT NULL,                   -- installation tenant
    subject_tenant_id UUID,                           -- applicant org (set once core created it — saga)
    case_no          VARCHAR(64) NOT NULL UNIQUE,     -- KYC-2026-000123
    status           VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    approval_id      UUID,
    approval_rev     BIGINT,
    maker_person_id  UUID,
    maker_name       TEXT,                            -- username from the actor assertion (display)
    checker_person_id UUID,
    sub_type         VARCHAR(32) NOT NULL,
    legal_name       TEXT NOT NULL,
    dba_name         TEXT,
    entity_type      VARCHAR(64) NOT NULL,
    registration_number VARCHAR(64) NOT NULL,
    incorporation_date DATE,
    tax_id           VARCHAR(64),
    mcc_code         VARCHAR(16),
    website_url      TEXT,
    expected_monthly_volume NUMERIC(20,0),
    avg_ticket_size  NUMERIC(20,0),
    registered_address TEXT,
    registered_city  TEXT,
    registered_region TEXT,
    registered_postal TEXT,
    registered_country TEXT,
    operational_address_same BOOLEAN NOT NULL DEFAULT TRUE,
    operational_address TEXT,
    operational_city TEXT,
    operational_region TEXT,
    operational_postal TEXT,
    risk_rating      VARCHAR(16),
    next_review_date DATE,
    submitted_at     TIMESTAMPTZ,
    search_vector    TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(legal_name,'') || ' ' ||
                    coalesce(dba_name,'') || ' ' ||
                    coalesce(registration_number,'') || ' ' ||
                    coalesce(case_no,'') || ' ' ||
                    coalesce(tax_id,''))
    ) STORED,
    version          BIGINT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE kyc_case_no_seq START 1;
CREATE INDEX idx_kyc_cases_owner_submitted ON kyc_cases(owner_tenant_id, submitted_at DESC);
CREATE INDEX idx_kyc_cases_owner_status ON kyc_cases(owner_tenant_id, status, updated_at DESC);
CREATE INDEX idx_kyc_cases_subject ON kyc_cases(subject_tenant_id);
CREATE INDEX idx_kyc_cases_search ON kyc_cases USING GIN(search_vector);

-- ===== KYC checks =====
CREATE TABLE kyc_checks (
    id          UUID PRIMARY KEY,
    case_id     UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    owner_tenant_id UUID NOT NULL,
    check_type  VARCHAR(32) NOT NULL,      -- IDENTITY|SANCTIONS
    result      VARCHAR(32) NOT NULL,      -- PASS|FAIL|MANUAL_REVIEW
    details     TEXT,
    simulated   BOOLEAN NOT NULL DEFAULT TRUE,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_checks_case ON kyc_checks(case_id);

-- ===== KYC UBOs =====
CREATE TABLE kyc_ubos (
    id             UUID PRIMARY KEY,
    case_id        UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    owner_tenant_id UUID NOT NULL,
    person_no      INT NOT NULL,
    full_name      TEXT NOT NULL,
    dob            DATE,
    nationality    TEXT,
    residential_address TEXT,
    phone          TEXT,
    email          TEXT,
    id_doc_type    VARCHAR(32) NOT NULL,
    id_number      VARCHAR(64) NOT NULL,
    id_expiry      DATE,
    ownership_pct  NUMERIC(5,2) NOT NULL,
    is_pep         BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (case_id, person_no)
);

-- ===== KYC bank accounts =====
CREATE TABLE kyc_bank_accounts (
    id             UUID PRIMARY KEY,
    case_id        UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    owner_tenant_id UUID NOT NULL,
    holder_name    TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    branch_code    VARCHAR(16) NOT NULL,
    account_number TEXT NOT NULL,
    account_type   VARCHAR(32) NOT NULL,
    status         VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
    requested_by   UUID,
    approved_by    UUID,
    version        BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== KYC case events (domain history for UI) =====
CREATE TABLE kyc_case_events (
    id             UUID PRIMARY KEY,
    case_id        UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    owner_tenant_id UUID NOT NULL,
    event_type     VARCHAR(64) NOT NULL,
    payload        JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_case_events_case ON kyc_case_events(case_id, created_at DESC);

-- ===== Plugin-level idempotency records =====
CREATE TABLE idempotency_records (
    id             UUID PRIMARY KEY,
    person_id      UUID NOT NULL,
    request_key    VARCHAR(128) NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    response_status INTEGER,
    response_content_type VARCHAR(128),
    response_body  BYTEA,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (person_id, request_key)
);

-- ===== Event cursor (plugin's feed ack) =====
CREATE TABLE event_cursor (
    plugin_code VARCHAR(64) PRIMARY KEY DEFAULT 'kyc',
    last_ack_seq BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Installations cache (plugin's view of its installation status) =====
CREATE TABLE installations_cache (
    plugin_code  VARCHAR(64) PRIMARY KEY DEFAULT 'kyc',
    tenant_id    UUID NOT NULL,
    status       VARCHAR(32) NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
