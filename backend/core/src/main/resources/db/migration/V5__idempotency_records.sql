-- V5: transport-level idempotency records (AGENTS.md §2e).
-- One row per mutating request carrying an Idempotency-Key;
-- identical retries replay the stored response, divergent payloads are rejected.
CREATE TABLE idempotency_records (
    id             uuid PRIMARY KEY,
    user_id        uuid         NOT NULL,           -- actor person id (maker identity)
    request_key    varchar(128) NOT NULL,           -- client-supplied Idempotency-Key
    method         varchar(10)  NOT NULL,
    path           varchar(255) NOT NULL,
    request_hash   varchar(64)  NOT NULL,           -- sha256(method + path + body) — detects reuse w/ different payload
    state          varchar(16)  NOT NULL,           -- PENDING | DONE
    status_code    int,                             -- set when DONE
    content_type   varchar(100),
    response_body  bytea,                           -- set when DONE
    created_at     timestamptz  NOT NULL DEFAULT now(),
    completed_at   timestamptz,
    CONSTRAINT ck_idem_state CHECK (state IN ('PENDING', 'DONE'))
);

CREATE UNIQUE INDEX ux_idempotency_user_key ON idempotency_records (user_id, request_key);
CREATE INDEX ix_idempotency_created ON idempotency_records (created_at);
