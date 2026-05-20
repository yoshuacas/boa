# Task 04: Nested-Stack Template Generation

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Add `generateSchedulesTemplate()` to
`cli/lib/functions/schedule.mjs` that produces a
CloudFormation YAML template with one
`AWS::Scheduler::Schedule` resource per scheduled function.

## Target Tests

From `cli/__tests__/functions-schedule.test.mjs`:

- All "Template generation" tests (single function,
  multiple sorted, empty returns null, logical ID
  conversion, correct properties, Target.Input payload)

## Implementation

Add to `cli/lib/functions/schedule.mjs`:

```javascript
export function generateSchedulesTemplate(descriptors, opts) { ... }
```

**Logic:**

1. Filter `descriptors` to those with
   `schedule !== null`.
2. If empty, return `null`.
3. Sort filtered descriptors alphabetically by `name`.
4. Build a YAML string with:
   - `AWSTemplateFormatVersion: '2010-09-09'`
   - Parameters: `FunctionsLambdaArn`,
     `FunctionsScheduleRoleArn`, `ProjectName` (all
     `Type: String`)
   - Resources: one `AWS::Scheduler::Schedule` per
     scheduled function.

**Per-schedule resource:**

```yaml
<LogicalId>:
  Type: AWS::Scheduler::Schedule
  Properties:
    Name: !Sub '${ProjectName}-<function-name>'
    ScheduleExpression: '<expression>'
    ScheduleExpressionTimezone: '<timezone>'
    FlexibleTimeWindow:
      Mode: 'OFF'
    Target:
      Arn: !Ref FunctionsLambdaArn
      RoleArn: !Ref FunctionsScheduleRoleArn
      Input: '<JSON string>'
```

**Logical ID derivation:**
Convert function name from kebab-case to PascalCase and
append `Schedule`. Example: `daily-cleanup` ->
`DailyCleanupSchedule`, `my-cool-function` ->
`MyCoolFunctionSchedule`.

**Target.Input JSON:**
```json
{
  "_boaInternal": {
    "name": "<function-name>",
    "scheduledAt": "<aws.scheduler.scheduled-time>"
  },
  "payload": <scheduleInput>,
  "headers": {}
}
```

Use `JSON.stringify()` for the Input value. The
`<aws.scheduler.scheduled-time>` is a literal string
(EventBridge resolves it at invocation time).

**YAML generation approach:**
Build the YAML as a template string. Do NOT add a YAML
library dependency. The structure is static enough for
string interpolation. Use 2-space indentation matching
existing templates.

**Depends on:** Task 02 (same file, validators already present)

## Acceptance Criteria

- All "Template generation" tests pass
- Generated YAML is valid CloudFormation structure
- Output is deterministic (same input -> same output)
- No new dependencies added

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If `generateSchedulesTemplate` already exists in
  `schedule.mjs`, escalate -- the design assumes only the
  validators exist from Task 02.
