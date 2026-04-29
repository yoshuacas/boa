#!/usr/bin/env bash
# Overnight driver for security-review remediations.
# Runs each fix on its own branch through the full rring loop.
# Logs everything to reports/security-fixes-logs/<fix-id>/.
#
# Never stops on error — each fix is independent.

set +e
set -u

RRING="/Users/davcasd/.cargo/bin/rring"
BOA="/Users/davcasd/research/boa"
PGR="/Users/davcasd/research/pgrest-lambda"
LOGS="$BOA/reports/security-fixes-logs"
STATUS="$BOA/reports/security-fixes-status.md"

mkdir -p "$LOGS"

# Seed status file
cat > "$STATUS" <<EOF
# Security Fixes — Overnight Run Status

Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

| Fix | Repo | Branch | Status | Log |
|-----|------|--------|--------|-----|
EOF

log_status() {
  local fix="$1" repo="$2" branch="$3" status="$4" log="$5"
  echo "| $fix | $repo | $branch | $status | $log |" >> "$STATUS"
}

# Run one fix: args = fix_id, slug, repo_path, mode (full|design)
run_fix() {
  local fix_id="$1"
  local slug="$2"
  local repo="$3"
  local mode="${4:-full}"

  local branch="sec/${fix_id}-${slug}"
  local feature="${fix_id}-${slug}"
  # rring wants lowercase alnum + hyphens; normalise the feature name
  feature=$(echo "$feature" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')

  local logdir="$LOGS/$fix_id"
  mkdir -p "$logdir"

  local prompt_file="$BOA/reports/prompts/${fix_id}.prompt.md"

  echo "===== $fix_id in $repo (mode=$mode) =====" | tee -a "$logdir/driver.log"

  if [ ! -f "$prompt_file" ]; then
    echo "MISSING PROMPT FILE: $prompt_file" | tee -a "$logdir/driver.log"
    log_status "$fix_id" "$(basename "$repo")" "$branch" "skipped-no-prompt" "$logdir/"
    return
  fi

  cd "$repo" || {
    log_status "$fix_id" "$(basename "$repo")" "$branch" "skipped-repo-missing" "$logdir/"
    return
  }

  # Stash any dirty state so we can get cleanly to main
  git stash push -u -m "sec-driver-$fix_id" >>"$logdir/driver.log" 2>&1 || true

  # Start clean on main
  git checkout main 2>>"$logdir/driver.log" || true

  # Create or checkout the feature branch
  git checkout -b "$branch" 2>>"$logdir/driver.log" || git checkout "$branch" 2>>"$logdir/driver.log"

  # Seed the rring prompt
  local prompt_content
  prompt_content=$(cat "$prompt_file")
  "$RRING" start "$feature" "$prompt_content" >>"$logdir/start.log" 2>&1

  # Design phase
  "$RRING" design "$feature" >>"$logdir/design.log" 2>&1
  local design_rc=$?
  echo "design exit: $design_rc" >>"$logdir/driver.log"

  if [ "$mode" = "design" ]; then
    git add -A && git commit -m "design: $fix_id $slug" >>"$logdir/driver.log" 2>&1 || true
    log_status "$fix_id" "$(basename "$repo")" "$branch" "design-only ✅" "$logdir/"
    return
  fi

  # Task phase
  "$RRING" task "$feature" >>"$logdir/task.log" 2>&1

  # Work phase (implementer loop, up to 10 iterations by default)
  "$RRING" work "$feature" >>"$logdir/work.log" 2>&1

  # Review phase
  "$RRING" review "$feature" >>"$logdir/review1.log" 2>&1

  # Second pass if reviewer flagged critical/high
  if grep -qiE "(critical|high)" "$logdir/review1.log"; then
    echo "review1 flagged critical/high — iterating" >>"$logdir/driver.log"
    "$RRING" iter "$feature" "Address the critical and high issues in the latest review." >>"$logdir/iter.log" 2>&1 || true
    "$RRING" work "$feature" >>"$logdir/work2.log" 2>&1
    "$RRING" review "$feature" >>"$logdir/review2.log" 2>&1
  fi

  # Finalize
  "$RRING" finalize "$feature" >>"$logdir/finalize.log" 2>&1
  local final_rc=$?

  if [ $final_rc -eq 0 ]; then
    log_status "$fix_id" "$(basename "$repo")" "$branch" "completed ✅" "$logdir/"
  else
    log_status "$fix_id" "$(basename "$repo")" "$branch" "finalize-failed ⚠️" "$logdir/"
  fi

  # Return to main, ready for next fix
  git checkout main 2>>"$logdir/driver.log" || true
}

# ------------------------------------------------------------
# Execution order (from security-review-2026-04-28-fixes.md)
# ------------------------------------------------------------

run_fix B-1  "docs-tls-verify-consistency"    "$BOA" full
run_fix M-16 "cognito-idtoken-trust-comment"  "$PGR" full
run_fix M-14 "router-ident-regex"             "$PGR" full
run_fix M-7  "sql-builder-quote-ident"        "$PGR" full
run_fix H-6  "refresh-endpoint-auth"          "$PGR" full
run_fix L-19 "body-size-limit"                "$PGR" full
run_fix L-20 "generic-error-response"         "$PGR" full
run_fix L-17 "cognito-global-signout"         "$PGR" full
run_fix M-12 "db-non-admin-role"              "$BOA" design
run_fix H-5  "rotate-api-keys"                "$BOA" full
run_fix L-21 "init-warning-service-key"       "$BOA" full
run_fix M-10 "service-role-warnings"          "$BOA" full
run_fix M-13 "sanitize-upload-filename"       "$BOA" full
run_fix M-8  "s3-cors-allowlist"              "$BOA" full
run_fix M-9  "api-cors-allowlist"             "$BOA" full
run_fix L-22 "cognito-legacy-gate"            "$BOA" full
run_fix H-1  "alb-https-listener"             "$BOA" full

echo "" >> "$STATUS"
echo "Completed: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$STATUS"
