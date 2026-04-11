#!/usr/bin/env bash
set -euo pipefail

# BOA — First-time setup script
# Deploys the full serverless backend stack via SAM/CloudFormation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_PATH="$PLUGIN_DIR/templates/backend.yaml"
PROJECT_DIR="$(pwd)"
BOA_DIR="$PROJECT_DIR/.boa"

# ------------------------------------------------------------------
# Defaults
# ------------------------------------------------------------------
STACK_NAME=""
REGION=""

# ------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------
usage() {
  cat <<USAGE
Usage: $(basename "$0") --stack-name <name> [--region <region>]

Options:
  --stack-name    Name for the CloudFormation stack (required)
  --region        AWS region to deploy into (default: from AWS config)
  -h, --help      Show this help message
USAGE
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Error: Unknown option $1"
      usage
      ;;
  esac
done

if [[ -z "$STACK_NAME" ]]; then
  echo "Error: --stack-name is required"
  usage
fi

# ------------------------------------------------------------------
# Prerequisite checks
# ------------------------------------------------------------------
echo "Checking prerequisites..."

check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is not installed. Please install it first."
    exit 1
  fi
  echo "  [OK] $1 found"
}

check_command aws
check_command sam
check_command node
check_command jq

echo ""
echo "Verifying AWS credentials..."
CALLER_IDENTITY=$(aws sts get-caller-identity 2>&1) || {
  echo "Error: AWS credentials are not configured or are invalid."
  echo "$CALLER_IDENTITY"
  exit 1
}
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
echo "  [OK] Authenticated as account $ACCOUNT_ID"

# Resolve region
if [[ -z "$REGION" ]]; then
  REGION=$(aws configure get region 2>/dev/null || echo "")
  if [[ -z "$REGION" ]]; then
    echo "Error: No region specified and none found in AWS config."
    echo "Use --region <region> or run 'aws configure' first."
    exit 1
  fi
fi
echo "  [OK] Region: $REGION"
echo ""

# ------------------------------------------------------------------
# Create .boa directory
# ------------------------------------------------------------------
mkdir -p "$BOA_DIR"
echo "Created $BOA_DIR"

# ------------------------------------------------------------------
# Generate JWT secret and store in SSM
# ------------------------------------------------------------------
echo ""
echo "Generating JWT secret..."
JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")

echo "Storing JWT secret in SSM Parameter Store..."
aws ssm put-parameter \
  --name "/${STACK_NAME}/jwt-secret" \
  --value "$JWT_SECRET" \
  --type SecureString \
  --overwrite \
  --region "$REGION" || {
  echo "Error: Failed to store JWT secret in SSM."
  exit 1
}
echo "  [OK] JWT secret stored at /${STACK_NAME}/jwt-secret"

# ------------------------------------------------------------------
# SAM build and deploy
# ------------------------------------------------------------------
echo ""
echo "Building SAM application..."
sam build \
  --template-file "$TEMPLATE_PATH" \
  --build-dir "$BOA_DIR/.aws-sam/build" \
  --region "$REGION"

echo ""
echo "Deploying stack '$STACK_NAME' to $REGION..."
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
# Extract CloudFormation outputs
# ------------------------------------------------------------------
echo ""
echo "Extracting stack outputs..."

OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs' \
  --output json)

get_output() {
  echo "$OUTPUTS" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"
}

API_URL=$(get_output "ApiUrl")
USER_POOL_ID=$(get_output "UserPoolId")
USER_POOL_CLIENT_ID=$(get_output "UserPoolClientId")
BUCKET_NAME=$(get_output "BucketName")
DSQL_ENDPOINT=$(get_output "DsqlEndpoint")

# ------------------------------------------------------------------
# Generate BOA keys (anon key + service role key)
# ------------------------------------------------------------------
echo ""
echo "Generating BOA keys..."
KEYS=$(node "$SCRIPT_DIR/generate-keys.mjs" "$JWT_SECRET")
ANON_KEY=$(echo "$KEYS" | jq -r '.anonKey')
SERVICE_ROLE_KEY=$(echo "$KEYS" | jq -r '.serviceRoleKey')
echo "  [OK] Anon key and service role key generated"

# ------------------------------------------------------------------
# Write config
# ------------------------------------------------------------------
cat > "$BOA_DIR/config.json" <<EOF
{
  "stackName": "$STACK_NAME",
  "region": "$REGION",
  "accountId": "$ACCOUNT_ID",
  "apiUrl": "$API_URL",
  "anonKey": "$ANON_KEY",
  "serviceRoleKey": "$SERVICE_ROLE_KEY",
  "userPoolId": "$USER_POOL_ID",
  "userPoolClientId": "$USER_POOL_CLIENT_ID",
  "bucketName": "$BUCKET_NAME",
  "dsqlEndpoint": "$DSQL_ENDPOINT",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "Configuration written to $BOA_DIR/config.json"
echo ""
echo "======================================"
echo "  BOA deployment complete"
echo "======================================"
echo ""
echo "  API URL:          $API_URL"
echo "  Anon Key:         ${ANON_KEY:0:20}..."
echo "  Service Role Key: ${SERVICE_ROLE_KEY:0:20}..."
echo "  User Pool ID:     $USER_POOL_ID"
echo "  Client ID:        $USER_POOL_CLIENT_ID"
echo "  S3 Bucket:        $BUCKET_NAME"
echo "  DSQL Endpoint:    $DSQL_ENDPOINT"
echo ""
echo "Verification commands:"
echo "  curl -s \"$API_URL/items\" -H \"apikey: $ANON_KEY\" -w '\\n%{http_code}'"
echo "  aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --region $REGION --query 'UserPool.AdminCreateUserConfig'"
echo "  aws s3api get-public-access-block --bucket $BUCKET_NAME --region $REGION"
echo ""
echo "Run './scripts/verify.sh' to check everything automatically."
