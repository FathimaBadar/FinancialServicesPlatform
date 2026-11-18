-- FSP Phase-0 core schema (V1)
-- Conventions: money = NUMERIC(20,0) minor units; enum-ish columns = TEXT + app-level constraint;
-- tenants/persons/roles seeded separately (system seed); demo data NEVER here (see AGENTS.md §2).

-- ============ ORGANIZATION ============
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY,
    parent_tenant_id    UUID REFERENCES tenants(id),
    hierarchy_path      TEXT NOT NULL,              -- '/<tenantId>/<tenantId>...'
    depth               INT  NOT NULL,
    type                TEXT NOT NULL,              -- PLATFORM | PSP | TENANT
    sub_type            TEXT,                       -- MANUFACTURER|DISTRIBUTOR|DEALER|WHOLESALER|MERCHANT
    status              TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING|ACTIVE|SUSPENDED|DEACTIVATED
    verification_status TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING|VERIFIED|REJECTED
    legal_name          TEXT,
    created_by          UUID,
    activated_by        UUID,
    version             BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenants_parent ON tenants(parent_tenant_id);
CREATE INDEX idx_tenants_status ON tenants(status, type, sub_type);

CREATE TABLE persons (
    id             UUID PRIMARY KEY,
    tenant_id      UUID NOT NULL REFERENCES tenants(id),
    username       TEXT NOT NULL UNIQUE,
    full_name      TEXT NOT NULL,
    email          TEXT,
    phone          TEXT,
    password_hash  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|ARCHIVED|DISABLED
    is_applicant   BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at    TIMESTAMPTZ,
    version        BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ RBAC ============
CREATE TABLE permissions (
    key       TEXT PRIMARY KEY,      -- e.g. 'je.approve'
    title     TEXT NOT NULL,
    risk      TEXT NOT NULL,         -- READ|WRITE|FOUR_EYES
    component TEXT NOT NULL          -- owning component
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    key         TEXT NOT NULL,
    name        TEXT NOT NULL,
    scope       TEXT NOT NULL,       -- PLATFORM|TENANT|SUBTREE|EDGE
    version     BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, key)
);

CREATE TABLE role_permissions (
    role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key),
    PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE user_roles (
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    role_id   UUID NOT NULL REFERENCES roles(id),
    PRIMARY KEY (person_id, role_id)
);

