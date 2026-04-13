# Task 02: Add Function URL Permission to SAM Templates

**Agent:** implementer
**Design:** docs/design/fix-function-url-permission.md

## Objective

Add an explicit `AWS::Lambda::Permission` resource named
`ApiFunctionInvokePermission` to both SAM templates so that
Lambda Function URLs work regardless of SAM version.

## Target Tests

From `cli/__tests__/function-url-permission.test.mjs`:

- CLI SAM template contains `ApiFunctionInvokePermission`
  resource
- CLI SAM template permission Type is
  `AWS::Lambda::Permission`
- CLI SAM template permission Action is
  `lambda:InvokeFunction`
- CLI SAM template permission FunctionName references
  `ApiFunction.Arn`
- CLI SAM template permission has
  `InvokedViaFunctionUrl: true`
- CLI SAM template permission Principal is `'*'`
- Plugin SAM template contains
  `ApiFunctionInvokePermission` resource
- Plugin SAM template permission Type is
  `AWS::Lambda::Permission`
- Plugin SAM template permission Action is
  `lambda:InvokeFunction`
- Plugin SAM template permission FunctionName references
  `ApiFunction.Arn`
- Plugin SAM template permission has
  `InvokedViaFunctionUrl: true`
- Plugin SAM template permission Principal is `'*'`
- Both templates are structurally identical for this
  resource

## Implementation

Add the following resource to both
`plugin/templates/backend.yaml` and
`cli/templates/backend.yaml`. Insert it immediately after
the `ApiFunction` resource (after its `Policies` block),
before the Storage section comment:

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

**Important details:**

- Use `InvokedViaFunctionUrl: true`, NOT
  `FunctionUrlAuthType: NONE`. These are different
  CloudFormation properties mapping to different IAM
  condition keys. `InvokedViaFunctionUrl` is the correct
  one for the `lambda:InvokeFunction` action.
- The indentation must be 2-space, matching the rest of
  the template (resource names at column 2, properties
  at column 4, etc.).
- Both templates must be identical for this resource
  block. The only difference between the two templates
  is `CodeUri` on `ApiFunction` — this new resource is
  the same in both.

## Acceptance Criteria

- All "CLI SAM template" and "Plugin SAM template" tests
  pass
- The "Template parity" test passes
- Existing template-structure tests still pass:
  `node --test cli/__tests__/template-structure.test.mjs`
- No other template content is changed

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the template already contains an
  `ApiFunctionInvokePermission` resource, escalate — the
  design assumes it does not exist yet.
