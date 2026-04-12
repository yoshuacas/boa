#!/usr/bin/env bash
set -euo pipefail

# BOA — Database migration runner
# Applies pending SQL migrations from the migrations/ directory.
# Tracks applied migrations in a _boa_migrations table in DSQL.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(pwd)"
BOA_DIR="$PROJECT_DIR/.boa"
CONFIG_FILE="$BOA_DIR/config.json"
MIGRATIONS_DIR="$PROJECT_DIR/migrations"

# ------------------------------------------------------------------
# Load config
# ------------------------------------------------------------------
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: $CONFIG_FILE not found."
  echo "Run bootstrap.sh first to perform initial setup."
  exit 1
fi

DSQL_ENDPOINT=$(jq -r '.dsqlEndpoint' "$CONFIG_FILE")
REGION=$(jq -r '.region' "$CONFIG_FILE")

if [[ -z "$DSQL_ENDPOINT" || "$DSQL_ENDPOINT" == "null" ]]; then
  echo "Error: dsqlEndpoint not found in $CONFIG_FILE"
  exit 1
fi

# ------------------------------------------------------------------
# Prerequisite checks
# ------------------------------------------------------------------
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is not installed. Please install it first."
    exit 1
  fi
}

check_command aws
check_command psql
check_command jq

# ------------------------------------------------------------------
# Cross-platform SHA-256
# ------------------------------------------------------------------
sha256() {
  if command -v sha256sum &>/dev/null; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    echo "Error: No SHA-256 tool found (need sha256sum or shasum)." >&2
    exit 1
  fi
}

# ------------------------------------------------------------------
# Check for migration files
# ------------------------------------------------------------------
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "No migrations/ directory found. Nothing to migrate."
  exit 0
fi

shopt -s nullglob
SQL_FILES=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  echo "No .sql files in migrations/. Nothing to migrate."
  exit 0
fi

# Sort files by name
IFS=$'\n' SQL_FILES=($(printf '%s\n' "${SQL_FILES[@]}" | sort)); unset IFS

echo "Found ${#SQL_FILES[@]} migration file(s)."
echo ""

# ------------------------------------------------------------------
# Generate IAM auth token
# ------------------------------------------------------------------
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" \
  --region "$REGION" 2>&1) || {
  echo "Error: Failed to generate DSQL auth token."
  echo "$TOKEN"
  exit 1
}

export PGPASSWORD="$TOKEN"
CONNSTR="host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require"

# ------------------------------------------------------------------
# Create tracking table
# ------------------------------------------------------------------
psql "$CONNSTR" -q -c "
  CREATE TABLE IF NOT EXISTS _boa_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )
" 2>&1 || {
  echo "Error: Failed to create _boa_migrations table."
  exit 1
}

# ------------------------------------------------------------------
# Load applied migrations
# ------------------------------------------------------------------
APPLIED=$(psql "$CONNSTR" -t -A -c "SELECT name || '|' || checksum FROM _boa_migrations ORDER BY name" 2>&1) || {
  echo "Error: Failed to read _boa_migrations table."
  exit 1
}

# Store applied migrations as newline-separated "name|checksum" pairs
# (compatible with bash 3.2 — no associative arrays)

# ------------------------------------------------------------------
# Apply pending migrations
# ------------------------------------------------------------------
SKIP_COUNT=0
APPLY_COUNT=0
FAIL_COUNT=0

for file in "${SQL_FILES[@]}"; do
  NAME=$(basename "$file")
  CHECKSUM=$(sha256 "$file")

  # Already applied — verify checksum
  STORED_CHECKSUM=$(echo "$APPLIED" | grep "^${NAME}|" | cut -d'|' -f2)
  if [[ -n "$STORED_CHECKSUM" ]]; then
    if [[ "$CHECKSUM" != "$STORED_CHECKSUM" ]]; then
      echo "  [ERROR] $NAME — file modified after being applied"
      echo "          Expected: $STORED_CHECKSUM"
      echo "          Current:  $CHECKSUM"
      echo ""
      echo "Never edit an applied migration. Write a new migration to fix the issue."
      exit 1
    fi
    echo "  [skip] $NAME"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    continue
  fi

  # Apply migration
  echo "  [run]  $NAME ..."
  if psql "$CONNSTR" -q -f "$file" 2>&1; then
    # Record the migration
    psql "$CONNSTR" -q -c "INSERT INTO _boa_migrations (name, checksum) VALUES ('$NAME', '$CHECKSUM')" 2>&1
    echo "  [done] $NAME"
    APPLY_COUNT=$((APPLY_COUNT + 1))
  else
    echo "  [FAIL] $NAME"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo ""
    echo "Migration failed. Fix the issue and run migrate.sh again."
    echo "Migrations that were already applied before this run are safe."
    exit 1
  fi
done

# ------------------------------------------------------------------
# Refresh PostgREST schema cache
# ------------------------------------------------------------------
if [[ $APPLY_COUNT -gt 0 ]]; then
  API_URL=$(jq -r '.apiUrl // ""' "$CONFIG_FILE")
  SERVICE_ROLE_KEY=$(jq -r '.serviceRoleKey // ""' "$CONFIG_FILE")

  if [[ -n "$API_URL" && "$API_URL" != "null" && -n "$SERVICE_ROLE_KEY" && "$SERVICE_ROLE_KEY" != "null" ]]; then
    echo ""
    echo "Refreshing PostgREST schema cache..."
    curl -s -X GET "$API_URL/rest/v1/_refresh" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -o /dev/null -w "" 2>/dev/null || true
    echo "  [OK] Schema cache refreshed"
  fi
fi

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "Migration complete: $APPLY_COUNT applied, $SKIP_COUNT skipped."
