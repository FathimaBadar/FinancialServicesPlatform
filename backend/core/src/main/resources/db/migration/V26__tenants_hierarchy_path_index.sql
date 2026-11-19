-- User-management org picker (GET /v1/tenants/{id}/user-orgs) finds an org's whole subtree with
-- hierarchy_path LIKE '<path>/%'. text_pattern_ops lets PostgreSQL serve that prefix match from
-- the index whatever the database collation is.
CREATE INDEX tenants_hierarchy_path_idx ON tenants (hierarchy_path text_pattern_ops);
