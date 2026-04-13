#!/usr/bin/env bash
set -uo pipefail

# BOA — Check required tools and AWS credentials
# Outputs a clean checklist for each dependency.

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *)      PLATFORM="$OS" ;;
esac

echo "Platform: $PLATFORM"
echo ""

EXIT_CODE=0
MISSING=()

check_tool() {
  local name="$1"
  local cmd="$2"
  local min_label="${3:-}"

  if version=$($cmd 2>&1); then
    # Extract just the version number (first match of X.Y or X.Y.Z)
    short=$(echo "$version" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
    printf "  %-10s %s\n" "$name" "${short:-installed}"
  else
    printf "  %-10s %s\n" "$name" "MISSING"
    MISSING+=("$name")
    EXIT_CODE=1
  fi
}

echo "Tools:"
check_tool "aws"   "aws --version"
check_tool "sam"   "sam --version"
check_tool "node"  "node --version"
check_tool "psql"  "psql --version"
check_tool "jq"    "jq --version"

echo ""

# Check AWS credentials
echo "AWS credentials:"
if identity=$(aws sts get-caller-identity 2>&1); then
  account=$(echo "$identity" | jq -r '.Account // "unknown"' 2>/dev/null || echo "unknown")
  printf "  %-10s %s\n" "account" "$account"
else
  printf "  %-10s %s\n" "status" "NOT CONFIGURED"
  EXIT_CODE=1
fi

# Check region
echo ""
echo "Region:"
region=$(aws configure get region 2>/dev/null || echo "")
if [[ -n "$region" ]]; then
  printf "  %-10s %s\n" "default" "$region"
  if [[ "$region" != "us-east-1" && "$region" != "us-east-2" ]]; then
    echo "  note       Aurora DSQL requires us-east-1 or us-east-2"
  fi
else
  printf "  %-10s %s\n" "default" "not set (will need --region flag)"
fi

# Summary
echo ""
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Missing: ${MISSING[*]}"
  if [[ "$PLATFORM" == "macOS" ]]; then
    echo "Install:  brew install awscli aws-sam-cli node jq libpq && brew link --force libpq"
  else
    echo "See SKILL.md for Linux install commands."
  fi
fi

exit $EXIT_CODE
