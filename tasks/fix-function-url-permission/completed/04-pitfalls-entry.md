# Task 04: Add PITFALLS.md Entry for Function URL 403

**Agent:** implementer
**Design:** docs/design/fix-function-url-permission.md

## Objective

Add pitfall entry #24 to `plugin/docs/PITFALLS.md` documenting
the Function URL 403 Forbidden issue caused by a missing
`lambda:InvokeFunction` permission.

## Target Tests

From `cli/__tests__/function-url-permission.test.mjs`:

- PITFALLS.md index table contains entry numbered 24
- Entry 24 mentions "Function URL 403" or
  "lambda:InvokeFunction"
- PITFALLS.md contains a detail section for the Function
  URL 403 pitfall
- The detail section includes the manual fix command
  (`aws lambda add-permission`)

## Implementation

### Index Table Entry

Add a new row numbered 24 in the **Deployment** section of
the index table, after row 15 (the last current Deployment
entry) and before the **Functions** section header row:

```markdown
| 24 | Function URL 403 Forbidden (missing `lambda:InvokeFunction` permission) | CRITICAL | See below |
```

The number 24 continues from the last entry in the table
(23 in Corporate Accounts). Place the row in the
Deployment section because the root cause is a deployment
template issue, even though the number is non-sequential
within that section.

### Detail Section

Add the following at the end of the file, after the
"Corporate AWS Accounts — Self-Sign-Up" section:

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

**Note:** The detail section uses a fenced code block for
the manual fix command. Ensure the outer markdown fence
and inner bash fence are correctly nested (the outer
section ends with triple backticks after the bash block).

## Acceptance Criteria

- All "PITFALLS.md" tests pass
- The index table renders correctly (no broken columns)
- The detail section is consistent with the design
  document's specification
- The manual fix command is syntactically valid
- Existing PITFALLS content is unchanged

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If PITFALLS.md already contains an entry for Function URL
  403 or `lambda:InvokeFunction`, escalate — the design
  assumes it does not exist yet.
