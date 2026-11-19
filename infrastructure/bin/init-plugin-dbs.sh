#!/usr/bin/env bash
# Creates the plugin databases + roles idempotently (dev):
#   fsp_plugin_kyc (exists gap: was never bootstrapped anywhere — kept here too)
#   fsp_plugin_inventory
# Usage: ./infrastructure/bin/init-plugin-dbs.sh
set -euo pipefail

CONTAINER="${FSP_PG_CONTAINER:-fsp-postgres}"

sql_for() {
  local db="$1" user="$2"
  cat <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${user}') THEN
    CREATE ROLE ${user} LOGIN PASSWORD '${user}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${db} OWNER ${user}'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${db}')\gexec
SQL
}

docker exec -i "$CONTAINER" psql -U fsp -d fsp -v ON_ERROR_STOP=1 <<SQL
$(sql_for fsp_plugin_kyc fsp_plugin_kyc)
$(sql_for fsp_plugin_inventory fsp_plugin_inventory)
SQL

echo "plugin databases ready: fsp_plugin_kyc, fsp_plugin_inventory"
