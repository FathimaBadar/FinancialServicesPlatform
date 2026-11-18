-- System seed: admin-checker is the platform's designated checker (docs/checker-flag.md).
-- platform-admin stays a maker only, so platform four-eyes always runs admin → admin-checker.
UPDATE persons SET is_checker = TRUE WHERE id = '00000000-0000-0000-0000-000000000202';
