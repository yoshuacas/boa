# Fix Lambda Function URL 403 Forbidden

## Overview

Since October 2025, AWS requires two resource-based policy
statements for public Lambda Function URLs (AuthType NONE):
`lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`. SAM
v1.101.0+ (released October 10, 2025) auto-generates both,
but older SAM versions only generate the first. BOA users on
older SAM versions get a 403 Forbidden on every API request.

The fix adds an explicit `AWS::Lambda::Permission` to both
SAM templates as a safety net (works regardless of SAM
version), a permission check to `boa verify` that catches
the problem before users hit it, and a PITFALLS.md entry so
agents know the pattern.

GitHub issue: #1

## Current CX / Concepts

### What Works (Existing Deployments)

Function URLs created before October 2025 continue to work
with only the `lambda:InvokeFunctionUrl` permission. Existing
BOA backends deployed before this date are unaffected.

### What Breaks (New Deployments)

Any `boa init` or `boa deploy` that creates a new Function
URL after October 2025 results in a 403 Forbidden on every
request to the API. The Lambda function is never invoked.

The symptom is immediate and total: `curl` to the Function
URL returns `{"Message":"Forbidden"}` with HTTP 403. No
Lambda logs are generated because the request is rejected at
the Function URL layer before reaching the handler.

### Root Cause

SAM v1.101.0+ auto-generates both required permissions.
Older SAM versions (pre-1.101.0) only generate one. When
SAM processes `FunctionUrlConfig` with `AuthType: NONE`,
older versions auto-generate only this statement:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "lambda:InvokeFunctionUrl",
  "Condition": {
    "StringEquals": {
      "lambda:FunctionUrlAuthType": "NONE"
    }
  }
}
```

Since October 2025, AWS also requires a second statement:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "lambda:InvokeFunction",
  "Condition": {
    "Bool": {
      "lambda:InvokedViaFunctionUrl": "true"
    }
  }
}
```

Without both statements, the Function URL returns 403.

### Current `boa verify` Behavior

The verify command (both `cli/commands/verify.mjs` and
`plugin/scripts/verify.sh`) checks:

1. Cognito self-signup enabled
2. API endpoint responding (HTTP 200/401/403/404)
3. S3 bucket exists
4. S3 bucket has Block Public Access

Check 2 accepts HTTP 403 as a passing result, which masks
this exact failure. A broken Function URL passes verification
because 403 is in the "valid codes" list.

### Current PITFALLS.md

PITFALLS.md has 23 entries covering auth, database,
deployment, functions, frontend, storage, and corporate
account issues. There is no entry for Function URL
permissions.

## Proposed CX / CX Specification

### SAM Template Fix

Add an `AWS::Lambda::Permission` resource named
`ApiFunctionInvokePermission` to both SAM templates. The
resource grants `lambda:InvokeFunction` with the
`InvokedViaFunctionUrl` condition so the permission only
applies to Function URL invocations, not direct SDK calls.

The resource is placed immediately after the `ApiFunction`
definition in both templates:

```yaml
  # -------------------------------------------------------
  # Function URL permission — required since October 2025
  # SAM v1.101.0+ auto-generates this, but older versions
  # do not. Explicit declaration is a safe no-op on new
  # SAM and a fix on old SAM.
  # -------------------------------------------------------
  ApiFunctionInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !GetAtt ApiFunction.Arn
      Action: lambda:InvokeFunction
      Principal: '*'
      InvokedViaFunctionUrl: true
```

**Why `InvokedViaFunctionUrl: true`:** The
`lambda:InvokeFunction` action requires the
`lambda:InvokedViaFunctionUrl` condition key — not
`lambda:FunctionUrlAuthType` (which only applies to the
`lambda:InvokeFunctionUrl` action). CloudFormation's
`AWS::Lambda::Permission` resource exposes these as
separate top-level properties:

- `FunctionUrlAuthType` maps to
  `lambda:FunctionUrlAuthType` — use with
  `lambda:InvokeFunctionUrl`
- `InvokedViaFunctionUrl` maps to
  `lambda:InvokedViaFunctionUrl` — use with
  `lambda:InvokeFunction`

