-- Checker flag (docs/checker-flag.md): a person may resolve a four-eyes approval only when
-- persons.is_checker is TRUE, IN ADDITION to holding the approval's checker permission and
-- not being its maker. Default FALSE: nobody becomes a checker by accident.
ALTER TABLE persons ADD COLUMN is_checker BOOLEAN NOT NULL DEFAULT FALSE;
