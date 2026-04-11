#!/usr/bin/env bash
set -euo pipefail

# BOA — SAM deploy wrapper
# Reads existing .boa/config.json, rebuilds, and redeploys.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_PATH="$PLUGIN_DIR/templates/backend.yaml"
PROJECT_DIR="$(pwd)"
BOA_DIR="$PROJECT_DIR/.boa"
CONFIG_FILE="$BOA_DIR/config.json"

# ------------------------------------------------------------------
# Load config
# ------------------------------------------------------------------
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: $CONFIG_FILE not found."
  echo "Run bootstrap.sh first to perform initial setup."
  exit 1
fi

STACK_NAME=$(jq -r '.stackName' "$CONFIG_FILE")
REGION=$(jq -r '.region' "$CONFIG_FILE")

echo "Deploying stack '$STACK_NAME' in region '$REGION'..."
echo ""

# ------------------------------------------------------------------
# SAM build and deploy
# ------------------------------------------------------------------
echo "Building SAM application..."
sam build \
  --template-file "$TEMPLATE_PATH" \
  --build-dir "$BOA_DIR/.aws-sam/build" \
  --region "$REGION"

echo ""
echo "Deploying..."
sam deploy \
  --template-file "$BOA_DIR/.aws-sam/build/template.yaml" \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "ProjectName=$STACK_NAME"

# ------------------------------------------------------------------
# Update config with fresh outputs
# ------------------------------------------------------------------
echo ""
echo "Updating configuration..."

ACCOUNT_ID=$(jq -r '.accountId' "$CONFIG_FILE")

OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs' \
  --output json)

get_output() {
  echo "$OUTPUTS" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"
}

cat > "$CONFIG_FILE" <<EOF
{
  "stackName": "$STACK_NAME",
  "region": "$REGION",
  "accountId": "$ACCOUNT_ID",
  "apiUrl": "$(get_output "ApiUrl")",
  "userPoolId": "$(get_output "UserPoolId")",
  "userPoolClientId": "$(get_output "UserPoolClientId")",
  "bucketName": "$(get_output "BucketName")",
  "dsqlEndpoint": "$(get_output "DsqlEndpoint")",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Deploy complete. Configuration updated at $CONFIG_FILE"
echo "API URL: $(jq -r '.apiUrl' "$CONFIG_FILE")"