This matches the pattern SAM v1.101.0 uses in its
auto-generated permissions.

**Idempotency:** CloudFormation manages the permission as a
stack resource. Redeploying an existing stack adds the
permission without affecting the existing
`lambda:InvokeFunctionUrl` statement. On SAM v1.101.0+
where the permission is already auto-generated, the
explicit resource creates a second identical policy
statement — harmless (AWS deduplicates Allow statements).

**Existing deployments:** Adding this resource to a
redeployed stack is safe. The permission is purely additive.
Existing Function URLs that already work will continue to
work. Function URLs created after October 2025 that are
broken will be fixed on the next `boa deploy`.

### Updated `boa verify` Check

Replace the current "API endpoint responding" check with two
separate checks:

**Check 2a: Function URL permission policy**

Query the Lambda function's resource-based policy using
`aws lambda get-policy` and verify both required actions
are present.

```
Checking Function URL permissions...
  [PASS] Function URL has lambda:InvokeFunctionUrl permission
  [PASS] Function URL has lambda:InvokeFunction permission
```

If the `lambda:InvokeFunction` permission is missing:

```
Checking Function URL permissions...
  [PASS] Function URL has lambda:InvokeFunctionUrl permission
  [FAIL] Function URL has lambda:InvokeFunction permission
         Missing since October 2025 — run 'boa deploy' to fix
```

The function name is derived from the stack name:
`${stackName}-api` (matching the SAM template's
`FunctionName: !Sub '${ProjectName}-api'`).

**Check 2b: API endpoint responding**

Keep the existing HTTP check but remove 403 from the
valid response codes. After the permission fix, a 403
indicates a real problem that should not pass silently.

Valid codes become: `200`, `401`, `404`.

```
Checking API endpoint...
  [PASS] API is responding (HTTP 200)
```

If 403:

```
Checking API endpoint...
  [FAIL] API returns unexpected HTTP 403 (expected 200/401/404)
```

**Total check count:** Increases from 4 to 6 (two new
permission checks, existing HTTP check retained).

### Updated `boa verify` (plugin script)

Apply the same two changes to `plugin/scripts/verify.sh`:
add the permission policy check and remove 403 from valid
HTTP codes.

### PITFALLS.md Entry

Add a new entry in the Deployment section:

```markdown
| 24 | Function URL 403 Forbidden (missing `lambda:InvokeFunction` permission) | CRITICAL | See below |
```

With a detail section:

```markdown
## Function URL 403 — Missing Permission (October 2025)

Since October 2025, AWS requires two resource-based policy
statements for public Lambda Function URLs:

1. `lambda:InvokeFunctionUrl` — all SAM versions generate
2. `lambda:InvokeFunction` — SAM v1.101.0+ generates this;
   older versions require an explicit `AWS::Lambda::Permission`

Without both, the Function URL returns 403 Forbidden on
every request. No Lambda logs are generated because the
request never reaches the handler.

**Symptoms:** Every API request returns
`{"Message":"Forbidden"}` with HTTP 403. No CloudWatch
logs for the Lambda function. `boa verify` fails the
Function URL permission check.

**Fix for new deployments:** Already handled — the BOA
SAM template includes both permissions.

**Fix for existing deployments created before this was
fixed:** Run `boa deploy` to redeploy the stack with the
updated template. The new permission is added
automatically.

**Manual fix (without redeploying):**
```bash
aws lambda add-permission \
  --function-name <project-name>-api \
  --statement-id FunctionURLInvokePermission \
  --action lambda:InvokeFunction \
  --principal "*" \
  --invoked-via-function-url
```
```

## Technical Design

### SAM Template Changes

Both `plugin/templates/backend.yaml` and
`cli/templates/backend.yaml` get the same new resource.
Insert after the `ApiFunction` resource (after the
`Policies` block, before the Storage section):

```yaml
  ApiFunctionInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !GetAtt ApiFunction.Arn
      Action: lambda:InvokeFunction
      Principal: '*'
      InvokedViaFunctionUrl: true
```

