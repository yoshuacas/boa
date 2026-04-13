#!/usr/bin/env bash
set -euo pipefail

# BOA End-to-End Test Runner
#
# Creates a fresh project directory (like a real user would), deploys the
# soccer league app with custom functions, runs tests, tears down.
#
# Usage:
#   ./e2e-test.sh                    # Full cycle: deploy → test → teardown
#   ./e2e-test.sh --test-only        # Tests only (assumes already deployed)
#   ./e2e-test.sh --no-teardown      # Deploy + test, keep stack for debugging
#   ./e2e-test.sh --teardown-only    # Just teardown

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../../plugin" && pwd)"
STACK_NAME="boa-e2e-test"
REGION="us-east-1"
WORK_DIR="/tmp/$STACK_NAME"
WEBHOOK_TEST_SECRET="whsec_e2e_test_$(openssl rand -hex 16)"

TEST_ONLY=false
NO_TEARDOWN=false
TEARDOWN_ONLY=false

for arg in "$@"; do
  case $arg in
    --test-only) TEST_ONLY=true ;;
    --no-teardown) NO_TEARDOWN=true ;;
    --teardown-only) TEARDOWN_ONLY=true ;;
  esac
done

log() { echo ""; echo "════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════"; }
step() { echo "  → $1"; }

do_teardown() {
  log "TEARDOWN"
  cd "$WORK_DIR" 2>/dev/null || true

  step "Deleting SSM test parameters..."
  for key in stripe-secret-key stripe-webhook-secret service-role-key; do
    aws ssm delete-parameter --name "/$STACK_NAME/$key" --region "$REGION" 2>/dev/null || true
  done

  step "Deleting stack..."
  boa teardown 2>&1 || true
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || true
  step "Waiting for delete..."
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION" 2>/dev/null || true

  step "Teardown complete."
}

if [ "$TEARDOWN_ONLY" = true ]; then
  do_teardown
  exit 0
fi

# ══════════════════════════════════════
#  DEPLOY — Fresh project directory
# ══════════════════════════════════════

if [ "$TEST_ONLY" = false ]; then
  log "CREATE PROJECT"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"
  cd "$WORK_DIR"

  step "Copying fixtures into fresh project..."
  cp -r "$FIXTURES_DIR/migrations" .
  cp -r "$FIXTURES_DIR/policies" .
  cp -r "$FIXTURES_DIR/functions" .
  cp "$FIXTURES_DIR/template.yaml" template.yaml

  step "Linking plugin lambda-templates (SAM CodeUri resolution)..."
  ln -sf "$PLUGIN_DIR/lambda-templates" lambda-templates

  step "Installing function dependencies..."
  for func_dir in functions/*/; do
    if [ -f "$func_dir/package.json" ]; then
      (cd "$func_dir" && npm install --silent 2>/dev/null) || true
    fi
  done

  log "STORE SECRETS"
  step "Storing test secrets in SSM..."
  # Use String type (not SecureString) — CloudFormation resolve:ssm: doesn't support SecureString in Lambda env vars
  aws ssm put-parameter --name "/$STACK_NAME/stripe-secret-key" \
    --value "sk_test_fake" --type String --region "$REGION" --overwrite 2>/dev/null || true
  aws ssm put-parameter --name "/$STACK_NAME/stripe-webhook-secret" \
    --value "$WEBHOOK_TEST_SECRET" --type String --region "$REGION" --overwrite 2>/dev/null || true
  # Placeholder — real key is stored after boa init generates it
  aws ssm put-parameter --name "/$STACK_NAME/service-role-key" \
    --value "placeholder" --type String --region "$REGION" --overwrite 2>/dev/null || true

  log "BOOTSTRAP"
  step "Deploying base infrastructure..."
  export BOA_TEMPLATE_OVERRIDE="$WORK_DIR/template.yaml"
  boa init --region "$REGION"

  # Store service role key in SSM so functions can use it
  SERVICE_ROLE_KEY=$(jq -r '.serviceRoleKey' .boa/config.json)
  aws ssm put-parameter --name "/$STACK_NAME/service-role-key" \
    --value "$SERVICE_ROLE_KEY" --type String --region "$REGION" --overwrite 2>/dev/null || true

  log "DEPLOY APP"
  step "Deploying tables, policies, and functions..."
  boa deploy

  log "MIGRATE"
  step "Creating tables..."
  boa migrate

  log "SEED"
  step "Installing test harness dependencies..."
  (cd "$SCRIPT_DIR" && npm install --silent 2>/dev/null)

  step "Seeding test data..."
  node "$SCRIPT_DIR/seed.mjs" --project-dir "$WORK_DIR"

  # Save webhook secret for test-only reruns
  echo "$WEBHOOK_TEST_SECRET" > "$WORK_DIR/.boa/webhook-test-secret"

  log "DEPLOY COMPLETE"
  step "API URL: $(jq -r '.apiUrl' .boa/config.json)"
  step "Stack: $STACK_NAME"
  step "Work dir: $WORK_DIR"

else
  # ── Test-only mode: use existing deployment ──
  if [ ! -d "$WORK_DIR/.boa" ]; then
    echo "ERROR: No deployment found at $WORK_DIR"
    echo "Run without --test-only first."
    exit 1
  fi
  cd "$WORK_DIR"
  step "Using existing deployment at $WORK_DIR"

  if [ -f "$WORK_DIR/.boa/webhook-test-secret" ]; then
    WEBHOOK_TEST_SECRET=$(cat "$WORK_DIR/.boa/webhook-test-secret")
  fi
fi

# ══════════════════════════════════════
#  TEST
# ══════════════════════════════════════

log "RUNNING TESTS"

export BOA_PROJECT_DIR="$WORK_DIR"
export STRIPE_WEBHOOK_SECRET="$WEBHOOK_TEST_SECRET"

node --test "$SCRIPT_DIR/tests/functions.test.mjs" 2>&1
TEST_EXIT=$?

# ══════════════════════════════════════
#  RESULT
# ══════════════════════════════════════

if [ $TEST_EXIT -eq 0 ]; then
  log "ALL TESTS PASSED"
else
  log "SOME TESTS FAILED (exit $TEST_EXIT)"
fi

# ══════════════════════════════════════
#  TEARDOWN
# ══════════════════════════════════════

if [ "$NO_TEARDOWN" = false ] && [ "$TEST_ONLY" = false ]; then
  do_teardown
else
  echo ""
  echo "Stack left running: $STACK_NAME"
  echo "Work dir: $WORK_DIR"
  echo "Rerun tests: $0 --test-only"
  echo "Teardown: $0 --teardown-only"
fi

exit $TEST_EXIT
