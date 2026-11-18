# Parallel-session conflict — moved out of db/migration (2026-11-18)

A second working session created V9__widget_harness_schema.sql while V9__ui_widget_harness.sql
was already applied (flyway_schema_history shows '9 - ui widget harness'). Two V9 files = every boot fails.
The applied schema (mine) is authoritative for the ui slice; this file is preserved for reconciliation.

Differences from applied V9: version BIGINT vs VARCHAR, JSONB vs text, PK(portal,status) vs uuid PK +
partial unique indexes, no portals/requires columns, component=platform vs ui.