This is 6 lines of YAML. No other template changes are
needed.

### Verify Command Changes (`cli/commands/verify.mjs`)

Add a new check between the Cognito check and the API
endpoint check. The check uses `aws lambda get-policy` to
retrieve the resource-based policy and parses the JSON to
verify both actions are present.

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

Update the API endpoint check to remove 403 from valid
codes:

```javascript
const validCodes = ['200', '401', '404'];
```

### Verify Script Changes (`plugin/scripts/verify.sh`)

Add the equivalent bash check using `aws lambda get-policy`
and `jq` to parse the policy JSON. Update the valid HTTP
codes to remove 403.

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

### PITFALLS.md Changes

Add row 24 to the index table in the Deployment section.
Add the detail section at the end of the file.

## Code Architecture / File Changes

### Modified Files

| File | Change |
|------|--------|
| `plugin/templates/backend.yaml` | Add `ApiFunctionInvokePermission` resource after `ApiFunction` |
| `cli/templates/backend.yaml` | Add `ApiFunctionInvokePermission` resource after `ApiFunction` |
| `cli/commands/verify.mjs` | Add Function URL permission check, remove 403 from valid HTTP codes |
| `plugin/scripts/verify.sh` | Add Function URL permission check, remove 403 from valid HTTP codes |
| `plugin/docs/PITFALLS.md` | Add entry #24 for Function URL 403 |

### No New Files

All changes are modifications to existing files.

## Testing Strategy

### Manual Verification

1. **New deployment:** Run `boa init test-403 --region
   us-east-1`. After deploy completes, verify:
   - `aws lambda get-policy --function-name test-403-api`
     returns a policy with both `lambda:InvokeFunctionUrl`
     and `lambda:InvokeFunction` statements.
   - `curl <function-url>/rest/v1/` returns HTTP 200 or
     401 (not 403).
   - `boa verify` passes all 6 checks.

2. **Existing deployment (before fix):** If an existing
   stack was deployed before the template fix, run
   `boa verify` and confirm the
   `lambda:InvokeFunction` check fails with the guidance
   message. Then run `boa deploy` and confirm the check
   passes afterward.

3. **Verify script parity:** Run
   `plugin/scripts/verify.sh` against the same stack and
   confirm identical pass/fail results as `boa verify`.

4. **PITFALLS.md review:** Confirm the new entry renders
   correctly in the table and the detail section is
   consistent with the fix.

### Edge Cases

- **Stack with no function policy at all:** The
  `aws lambda get-policy` call returns an error (no
  policy). Verify that `boa verify` handles this
  gracefully and reports a clear failure.

- **Function URL with IAM auth:** Not applicable to BOA
  (always uses NONE), but the permission check should
  not break if `FunctionUrlAuthType` is `AWS_IAM`.

- **Manual permission already added:** If someone already
  ran `aws lambda add-permission` manually, the
  CloudFormation deploy should not conflict because
  CloudFormation manages its own permission resource
  independently.

## Implementation Order

1. Add `ApiFunctionInvokePermission` to
   `plugin/templates/backend.yaml`.
2. Add `ApiFunctionInvokePermission` to
   `cli/templates/backend.yaml`.
3. Add Function URL permission check to
   `cli/commands/verify.mjs` and remove 403 from valid
   HTTP codes.
4. Add Function URL permission check to
   `plugin/scripts/verify.sh` and remove 403 from valid
   HTTP codes.
5. Add entry #24 to `plugin/docs/PITFALLS.md`.
6. Deploy a test stack and run the manual verification
   plan.

## Open Questions

1. **Minimum SAM version enforcement.** SAM v1.101.0+
   auto-generates both permissions, making the explicit
   `ApiFunctionInvokePermission` resource redundant (but
   harmless) on current SAM. Should `boa check` enforce a
   minimum SAM version >= 1.101.0 instead of (or in
   addition to) the explicit permission? The explicit
   permission is the safer approach because it works
   regardless of SAM version and requires no user action,
   but it creates a duplicate policy statement on modern
   SAM. This is cosmetically messy but functionally
   harmless.
