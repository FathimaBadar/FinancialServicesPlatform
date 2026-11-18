-- V8: payload column on approval_requests so domain handlers can re-apply
-- the maker's payload when a checker resolves from the queue (four-eyes for user changes).
ALTER TABLE approval_requests ADD COLUMN payload TEXT;
