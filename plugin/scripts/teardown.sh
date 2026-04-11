#!/usr/bin/env bash
set -euo pipefail

# BOA — Clean removal of the entire stack
# Empties S3, deletes CloudFormation stack, removes .boa/ directory.

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

echo "======================================"
echo "  BOA Teardown"
echo "======================================"
echo ""
echo "  Stack:   $STACK_NAME"
echo "  Region:  $REGION"
echo "  Bucket:  $BUCKET_NAME"
echo ""
echo "This will permanently delete:"
echo "  - All objects in the S3 bucket"
echo "  - The CloudFormation stack and all its resources"
echo "  - The local .boa/ configuration directory"
echo ""

# ------------------------------------------------------------------
# Confirmation
# ------------------------------------------------------------------
read -r -p "Are you sure you want to proceed? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY][eE][sS]|[yY])
    echo ""
    ;;
  *)
    echo "Teardown cancelled."
    exit 0
    ;;
esac

# ------------------------------------------------------------------
# Empty S3 bucket
# ------------------------------------------------------------------
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
# Remove local config
# ------------------------------------------------------------------
echo ""
echo "Removing $BOA_DIR..."
rm -rf "$BOA_DIR"
echo "  [OK] Local configuration removed"

echo ""
echo "======================================"
echo "  Teardown complete"
echo "======================================"
