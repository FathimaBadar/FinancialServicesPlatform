-- V4: currency columns CHAR(3) → VARCHAR(3). Hibernate schema validation rejects bpchar
-- (CHAR) for @Column(length=3) String mappings; VARCHAR(3) is the correct ISO-4217 type.
ALTER TABLE books           ALTER COLUMN currency TYPE varchar(3);
ALTER TABLE gl_accounts     ALTER COLUMN currency TYPE varchar(3);
ALTER TABLE journal_entries ALTER COLUMN currency TYPE varchar(3);
