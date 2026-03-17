#!/bin/bash
# Run enterprise migrations on a target database
# Usage: ./scripts/db-migrate.sh [database-url]
#
# This is idempotent — safe to run multiple times. All statements
# use IF NOT EXISTS / ON CONFLICT DO NOTHING.

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-postgresql://maple:maple@localhost:5432/maple}}"

echo "Running enterprise migrations on $DB_URL..."

DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATION_DIR="$SCRIPT_DIR/../backend/backendB-core-services/gateway-api/service/migrations"

for migration in "$MIGRATION_DIR"/*.sql; do
  echo "  Applying: $(basename "$migration")"
  PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$migration" \
    --quiet \
    --no-psqlrc
done

echo ""
echo "Migrations complete. Verifying..."

PGPASSWORD="$DB_PASS" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -c "SELECT 'enterprise_tables' as check_type, COUNT(*) as value FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('permissions','custom_roles','user_mfa_methods','sso_configurations','scim_configurations','firewall_rules','compliance_mappings','shadow_agents','policy_versions','dashboard_layouts') UNION ALL SELECT 'permissions_seeded', COUNT(*) FROM permissions UNION ALL SELECT 'system_roles', COUNT(*) FROM custom_roles WHERE is_system = TRUE;"

echo ""
echo "Done."
