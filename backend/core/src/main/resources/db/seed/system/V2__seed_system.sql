-- SYSTEM SEED — runs in EVERY environment. Demo data is FORBIDDEN here (AGENTS.md §2).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ Permission catalog (append-only) ============
INSERT INTO permissions (key, title, risk, component) VALUES
  ('platform.bootstrap',     'Bootstrap platform root',          'FOUR_EYES', 'platform'),
  ('org.create',             'Create PSP tenant',                'FOUR_EYES', 'org'),
  ('org.activate',           'Activate tenant',                  'FOUR_EYES', 'org'),
  ('org.onboard_child',      'Onboard child tenant via KYC',     'FOUR_EYES', 'org'),
  ('org.approve_child',      'Approve child onboarding',         'FOUR_EYES', 'org'),
  ('kyc.review',             'Review KYC applications',          'READ',      'kyc'),
  ('kyc.approve',            'Approve KYC application',          'FOUR_EYES', 'kyc'),
  ('kyc.reject',             'Reject KYC application',           'FOUR_EYES', 'kyc'),
  ('screening.run',          'Run simulated screening checks',   'WRITE',     'kyc'),
  ('bank.account.create',    'Request settlement bank account',  'WRITE',     'kyc'),
  ('bank.account.approve',   'Approve settlement bank account',  'FOUR_EYES', 'kyc'),
  ('gl.account.create',      'Create GL account (maker)',        'FOUR_EYES', 'ledger'),
  ('gl.account.approve',     'Approve GL account (checker)',     'FOUR_EYES', 'ledger'),
  ('gl.account.view',        'View chart of accounts',           'READ',      'ledger'),
  ('je.create',              'Create journal entry (maker)',     'FOUR_EYES', 'journal'),
  ('je.approve',             'Approve journal entry (checker)',  'FOUR_EYES', 'journal'),
  ('je.view',                'View journal entries',             'READ',      'journal'),
  ('period.open',            'Open accounting period',           'FOUR_EYES', 'ledger'),
  ('period.close',           'Close accounting period',          'FOUR_EYES', 'ledger'),
  ('audit.view',             'View audit log',                   'READ',      'audit'),
  ('role.manage',            'Manage roles and assignments',     'FOUR_EYES', 'rbac'),
  ('user.manage',            'Manage users',                     'FOUR_EYES', 'rbac');

-- ============ Platform root tenant ============
INSERT INTO tenants (id, parent_tenant_id, hierarchy_path, depth, type, status, verification_status, legal_name)
VALUES ('00000000-0000-0000-0000-000000000001', NULL, '/00000000-0000-0000-0000-000000000001', 0,
        'PLATFORM', 'ACTIVE', 'VERIFIED', 'FSP Platform Root');

-- Platform role template (scope PLATFORM = reaches every tenant's subtree)
INSERT INTO roles (id, tenant_id, key, name, scope) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'PLATFORM_ADMIN', 'Platform Administrator', 'PLATFORM');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-000000000101', key FROM permissions;

-- ============ KYC master data ============
-- Namibian banks (branch codes: reference examples from BoN registry, confirm per bank in prod)
INSERT INTO kyc_master_values (category, code, label, extra_json) VALUES
  ('BANK', 'BANK_WINDHOEK',  'Bank Windhoek',             '{"branches":["481972","481772","481872","482273","481573"]}'),
  ('BANK', 'FNB_NAMIBIA',    'First National Bank Namibia','{"branches":["280172","280472","280475","280673"]}'),
  ('BANK', 'NEDBANK_NAMIBIA','Nedbank Namibia',           '{"branches":["461629","461052","461076"]}'),
  ('BANK', 'STANDARD_BANK',  'Standard Bank Namibia',     '{"branches":["082372","082172","085173","080672"]}'),
  ('BANK', 'BANK_BIC',       'Bank BIC Namibia',          '{"branches":[]}'),
  ('BANK', 'LETSHEGO',       'Letshego Bank Namibia',     '{"branches":[]}'),
  ('BANK', 'BANCO_ATLANTICO','Banco Atlántico (foreign)', '{"branches":[]}');

INSERT INTO kyc_master_values (category, code, label) VALUES
  ('ENTITY_TYPE', 'SOLE_PROPRIETORSHIP', 'Sole Proprietorship'),
  ('ENTITY_TYPE', 'PARTNERSHIP',        'Partnership'),
  ('ENTITY_TYPE', 'PRIVATE_LIMITED',    'Private Limited / LLC'),
  ('ENTITY_TYPE', 'PUBLIC_CORPORATION', 'Public Corporation'),
  ('ENTITY_TYPE', 'TRUST_NGO',          'Trust / NGO');

INSERT INTO kyc_master_values (category, code, label) VALUES
  ('MCC', '5411', 'Grocery Stores'),
  ('MCC', '5812', 'Restaurants'),
  ('MCC', '5311', 'Department Stores'),
  ('MCC', '5734', 'Computer Software'),
  ('MCC', '4789', 'Transport Services'),
  ('MCC', '8911', 'Professional Services');

INSERT INTO kyc_master_values (category, code, label) VALUES
  ('DOC_TYPE', 'PASSPORT',      'Passport'),
  ('DOC_TYPE', 'NATIONAL_ID',   'National ID'),
  ('DOC_TYPE', 'DRIVERS_LICENSE','Driver''s License');

INSERT INTO kyc_master_values (category, code, label) VALUES
  ('COUNTRY', 'NA', 'Namibia'),
  ('COUNTRY', 'ZA', 'South Africa'),
  ('COUNTRY', 'BW', 'Botswana'),
  ('COUNTRY', 'AO', 'Angola'),
  ('COUNTRY', 'DE', 'Germany'),
  ('COUNTRY', 'GB', 'United Kingdom'),
  ('COUNTRY', 'US', 'United States');

INSERT INTO kyc_master_values (category, code, label) VALUES
  ('SCREENING_RESULT', 'PASS',          'Check passed'),
  ('SCREENING_RESULT', 'FAIL',          'Check failed'),
  ('SCREENING_RESULT', 'MANUAL_REVIEW', 'Manual review required');

-- ============ Bootstrap platform admin (password via Flyway placeholder) ============
-- ============ Bootstrap platform admin + dedicated checker (four-eyes partner) ============
-- Password via Flyway placeholder; both accounts share FSP_BOOTSTRAP_PASSWORD.
-- admin-checker exists so every FOUR_EYES operation the admin makes has a
-- platform-level counterparty (maker ≠ checker is still enforced per person).
INSERT INTO persons (id, tenant_id, username, full_name, email, password_hash, status, is_applicant)
VALUES ('00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000001',
        'platform-admin', 'Platform Administrator', 'platform-admin@fsp.local',
        crypt('${fspBootstrapPassword}', gen_salt('bf', 10)),
        'ACTIVE', FALSE),
       ('00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000001',
        'admin-checker', 'Platform Checker', 'admin-checker@fsp.local',
        crypt('${fspBootstrapPassword}', gen_salt('bf', 10)),
        'ACTIVE', FALSE);

INSERT INTO user_roles (person_id, role_id)
VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
       ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101');
