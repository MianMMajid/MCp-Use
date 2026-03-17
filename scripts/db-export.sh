#!/bin/bash
# Export the local maple database for deployment
# Usage: ./scripts/db-export.sh [output-file]

set -euo pipefail

OUTPUT="${1:-maple-export.sql}"
DB_URL="${DATABASE_URL:-postgresql://maple:maple@localhost:5432/maple}"

echo "Exporting maple database to $OUTPUT..."

# Parse connection string
DB_HOST=$(echo "$DB_URL" | sed -E 's|.*@([^:]+).*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
DB_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --if-exists \
  --clean \
  --create \
  -f "$OUTPUT"

echo "Done. Exported to $OUTPUT ($(wc -c < "$OUTPUT" | tr -d ' ') bytes)"
echo ""
echo "To import on a new deployment:"
echo "  PGPASSWORD=<pass> psql -h <host> -p <port> -U <user> -d postgres -f $OUTPUT"
