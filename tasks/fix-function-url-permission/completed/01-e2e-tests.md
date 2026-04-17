# Task 01: End-to-End Tests for Function URL Permission Fix

**Agent:** implementer
**Design:** docs/design/fix-function-url-permission.md

## Objective

Create a test file that validates the Function URL permission
fix across both SAM templates, both verify commands, and the
PITFALLS documentation. All tests should fail initially,
confirming the fix has not yet been applied.

## Test File Path

Create `cli/__tests__/function-url-permission.test.mjs`.

Use `node:test` and `node:assert/strict`. No new dependencies.
Follow the content-validation pattern established by
`cli/__tests__/template-structure.test.mjs` — read files as
strings and verify structural properties.

## Test Cases

### SAM Template — CLI (`cli/templates/backend.yaml`)

- Given the CLI SAM template, when read, then it contains an
  `ApiFunctionInvokePermission` resource
- Given the CLI SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  Type is `AWS::Lambda::Permission`
- Given the CLI SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  Action is `lambda:InvokeFunction`
- Given the CLI SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  FunctionName references `ApiFunction.Arn`
- Given the CLI SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then
  `InvokedViaFunctionUrl` is `true`
- Given the CLI SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then
  Principal is `'*'`

### SAM Template — Plugin (`plugin/templates/backend.yaml`)

- Given the plugin SAM template, when read, then it contains
  an `ApiFunctionInvokePermission` resource
- Given the plugin SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  Type is `AWS::Lambda::Permission`
- Given the plugin SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  Action is `lambda:InvokeFunction`
- Given the plugin SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then its
  FunctionName references `ApiFunction.Arn`
- Given the plugin SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then
  `InvokedViaFunctionUrl` is `true`
- Given the plugin SAM template, when the
  `ApiFunctionInvokePermission` resource is parsed, then
  Principal is `'*'`

### Template Parity

- Given both SAM templates, when the
  `ApiFunctionInvokePermission` sections are extracted, then
  they are structurally identical (same properties, same
  values)

### Verify Command — CLI (`cli/commands/verify.mjs`)

- Given the verify.mjs source, when read, then it contains
  a `lambda:InvokeFunctionUrl` permission check
- Given the verify.mjs source, when read, then it contains
  a `lambda:InvokeFunction` permission check
- Given the verify.mjs source, when read, then it calls
  `aws lambda get-policy` to retrieve the resource policy
- Given the verify.mjs source, when the valid HTTP codes
  are found, then 403 is NOT in the valid codes list
- Given the verify.mjs source, when the valid HTTP codes
  are found, then 200, 401, and 404 are all present

### Verify Script — Plugin (`plugin/scripts/verify.sh`)

- Given the verify.sh source, when read, then it contains
  a `lambda:InvokeFunctionUrl` permission check
- Given the verify.sh source, when read, then it contains
  a `lambda:InvokeFunction` permission check
- Given the verify.sh source, when read, then it calls
  `aws lambda get-policy` to retrieve the resource policy
- Given the verify.sh source, when read, then HTTP 403 is
  not accepted as a passing result (currently verify.sh has
  an explicit `elif` branch that passes on 403 — this must
  be removed; test by checking that no line matches a
  pattern like `"403".*"pass"` or `== "403"` followed by a
  pass check)

### PITFALLS.md

- Given PITFALLS.md, when read, then the index table contains
  an entry numbered 24
- Given PITFALLS.md, when read, then entry 24 mentions
  "Function URL 403" or "lambda:InvokeFunction"
- Given PITFALLS.md, when read, then it contains a detail
  section for the Function URL 403 pitfall
- Given PITFALLS.md, when read, then the detail section
  includes the manual fix command
  (`aws lambda add-permission`)

## Implementation Notes

- Read each file using `readFileSync` from `node:fs`, relative
  to the test file location using `dirname(fileURLToPath(
  import.meta.url))`.
- For template tests, use `string.includes()` and regex to
  check for resource names, types, and property values. Do
  not parse YAML — string matching is sufficient and avoids
  adding a YAML parser dependency.
- For verify.mjs tests, read the source code as a string and
  check for the presence of the permission-checking logic and
  the absence of 403 in the valid codes. Use a regex like
  `/validCodes\s*=\s*\[.*'403'.*\]/` to check the codes
  array, or match the line containing `validCodes` and verify
  its contents.
- For verify.sh tests, read the source and check for
  `get-policy`, `InvokeFunctionUrl`, and `InvokeFunction`
  strings. For the 403 check, note that verify.sh currently
  uses an explicit `elif` branch (not a `validCodes` array)
  to accept 403. Test that neither `== "403"` appears in a
  passing branch nor `"403".*"pass"` appears in the source.
- For PITFALLS.md, the path is `plugin/docs/PITFALLS.md`
  relative to the repo root.
- Group tests into `describe` blocks by file/concern:
  "CLI SAM template", "Plugin SAM template", "Template
  parity", "CLI verify command", "Plugin verify script",
  "PITFALLS.md".

## Acceptance Criteria

- Test file compiles and runs with
  `node --test cli/__tests__/function-url-permission.test.mjs`
- All tests fail with clear assertion messages indicating
  what is missing (e.g., "template should contain
  ApiFunctionInvokePermission resource")
- No test panics or produces cryptic failures

## Conflict Criteria

- If any test that should fail instead passes, first diagnose
  why by following the "Unexpected test results" steps in the
  implementer prompt: investigate the code path, verify the
  assertion targets the right behavior, and attempt to rewrite
  the test to isolate the intended path. Only escalate if you
  cannot construct a well-formed test that targets the desired
  behavior.
