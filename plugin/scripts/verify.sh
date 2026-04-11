#!/usr/bin/env bash
set -euo pipefail

# BOA — Post-deploy verification
# Checks that all stack components are correctly configured.

PROJECT_DIR="$(pwd)"
BOA_DIR="$PROJECT_DIR/.boa"
CONFIG_FILE="$BOA_DIR/config.json"

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [[ "$result" == "pass" ]]; then
    echo "  [PASS] $name"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $name"
    FAIL=$((FAIL + 1))
  fi
}

# ------------------------------------------------------------------
# Load config
# ------------------------------------------------------------------
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: $CONFIG_FILE not found. Run bootstrap.sh first."
  exit 1
fi

STACK_NAME=$(jq -r '.stackName' "$CONFIG_FILE")
REGION=$(jq -r '.region' "$CONFIG_FILE")
API_URL=$(jq -r '.apiUrl' "$CONFIG_FILE")
USER_POOL_ID=$(jq -r '.userPoolId' "$CONFIG_FILE")
BUCKET_NAME=$(jq -r '.bucketName' "$CONFIG_FILE")

echo "======================================"
echo "  BOA Verification"
echo "======================================"
echo ""
echo "  Stack:  $STACK_NAME"
echo "  Region: $REGION"
echo ""

# ------------------------------------------------------------------
# Check 1: Cognito self-signup is enabled
# ------------------------------------------------------------------
echo "Checking Cognito configuration..."
ADMIN_ONLY=$(aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly' \
  --output text 2>/dev/null || echo "ERROR")

if [[ "$ADMIN_ONLY" == "False" ]]; then
  check "Cognito self-signup enabled (AllowAdminCreateUserOnly=false)" "pass"
else
  check "Cognito self-signup enabled (AllowAdminCreateUserOnly=false) — got: $ADMIN_ONLY" "fail"
fi

# ------------------------------------------------------------------
# Check 2: API returns 401 (unauthorized), not 500
# ------------------------------------------------------------------
echo "Checking API Gateway..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/items" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "401" ]]; then
  check "API returns 401 Unauthorized (not 500)" "pass"
elif [[ "$HTTP_CODE" == "403" ]]; then
  check "API returns 403 Forbidden (Cognito authorizer active)" "pass"
else
  check "API returns 401/403 — got HTTP $HTTP_CODE" "fail"
fi

# ------------------------------------------------------------------
# Check 3: S3 bucket exists and is private
# ------------------------------------------------------------------
echo "Checking S3 bucket..."
BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>&1 && echo "yes" || echo "no")

if [[ "$BUCKET_EXISTS" == "yes" ]]; then
  check "S3 bucket exists" "pass"
else
  check "S3 bucket exists" "fail"
fi

PUBLIC_ACCESS=$(aws s3api get-public-access-block \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --query 'PublicAccessBlockConfiguration.BlockPublicAcls' \
  --output text 2>/dev/null || echo "ERROR")

if [[ "$PUBLIC_ACCESS" == "True" ]]; then
  check "S3 bucket has Block Public Access enabled" "pass"
else
  check "S3 bucket has Block Public Access enabled — got: $PUBLIC_ACCESS" "fail"
fi

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "======================================"
TOTAL=$((PASS + FAIL))
echo "  Results: $PASS/$TOTAL checks passed"
if [[ "$FAIL" -gt 0 ]]; then
  echo "  $FAIL check(s) FAILED"
  echo "======================================"
  exit 1
else
  echo "  All checks passed"
  echo "======================================"
  exit 0
fi
