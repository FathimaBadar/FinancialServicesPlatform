-- DEMO SEED — loads ONLY with Spring profile `client-demo` (application-client-demo.yml).
-- NEVER loaded otherwise. See AGENTS.md §2.
-- Demo credentials: psp-admin / psp-ops / merchant-admin / merchant-checker — password demo1234.
-- All money is minor units (NAD cents). Structural ids use the f0..0a/b/c/d/e pattern.

-- ============ PSP tenant (ACTIVE, CoA seeded) ============
INSERT INTO tenants (id, parent_tenant_id, hierarchy_path, depth, type, sub_type, status, verification_status, legal_name, activated_by)
VALUES ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000000001',
        '/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a1', 1,
        'PSP', NULL, 'ACTIVE', 'VERIFIED', 'Demo PSP (Namibia)', '00000000-0000-0000-0000-000000000201');

INSERT INTO persons (id, tenant_id, username, full_name, email, password_hash, status)
VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'psp-admin',  'Demo PSP Admin',  'psp-admin@demo.local',  crypt('demo1234', gen_salt('bf',10)), 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'psp-ops',    'Demo TPTS Ops',   'psp-ops@demo.local',    crypt('demo1234', gen_salt('bf',10)), 'ACTIVE');

-- PSP roles + grants
INSERT INTO roles (id, tenant_id, key, name, scope) VALUES
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000000a1', 'PSP_ADMIN', 'PSP Administrator', 'SUBTREE'),
  ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000000a1', 'TPTS_OPS',  'TPTS Operations',   'SUBTREE');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-0000000001a1', key FROM permissions
WHERE key IN ('org.onboard_child','org.approve_child','kyc.review','kyc.approve','kyc.reject',
              'screening.run','bank.account.create','bank.account.approve',
              'gl.account.create','gl.account.approve','gl.account.view',
              'je.create','je.approve','je.view','period.open','period.close','audit.view','role.manage','user.manage');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-0000000001a2', key FROM permissions
WHERE key IN ('kyc.review','kyc.approve','kyc.reject','screening.run','bank.account.approve',
              'gl.account.approve','gl.account.view','je.view','audit.view');

INSERT INTO user_roles (person_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000001a2');

INSERT INTO books (id, tenant_id, name, currency, ledger_id, status)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'PSP Operations Book', 'NAD', 516, 'ACTIVE');

-- PSP CoA (template subset) — ACTIVE, no TB ids in demo (balances report zero)
INSERT INTO gl_accounts (id, book_id, tenant_id, tb_account_id, ledger_id, code, name, account_type, normal_balance, balance_bound, currency, status, created_by, approved_by) VALUES
  ('00000000-0000-0000-0000-000000000d11','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,1000,'Cash at Bank','ASSET','DEBIT','DEBIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d12','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,1300,'Acquirer Clearing','ASSET','DEBIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d13','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,1150,'Merchant Reserve','ASSET','DEBIT','DEBIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d14','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,2110,'Payouts in Transit','ASSET','DEBIT','DEBIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d15','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,2100,'Merchant Payable','LIABILITY','CREDIT','CREDIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d16','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,2200,'Chargeback Payable','LIABILITY','CREDIT','CREDIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d17','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,1350,'Network Fees Payable','LIABILITY','CREDIT','CREDIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d18','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,4100,'MDR Revenue','INCOME','CREDIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d19','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,5100,'Interchange Expense','EXPENSE','DEBIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000d1a','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',NULL,516,5200,'Scheme Fee Expense','EXPENSE','DEBIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1');

-- ============ Onboarded tenant: merchant (KYC APPROVED, CoA seeded) ============
INSERT INTO tenants (id, parent_tenant_id, hierarchy_path, depth, type, sub_type, status, verification_status, legal_name, activated_by)
VALUES ('00000000-0000-0000-0000-0000000000a2',
        '00000000-0000-0000-0000-0000000000a1',
        '/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000a2', 2,
        'TENANT', 'MERCHANT', 'ACTIVE', 'VERIFIED', 'Namib Fresh (Pty) Ltd', '00000000-0000-0000-0000-0000000000b2');

INSERT INTO persons (id, tenant_id, username, full_name, email, password_hash, status)
VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'merchant-admin',   'Tulonga Shipanga', 'tulonga@namibfresh.na', crypt('demo1234', gen_salt('bf',10)), 'ACTIVE'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'merchant-checker', 'Petrus Nangolo',   'petrus@namibfresh.na',  crypt('demo1234', gen_salt('bf',10)), 'ACTIVE');

