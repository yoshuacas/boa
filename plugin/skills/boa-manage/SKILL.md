---
name: boa-manage
description: Inspect, manage, and operate a running BOA backend — view tables and schema, check stack status, tail Lambda logs, seed data, open the dashboard, test APIs locally with sam local, and monitor costs. Use this skill when a developer wants to see what's in their backend, check on their deployment, view logs, manage data, run local tests, or understand their AWS usage. Triggers on phrases like "show me my tables", "what's deployed", "open dashboard", "view logs", "seed data", "test locally", "status", "how much is this costing".
license: Apache-2.0
allowed-tools: "Bash(aws *) Bash(sam *) Bash(psql *) Bash(curl *) Bash(jq *) Bash(node *) Bash(npm *) Bash(bash *) Bash(open *) Read Grep Glob Write Edit"
---

# BOA Manage — Inspect & Operate

Tools for working with a running BOA backend. All commands read from `.boa/config.json` — if it doesn't exist, the backend hasn't been bootstrapped yet (use the `boa` skill first).

## Load Config

Every operation starts by loading the backend config:

```bash
CONFIG=".boa/config.json"
if [ ! -f "$CONFIG" ]; then
  echo "No .boa/config.json found. Run bootstrap.sh first."
  exit 1
fi
STACK_NAME=$(jq -r '.stackName' $CONFIG)
REGION=$(jq -r '.region' $CONFIG)
API_URL=$(jq -r '.apiUrl' $CONFIG)
ANON_KEY=$(jq -r '.anonKey' $CONFIG)
SERVICE_KEY=$(jq -r '.serviceRoleKey' $CONFIG)
USER_POOL_ID=$(jq -r '.userPoolId' $CONFIG)
DSQL_ENDPOINT=$(jq -r '.dsqlEndpoint' $CONFIG)
BUCKET=$(jq -r '.bucketName' $CONFIG)
```

## Dashboard

Open the local management dashboard — static HTML pages that read data via AWS CLI:

```bash
BOA_PLUGIN="$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")"
if [[ ! -f .boa/dashboard/index.html ]]; then
  mkdir -p .boa/dashboard/css .boa/dashboard/js
  for f in index.html database.html auth.html functions.html api.html storage.html; do
    curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
  for f in css/dashboard.css js/aws-cli-bridge.js js/dashboard-core.js; do
    curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
fi
open .boa/dashboard/index.html
```

## Schema Inspection

### List all tables

```bash
# Generate IAM auth token for DSQL
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $DSQL_ENDPOINT --region $REGION --expires-in 3600)

psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

### Describe a table

```bash
psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" \
  -c "\d <table_name>"
```

### Show row counts

```bash
psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" \
  -c "SELECT schemaname, relname AS table, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
```

### List indexes

```bash
psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" \
  -c "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;"
```

## Stack Status

### Current stack state

```bash
aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' --output table
```

### All stack outputs

```bash
aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table
```

### Recent stack events (last 10)

```bash
aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
  --query 'StackEvents[:10].[Timestamp,LogicalResourceId,ResourceStatus]' --output table
```

## Lambda Logs

### Tail logs in real time

```bash
# Main API handler
aws logs tail /aws/lambda/${STACK_NAME}-ApiHandler --since 5m --follow --region $REGION

# Authorizer
aws logs tail /aws/lambda/${STACK_NAME}-Authorizer --since 5m --follow --region $REGION
```

### Search logs for errors

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/${STACK_NAME}-ApiHandler \
  --filter-pattern "ERROR" \
  --start-time $(date -v-1H +%s000) \
  --region $REGION \
  --query 'events[*].message' --output text
```

## Auth Management

### List users

```bash
aws cognito-idp list-users --user-pool-id $USER_POOL_ID --region $REGION \
  --query 'Users[*].{Username:Username,Status:UserStatus,Created:UserCreateDate}' --output table
```

### Check a specific user

```bash
aws cognito-idp admin-get-user --user-pool-id $USER_POOL_ID --username <email> --region $REGION
```

### Delete a test user

```bash
aws cognito-idp admin-delete-user --user-pool-id $USER_POOL_ID --username <email> --region $REGION
```

## Database Seeding

Create seed files in a `seeds/` directory, then run them:

```bash
mkdir -p seeds
```

Write SQL seed files (e.g., `seeds/001_sample_data.sql`):

```sql
-- seeds/001_sample_data.sql
INSERT INTO games (opponent_name, game_date, location, score_home, score_away, user_id)
VALUES
  ('City FC', '2026-03-15', 'Home Stadium', 3, 1, '<user-id>'),
  ('United', '2026-03-22', 'Away Ground', 1, 2, '<user-id>');
```

Run seeds (same pattern as migrations):

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $DSQL_ENDPOINT --region $REGION --expires-in 3600)

for f in seeds/*.sql; do
  echo "Running seed: $f"
  psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" -f "$f"
done
```

### Reset database (drop all user tables)

Use with care — this deletes all data:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname $DSQL_ENDPOINT --region $REGION --expires-in 3600)

psql "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin password=$TOKEN sslmode=require" \
  -c "DO \$\$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS ' || r.tablename || ' CASCADE'; END LOOP; END \$\$;"
```

Then re-run migrations:

```bash
BOA_PLUGIN="$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")"
bash $BOA_PLUGIN/scripts/migrate.sh
```

## Local Testing

### Test API locally with SAM

```bash
BOA_PLUGIN="$(dirname "$(dirname "$CLAUDE_SKILL_DIR")")"

# Build first
sam build -t $BOA_PLUGIN/templates/backend.yaml

# Start local API (requires Docker)
sam local start-api \
  --env-vars <(jq -n --arg ep "$DSQL_ENDPOINT" --arg r "$REGION" \
    '{"Parameters": {"DSQL_ENDPOINT": $ep, "REGION_NAME": $r}}') \
  --port 3001
```

Then test:

```bash
curl http://localhost:3001/auth/v1/signup \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

### Quick API smoke test (against deployed backend)

```bash
# Test auth
echo "=== Signup ==="
curl -s "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","password":"SmokeTest123!"}' | jq '.user.id'

echo "=== Sign in ==="
TOKEN=$(curl -s "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","password":"SmokeTest123!"}' | jq -r '.access_token')

echo "=== List tables (via REST) ==="
curl -s "$API_URL/rest/v1/" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" | jq '.'
```

## Storage Inspection

### List files in S3 bucket

```bash
aws s3 ls s3://$BUCKET/ --recursive --human-readable --region $REGION
```

### Check bucket size

```bash
aws s3 ls s3://$BUCKET/ --recursive --summarize --region $REGION | tail -2
```

### Verify bucket is not public

```bash
aws s3api get-public-access-block --bucket $BUCKET --region $REGION
```

## Cost Monitoring

### Current month charges (all services)

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[0].Groups[?Metrics.UnblendedCost.Amount!=`0`].{Service:Keys[0],Cost:Metrics.UnblendedCost.Amount}' \
  --output table
```

### Estimated month-end cost

```bash
aws ce get-cost-forecast \
  --time-period Start=$(date +%Y-%m-%d),End=$(date -v+1m +%Y-%m-01) \
  --metric UNBLENDED_COST \
  --granularity MONTHLY \
  --query '{Forecast:Total.Amount,Unit:Total.Unit}'
```

For detailed cost analysis and comparison with Supabase, use the `boa-pricing` skill.
