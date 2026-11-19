-- Checker flag (docs/checker-flag.md): a person may resolve a four-eyes approval only when
-- persons.is_checker is TRUE, IN ADDITION to holding the approval's checker permission and
-- not being its maker. Default FALSE: nobody becomes a checker by accident.
ALTER TABLE persons ADD COLUMN is_checker BOOLEAN NOT NULL DEFAULT FALSE;

-- Designate admin-checker as a checker so four-eyes KYC decisions can actually be made.
-- platform-admin is NOT a checker (they hold kyc.approve via the PLATFORM_ADMIN role but
-- is_checker defaults FALSE — permission alone is not sufficient).
UPDATE persons SET is_checker = TRUE WHERE username = 'admin-checker';
