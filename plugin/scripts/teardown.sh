#!/usr/bin/env bash
set -euo pipefail

# BOA — Clean removal of the entire stack
# Empties S3, disables deletion protection, deletes CloudFormation stack.
#
# WARNING: This destroys the database, user accounts, and uploaded files.
# This is for intentional decommissioning ONLY — never for troubleshooting.
# If something is broken, fix the specific issue instead of tearing down.

PROJECT_DIR="$(pwd)"
BOA_DIR="$PROJECT_DIR/.boa"
CONFIG_FILE="$BOA_DIR/config.json"

# ------------------------------------------------------------------
# Load config
# ------------------------------------------------------------------
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: $CONFIG_FILE not found. Nothing to tear down."
  exit 1
fi

STACK_NAME=$(jq -r '.stackName' "$CONFIG_FILE")
REGION=$(jq -r '.region' "$CONFIG_FILE")
BUCKET_NAME=$(jq -r '.bucketName' "$CONFIG_FILE")
USER_POOL_ID=$(jq -r '.userPoolId' "$CONFIG_FILE")
DSQL_ENDPOINT=$(jq -r '.dsqlEndpoint' "$CONFIG_FILE")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    DESTRUCTIVE OPERATION                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  This will PERMANENTLY DESTROY:                             ║"
echo "║    • All database tables and data (Aurora DSQL)             ║"
echo "║    • All user accounts (Cognito)                            ║"
echo "║    • All uploaded files (S3)                                ║"
echo "║    • All Lambda functions and API endpoints                 ║"
echo "║                                                             ║"
echo "║  This CANNOT be undone.                                     ║"
echo "║                                                             ║"
echo "║  If you're trying to FIX a problem, stop here.             ║"
echo "║  Use deploy.sh to redeploy, or debug the specific issue.   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Stack:     $STACK_NAME"
echo "  Region:    $REGION"
echo "  Database:  $DSQL_ENDPOINT"
echo "  Users:     $USER_POOL_ID"
echo "  Storage:   $BUCKET_NAME"
echo ""

# ------------------------------------------------------------------
# Double confirmation
# ------------------------------------------------------------------
read -r -p "Type the stack name to confirm deletion [$STACK_NAME]: " CONFIRM
if [[ "$CONFIRM" != "$STACK_NAME" ]]; then
  echo "Teardown cancelled. You typed '$CONFIRM' but the stack name is '$STACK_NAME'."
  exit 0
fi

echo ""

# ------------------------------------------------------------------
# Disable deletion protection (required before CloudFormation can delete)
# ------------------------------------------------------------------
echo "Disabling deletion protection on stateful resources..."

# DSQL cluster
DSQL_CLUSTER_ID=$(echo "$DSQL_ENDPOINT" | cut -d. -f1)
aws dsql update-cluster --identifier "$DSQL_CLUSTER_ID" \
  --no-deletion-protection-enabled --region "$REGION" 2>/dev/null || true
echo "  [OK] DSQL deletion protection disabled"

# Cognito user pool
aws cognito-idp update-user-pool --user-pool-id "$USER_POOL_ID" \
  --deletion-protection INACTIVE --region "$REGION" 2>/dev/null || true
echo "  [OK] Cognito deletion protection disabled"

# ------------------------------------------------------------------
# Empty S3 bucket (required before CloudFormation can delete)
# ------------------------------------------------------------------
echo ""
echo "Emptying S3 bucket '$BUCKET_NAME'..."
aws s3 rm "s3://$BUCKET_NAME" --recursive --region "$REGION" 2>/dev/null || true
echo "  [OK] Bucket emptied"

# ------------------------------------------------------------------
# Delete CloudFormation stack
# ------------------------------------------------------------------
echo ""
echo "Deleting CloudFormation stack '$STACK_NAME'..."
sam delete \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --no-prompts

echo "  [OK] Stack deleted"

# ------------------------------------------------------------------
# Clean up SSM parameters
# ------------------------------------------------------------------
echo ""
echo "Cleaning up SSM parameters..."
for param in $(aws ssm get-parameters-by-path --path "/$STACK_NAME/" --region "$REGION" \
  --query 'Parameters[*].Name' --output text 2>/dev/null); do
  aws ssm delete-parameter --name "$param" --region "$REGION" 2>/dev/null || true
done
echo "  [OK] SSM parameters removed"

# ------------------------------------------------------------------
# Remove local config
# ------------------------------------------------------------------
echo ""
echo "Removing $BOA_DIR..."
rm -rf "$BOA_DIR"
echo "  [OK] Local configuration removed"

echo ""
echo "Teardown complete. Stack '$STACK_NAME' has been destroyed."