INSERT INTO roles (id, tenant_id, key, name, scope) VALUES
  ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000000a2', 'TENANT_ADMIN',   'Organization Administrator', 'TENANT'),
  ('00000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-0000000000a2', 'TENANT_CHECKER', 'Organization Checker',       'TENANT');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-0000000002a1', key FROM permissions
WHERE key IN ('je.create','je.view','gl.account.create','gl.account.view','bank.account.create','audit.view');

INSERT INTO role_permissions (role_id, permission_key)
SELECT '00000000-0000-0000-0000-0000000002a2', key FROM permissions
WHERE key IN ('je.approve','je.view','gl.account.approve','gl.account.view','bank.account.approve','audit.view');

INSERT INTO user_roles (person_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000002a2');

INSERT INTO books (id, tenant_id, name, currency, ledger_id, status)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Namib Fresh Operating Book', 'NAD', 516, 'ACTIVE');

INSERT INTO gl_accounts (id, book_id, tenant_id, tb_account_id, ledger_id, code, name, account_type, normal_balance, balance_bound, currency, status, created_by, approved_by) VALUES
  ('00000000-0000-0000-0000-000000000e11','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',NULL,516,1000,'Cash at Bank','ASSET','DEBIT','DEBIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000000e12','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',NULL,516,2000,'Customer Deposits','LIABILITY','CREDIT','CREDIT_BOUND','NAD','ACTIVE','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000000e13','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',NULL,516,4000,'Fee Revenue','INCOME','CREDIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-000000000e14','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',NULL,516,5100,'Payment Fees Expense','EXPENSE','DEBIT','NONE','NAD','ACTIVE','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2');

INSERT INTO accounting_periods (id, tenant_id, book_id, fiscal_year, period_no, start_date, end_date, status, opened_by) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 2026, 12, DATE '2026-12-01', DATE '2026-12-31', 'OPEN', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 2026, 12, DATE '2026-12-01', DATE '2026-12-31', 'OPEN', '00000000-0000-0000-0000-0000000000b1');

-- ============ Merchant KYC case (approved, four-eyes demo: maker psp-admin, checker psp-ops) ============
INSERT INTO kyc_cases (id, tenant_id, status, submitted_by, submitted_at, decided_at, reviewer_id, risk_rating, next_review_date,
                       legal_name, dba_name, entity_type, registration_number, incorporation_date, tax_id,
                       mcc_code, website_url, expected_monthly_volume, avg_ticket_size,
                       registered_address, registered_city, registered_region, registered_postal, registered_country,
                       operational_address_same)
VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'APPROVED',
        '00000000-0000-0000-0000-0000000000b1', now() - interval '10 days', now() - interval '9 days',
        '00000000-0000-0000-0000-0000000000b2', 'LOW', now() + interval '36 months',
        'Namib Fresh (Pty) Ltd', 'Namib Fresh', 'PRIVATE_LIMITED', 'CC/2019/04512', DATE '2019-04-12', '73486341',
        '5311', 'https://namibfresh.na', 150000000, 250000,
        '14 Sam Nujoma Drive', 'Windhoek', 'Khomas', '9000', 'NA',
        TRUE);

INSERT INTO kyc_checks (id, case_id, tenant_id, check_type, result, details, simulated, checked_at) VALUES
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'IDENTITY',  'PASS', 'Simulated identity verification (demo)', TRUE, now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'SANCTIONS', 'PASS', 'Simulated sanctions screening (demo)',   TRUE, now() - interval '10 days');

INSERT INTO kyc_ubos (id, case_id, person_no, full_name, dob, nationality, residential_address, phone, email,
                      id_doc_type, id_number, id_expiry, ownership_pct, is_pep)
VALUES ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000e1', 1,
        'Tulonga Shipanga', DATE '1988-06-30', 'NA', '8 Empress Court, Windhoek', '+264811234567', 'tulonga@namibfresh.na',
        'NATIONAL_ID', '883056741', DATE '2031-06-30', 100.00, FALSE);

INSERT INTO kyc_bank_accounts (id, case_id, holder_name, bank_name, branch_code, account_number, account_type, status, requested_by, approved_by)
VALUES ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e1',
        'Namib Fresh (Pty) Ltd', 'BANK_WINDHOEK', '481972', '80000123456', 'CHECKING', 'ACTIVE',
        '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2');