-- ============ FOUR-EYES REQUESTS (generic; JE/KYC/GL have own states too) ============
CREATE TABLE approval_requests (
    id                 UUID PRIMARY KEY,
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    operation_type     TEXT NOT NULL,
    target_resource_id UUID,
    payload_hash       TEXT NOT NULL,
    maker_id           UUID NOT NULL REFERENCES persons(id),
    checker_id         UUID REFERENCES persons(id),
    status             TEXT NOT NULL DEFAULT 'PENDING_CHECKER', -- PENDING_CHECKER|APPROVED|REJECTED
    reason             TEXT,
    requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at         TIMESTAMPTZ,
    version            BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_approvals_status ON approval_requests(tenant_id, status);

-- ============ AUDIT (append-only) ============
CREATE TABLE audit_log (
    id                BIGSERIAL PRIMARY KEY,
    actor_id          UUID,
    checker_id        UUID,
    tenant_id         UUID,
    book_id           UUID,
    action_type       TEXT NOT NULL,
    resource_type     TEXT NOT NULL,
    resource_id       TEXT,
    before_state_hash TEXT,
    after_state_hash  TEXT,
    correlation_id    TEXT NOT NULL,
    ip_address        TEXT,
    client_id         TEXT,
    simulated         BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp_utc     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, timestamp_utc DESC);
CREATE INDEX idx_audit_correlation ON audit_log(correlation_id);
CREATE INDEX idx_audit_resource    ON audit_log(resource_type, resource_id);

-- ============ OUTBOX ============
CREATE TABLE outbox_events (
    id             BIGSERIAL PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id   UUID NOT NULL,
    event_name     TEXT NOT NULL,
    payload        JSONB NOT NULL,
    correlation_id TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(published_at) WHERE published_at IS NULL;

-- ============ KYC ============
CREATE TABLE kyc_cases (
    id               UUID PRIMARY KEY,
    tenant_id        UUID NOT NULL UNIQUE REFERENCES tenants(id),
    status           TEXT NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW|APPROVED|REJECTED|REQUEST_INFO
    submitted_by     UUID REFERENCES persons(id),
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at       TIMESTAMPTZ,
    reviewer_id      UUID REFERENCES persons(id),
    rejection_reason TEXT,
    risk_rating      TEXT,                -- LOW|MEDIUM|HIGH
    next_review_date DATE,
    -- 5-tab capture (tab 1..2 flat, tab 3 addresses, tab 4 in kyc_ubos, tab 5 in kyc_bank_accounts)
    legal_name            TEXT NOT NULL,
    dba_name              TEXT,
    entity_type           TEXT NOT NULL,
    registration_number   TEXT NOT NULL,   -- BIPA
    incorporation_date    DATE,
    tax_id                TEXT,            -- TIN
    mcc_code              TEXT,
    website_url           TEXT,
    expected_monthly_volume NUMERIC(20,0),
    avg_ticket_size       NUMERIC(20,0),
    registered_address    TEXT,
    registered_city       TEXT,
    registered_region     TEXT,
    registered_postal     TEXT,
    registered_country    TEXT NOT NULL,
    operational_address_same BOOLEAN NOT NULL DEFAULT TRUE,
    operational_address   TEXT,
    operational_city      TEXT,
    operational_region    TEXT,
    operational_postal    TEXT,
    version          BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE kyc_checks (
    id         UUID PRIMARY KEY,
    case_id    UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    tenant_id  UUID NOT NULL,
    check_type TEXT NOT NULL,      -- IDENTITY|SANCTIONS|ADVERSE_MEDIA|PEP
    result     TEXT NOT NULL,      -- PASS|FAIL|MANUAL_REVIEW
    details    TEXT,
    simulated  BOOLEAN NOT NULL DEFAULT TRUE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_checks_case ON kyc_checks(case_id);

CREATE TABLE kyc_ubos (
    id                   UUID PRIMARY KEY,
    case_id              UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    person_no            INT NOT NULL,
    full_name            TEXT NOT NULL,
    dob                  DATE,
    nationality          TEXT,
    residential_address  TEXT,
    phone                TEXT,
    email                TEXT,
    id_doc_type          TEXT NOT NULL,
    id_number            TEXT NOT NULL,
    id_expiry            DATE,
    ownership_pct        NUMERIC(5,2) NOT NULL,   -- >= 25 required at least once
    is_pep               BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (case_id, person_no)
);

CREATE TABLE kyc_bank_accounts (
    id             UUID PRIMARY KEY,
    case_id        UUID NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    holder_name    TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    branch_code    TEXT NOT NULL,     -- 5-6 digits
    account_number TEXT NOT NULL,
    account_type   TEXT NOT NULL,     -- CHECKING|SAVINGS
    status         TEXT NOT NULL,     -- PENDING_APPROVAL|ACTIVE|REVOKED
    requested_by   UUID,
    approved_by    UUID,
    version        BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ BOOKS / COA / PERIODS ============
CREATE TABLE books (
    id         UUID PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    name       TEXT NOT NULL,
    currency   CHAR(3) NOT NULL,
    ledger_id  INT  NOT NULL,        -- TigerBeetle ledger = ISO-4217 numeric
    status     TEXT NOT NULL DEFAULT 'SUSPENDED', -- SUSPENDED|ACTIVE|CLOSED
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_tenant ON books(tenant_id);

CREATE TABLE gl_accounts (
    id              UUID PRIMARY KEY,
    book_id         UUID NOT NULL REFERENCES books(id),
    tenant_id       UUID NOT NULL,
    parent_id       UUID REFERENCES gl_accounts(id),
    tb_account_id   TEXT,             -- u128 (decimal string); NULL until TB provisioned
    ledger_id       INT NOT NULL,
    code            INT NOT NULL,
    name            TEXT NOT NULL,
    account_type    TEXT NOT NULL,    -- ASSET|LIABILITY|EQUITY|INCOME|EXPENSE|CLEARING
    normal_balance  TEXT NOT NULL,    -- DEBIT|CREDIT|NONE (presentation only)
    balance_bound   TEXT NOT NULL,    -- NONE|DEBIT_BOUND|CREDIT_BOUND
    posting_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    currency        CHAR(3) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|ACTIVE|SUSPENDED|CLOSED
    created_by      UUID,
    approved_by     UUID,
    version         BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (book_id, code)
);
CREATE INDEX idx_gl_accounts_book ON gl_accounts(book_id, status);

CREATE TABLE accounting_periods (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    book_id     UUID NOT NULL REFERENCES books(id),
    fiscal_year INT  NOT NULL,
    period_no   INT  NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'OPEN', -- OPEN|SOFT_CLOSED|HARD_CLOSED
    opened_by   UUID,
    closed_by   UUID,
    version     BIGINT NOT NULL DEFAULT 0,
    UNIQUE (book_id, fiscal_year, period_no)
);

-- ============ JOURNAL ============
CREATE TABLE journal_entries (
    id             UUID PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    book_id        UUID NOT NULL REFERENCES books(id),
    period_id      UUID REFERENCES accounting_periods(id),
    entry_type     TEXT NOT NULL DEFAULT 'MANUAL',
    posting_date   DATE NOT NULL,
    value_date     DATE NOT NULL,
    description    TEXT,
    reference      TEXT,
    currency       CHAR(3) NOT NULL,
    total_debits   NUMERIC(20,0) NOT NULL,
    total_credits  NUMERIC(20,0) NOT NULL,
    status         TEXT NOT NULL DEFAULT 'DRAFT',
        -- DRAFT|PENDING_CHECKER|READY|SUBMITTING|COMMITTED|COMMIT_UNKNOWN|FINALIZED|REJECTED|REVERSED
    plan_hash      TEXT,
    tb_transfer_ids TEXT NOT NULL DEFAULT '',   -- comma-joined u128 decimal strings ('' none)
    maker_id       UUID NOT NULL,
    checker_id     UUID,
    finalized_at   TIMESTAMPTZ,
    version        BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_je_tenant_status ON journal_entries(tenant_id, status, posting_date DESC);
CREATE INDEX idx_je_book_dates    ON journal_entries(book_id, posting_date);

CREATE TABLE journal_lines (
    id            UUID PRIMARY KEY,
    entry_id      UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_no       INT NOT NULL,
    gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
    direction     TEXT NOT NULL,     -- DEBIT|CREDIT
    amount        NUMERIC(20,0) NOT NULL CHECK (amount > 0),
    memo          TEXT,
    UNIQUE (entry_id, line_no)
);
CREATE INDEX idx_jl_entry ON journal_lines(entry_id);

-- ============ KYC MASTER DATA (reference) ============
CREATE TABLE kyc_master_values (
    category  TEXT NOT NULL,    -- BANK|ENTITY_TYPE|MCC|DOC_TYPE|COUNTRY|SCREENING_RESULT
    code      TEXT NOT NULL,
    label     TEXT NOT NULL,
    extra_json TEXT,
    PRIMARY KEY (category, code)
);
