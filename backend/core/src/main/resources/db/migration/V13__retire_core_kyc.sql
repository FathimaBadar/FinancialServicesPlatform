-- V13: Retire core KYC (P6 of plugin-platform-plan)
-- KYC has moved to the fsp-plugin-kyc plugin (own DB, own Flyway history).
-- Core's kyc_* tables are dropped; core no longer owns KYC domain logic.
-- Permissions kyc.review/kyc.approve/kyc.reject are KEPT — they're reused by the plugin
-- and live in the permissions table (not a kyc_* table).
-- Tenant creation/activation logic stays in core — now owned by
-- TenantChildrenController (§12.5 step 4) and TenantVerificationController (§7.3).

DROP TABLE IF EXISTS kyc_bank_accounts;
DROP TABLE IF EXISTS kyc_ubos;
DROP TABLE IF EXISTS kyc_checks;
DROP TABLE IF EXISTS kyc_cases;
DROP TABLE IF EXISTS kyc_master_values;
