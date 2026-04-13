# Task 03: Add Permission Check to Verify Commands

**Agent:** implementer
**Design:** docs/design/fix-function-url-permission.md
**Depends on:** Task 02

## Objective

Add a Function URL permission policy check to both
`cli/commands/verify.mjs` and `plugin/scripts/verify.sh`,
and remove HTTP 403 from the valid response codes in both
files.

## Target Tests

From `cli/__tests__/function-url-permission.test.mjs`:

- verify.mjs contains `lambda:InvokeFunctionUrl` permission
  check
- verify.mjs contains `lambda:InvokeFunction` permission
  check
- verify.mjs calls `aws lambda get-policy`
- verify.mjs valid HTTP codes do NOT include 403
- verify.mjs valid HTTP codes include 200, 401, 404
- verify.sh contains `lambda:InvokeFunctionUrl` permission
  check
- verify.sh contains `lambda:InvokeFunction` permission
  check
- verify.sh calls `aws lambda get-policy`
- verify.sh does not accept HTTP 403 as passing

## Implementation

### `cli/commands/verify.mjs`

**Change 1: Add permission check (new Check 2)**

Insert between the existing Check 1 (Cognito) and Check 2
(API endpoint). The new check queries
`aws lambda get-policy` for the function's resource-based
policy and verifies both required actions.

The function name is derived from the stack name:
`${stackName}-api` (matching the SAM template's
`FunctionName: !Sub '${ProjectName}-api'`).

```javascript
// Check 2: Function URL permissions
console.log('Checking Function URL permissions...');
const functionName = `${stackName}-api`;
let policy;
try {
  const policyJson = aws.exec(
    `aws lambda get-policy` +
      ` --function-name ${functionName}` +
      ` --region ${region}` +
      ` --query 'Policy' --output text`
  );
  policy = JSON.parse(policyJson);
} catch {
  policy = null;
}

if (policy) {
  const statements = policy.Statement || [];
  const hasInvokeFunctionUrl = statements.some(
    (s) => s.Effect === 'Allow'
      && s.Action === 'lambda:InvokeFunctionUrl'
  );
  const hasInvokeFunction = statements.some(
    (s) => s.Effect === 'Allow'
      && s.Action === 'lambda:InvokeFunction'
  );
  check(
    hasInvokeFunctionUrl,
    'Function URL has lambda:InvokeFunctionUrl permission'
  );
  if (hasInvokeFunction) {
    check(
      true,
      'Function URL has lambda:InvokeFunction permission'
    );
  } else {
    check(
      false,
      'Function URL has lambda:InvokeFunction permission'
        + " — missing since October 2025, run 'boa deploy'"
        + ' to fix'
    );
  }
} else {
  check(
    false,
    'Function URL resource policy exists'
  );
}
```

**Change 2: Remove 403 from valid HTTP codes**

Change the existing `validCodes` array from:

```javascript
const validCodes = ['200', '401', '403', '404'];
```

to:

```javascript
const validCodes = ['200', '401', '404'];
```

Also update the error message to match:

```javascript
check(false, `API returns unexpected HTTP ${httpCode} (expected 200/401/404)`);
```

### `plugin/scripts/verify.sh`

**Change 1: Add permission check (new Check 2)**

Insert between the existing Check 1 (Cognito) and Check 2
(API endpoint). Uses `aws lambda get-policy` and `jq` to
parse the JSON policy.

```bash
# Check 2: Function URL permissions
echo "Checking Function URL permissions..."
FUNCTION_NAME="${STACK_NAME}-api"
POLICY=$(aws lambda get-policy \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Policy' --output text 2>/dev/null || echo "")

if [[ -n "$POLICY" ]]; then
  HAS_INVOKE_URL=$(echo "$POLICY" | jq -r \
    '[.Statement[] | select(.Effect=="Allow" and .Action=="lambda:InvokeFunctionUrl")] | length')
  HAS_INVOKE_FN=$(echo "$POLICY" | jq -r \
    '[.Statement[] | select(.Effect=="Allow" and .Action=="lambda:InvokeFunction")] | length')

  if [[ "$HAS_INVOKE_URL" -gt 0 ]]; then
    check "Function URL has lambda:InvokeFunctionUrl permission" "pass"
  else
    check "Function URL has lambda:InvokeFunctionUrl permission" "fail"
  fi

  if [[ "$HAS_INVOKE_FN" -gt 0 ]]; then
    check "Function URL has lambda:InvokeFunction permission" "pass"
  else
    check "Function URL has lambda:InvokeFunction permission — missing since Oct 2025, redeploy to fix" "fail"
  fi
else
  check "Function URL resource policy exists" "fail"
fi
```

**Change 2: Remove 403 as a passing result**

The current verify.sh (lines 68-76) accepts both 401 and
403 as passing. Update so only 401 passes and 403 is treated
as a failure:

```bash
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "401" || "$HTTP_CODE" == "404" ]]; then
  check "API is responding (HTTP $HTTP_CODE)" "pass"
else
  check "API returns unexpected HTTP $HTTP_CODE (expected 200/401/404)" "fail"
fi
```

Also update the `echo` label from "Checking API Gateway..."
to "Checking API endpoint..." for consistency with
verify.mjs.

### Check Count

After these changes, both verify commands run 6 checks:
1. Cognito self-signup
2. Function URL has `lambda:InvokeFunctionUrl` permission
3. Function URL has `lambda:InvokeFunction` permission
4. API endpoint responding
5. S3 bucket exists
6. S3 bucket private

## Acceptance Criteria

- All "CLI verify command" tests pass
- All "Plugin verify script" tests pass
- Existing tests still pass
- Both verify commands have consistent check logic and
  output formatting

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If verify.mjs already contains a `get-policy` call,
  escalate — the design assumes it does not exist yet.
