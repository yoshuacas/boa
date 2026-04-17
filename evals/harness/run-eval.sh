#!/usr/bin/env bash
set -euo pipefail

# BOA Skill Evaluation Harness
# Usage: ./run-eval.sh <scenario-file>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALS_DIR="$(dirname "$SCRIPT_DIR")"
RUBRICS_DIR="$EVALS_DIR/rubrics"
PLUGIN_DIR="$(dirname "$EVALS_DIR")/plugin"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <scenario-file>"
  echo "Example: $0 scenarios/todo-app.md"
  exit 1
fi

SCENARIO_FILE="$1"
if [ ! -f "$SCENARIO_FILE" ]; then
  SCENARIO_FILE="$EVALS_DIR/$1"
fi

if [ ! -f "$SCENARIO_FILE" ]; then
  echo "Error: Scenario file not found: $1"
  exit 1
fi

SCENARIO_NAME=$(basename "$SCENARIO_FILE" .md)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
WORK_DIR="/tmp/boa-eval-${SCENARIO_NAME}-${TIMESTAMP}"

echo "========================================"
echo "  BOA Skill Evaluation"
echo "  Scenario: $SCENARIO_NAME"
echo "  Work dir: $WORK_DIR"
echo "========================================"
echo ""

# Create temporary project directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Extract the prompt from the scenario file (content under ## Prompt)
PROMPT=$(sed -n '/^## Prompt/,/^## /p' "$SCENARIO_FILE" | tail -n +2 | head -n -1 | xargs)

echo "Prompt: $PROMPT"
echo ""
echo "Running agent with BOA plugin..."
echo ""

# Run the agent with BOA plugin
# This is a placeholder — actual invocation depends on the agent CLI
# claude --plugin-dir "$PLUGIN_DIR" --print "$PROMPT" > agent-output.log 2>&1
echo "[PLACEHOLDER] Agent invocation would run here."
echo "To run manually:"
echo "  cd $WORK_DIR"
echo "  claude --plugin-dir $PLUGIN_DIR"
echo "  Then paste: $PROMPT"
echo ""

# Grade against rubrics
echo "========================================"
echo "  Rubric Results"
echo "========================================"

PASS=0
FAIL=0
SKIP=0

for rubric in "$RUBRICS_DIR"/*.md; do
  RUBRIC_NAME=$(basename "$rubric" .md)
  echo ""
  echo "--- $RUBRIC_NAME ---"

  # Check if the work directory has any generated files
  if [ -z "$(ls -A "$WORK_DIR" 2>/dev/null)" ]; then
    echo "  SKIP (no files generated — run agent first)"
    SKIP=$((SKIP + 1))
    continue
  fi

  # Basic automated checks based on rubric name
  case "$RUBRIC_NAME" in
    deployment-success)
      if [ -f "$WORK_DIR/.boa/config.json" ]; then
        STACK_NAME=$(jq -r '.stackName' "$WORK_DIR/.boa/config.json")
        STATUS=$(aws cloudformation describe-stacks \
          --stack-name "$STACK_NAME" \
          --query 'Stacks[0].StackStatus' \
          --output text 2>/dev/null || echo "NOT_FOUND")
        if [[ "$STATUS" == *"COMPLETE"* ]] && [[ "$STATUS" != *"ROLLBACK"* ]]; then
          echo "  PASS — Stack status: $STATUS"
          PASS=$((PASS + 1))
        else
          echo "  FAIL — Stack status: $STATUS"
          FAIL=$((FAIL + 1))
        fi
      else
        echo "  SKIP (no .boa/config.json found)"
        SKIP=$((SKIP + 1))
      fi
      ;;

    no-known-pitfalls)
      PITFALL_FOUND=0

      # Check for AWS_REGION in templates
      if grep -rq "AWS_REGION" "$WORK_DIR" --include="*.yaml" --include="*.yml" 2>/dev/null; then
        echo "  FAIL — Found AWS_REGION in template (should be REGION_NAME)"
        PITFALL_FOUND=1
      fi

      # Check for Python runtime
      if grep -rq "python" "$WORK_DIR" --include="*.yaml" 2>/dev/null | grep -q "Runtime"; then
        echo "  FAIL — Found Python Lambda runtime"
        PITFALL_FOUND=1
      fi

      # Check for public S3
      if grep -rq "PublicRead\|public-read" "$WORK_DIR" --include="*.yaml" 2>/dev/null; then
        echo "  FAIL — Found public S3 bucket config"
        PITFALL_FOUND=1
      fi

      if [ "$PITFALL_FOUND" -eq 0 ]; then
        echo "  PASS — No known pitfalls detected"
        PASS=$((PASS + 1))
      else
        FAIL=$((FAIL + 1))
      fi
      ;;

    *)
      echo "  SKIP (manual verification required — see rubric)"
      SKIP=$((SKIP + 1))
      ;;
  esac
done

echo ""
echo "========================================"
echo "  Summary: $PASS passed, $FAIL failed, $SKIP skipped"
echo "========================================"
echo "  Work directory: $WORK_DIR"
echo "========================================"
