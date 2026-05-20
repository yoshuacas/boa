# Task 01: End-to-End Tests for Scheduled Functions

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Create test files that validate the full scheduled-functions
feature: schedule expression validation, timezone validation,
visibility enforcement, nested-stack template generation, and
runtime auth/body injection. All tests should fail initially.

## Test File Paths

Create two test files:

1. `cli/__tests__/functions-schedule.test.mjs`
2. `cli/__tests__/functions-runtime-schedule.test.mjs`

Use `node:test` and `node:assert/strict`. No new dependencies.

## Test Cases

### File: `cli/__tests__/functions-schedule.test.mjs`

#### Schedule Expression Validation

- Given a valid cron expression `cron(0 9 ? * MON-FRI *)`,
  when validated, then it is accepted
- Given a valid rate expression `rate(5 minutes)`, when
  validated, then it is accepted
- Given a valid rate expression `rate(1 hour)`, when
  validated, then it is accepted
- Given a valid rate expression `rate(7 days)`, when
  validated, then it is accepted
- Given a valid at expression `at(2026-06-01T09:00:00)`,
  when validated, then it is accepted
- Given an invalid expression `every 5 minutes`, when
  validated, then it is rejected with error containing
  "must be cron(...), rate(...), or at(...)"
- Given an expression with shell metacharacters
  `cron(0 9 * * ? *); rm -rf /`, when validated, then it
  is rejected with error containing "invalid characters"
- Given an expression with backticks
  `rate(1 \`whoami\` minute)`, when validated, then it
  is rejected with error containing "invalid characters"
- Given an expression with pipe `rate(1 | cat minutes)`,
  when validated, then it is rejected with error containing
  "invalid characters"
- Given an expression with angle brackets
  `rate(<aws.scheduler.scheduled-time>)`, when validated,
  then it is rejected with error containing "invalid
  characters"
- Given an empty cron expression `cron()`, when validated,
  then it is rejected
- Given a rate with invalid unit `rate(5 weeks)`, when
  validated, then it is rejected
- Given a rate with no number `rate(minutes)`, when
  validated, then it is rejected

#### Timezone Validation

- Given a valid IANA timezone `America/Los_Angeles`, when
  validated, then it is accepted
- Given a valid IANA timezone `UTC`, when validated, then
  it is accepted
- Given a valid IANA timezone `Europe/London`, when
  validated, then it is accepted
- Given an abbreviated timezone `PST`, when validated,
  then it is rejected with error containing
  "IANA timezone"
- Given an abbreviated timezone `EST`, when validated,
  then it is rejected with error containing
  "IANA timezone"
- Given a nonsense timezone `Fake/Place`, when validated,
  then it is rejected with error containing
  "IANA timezone"

#### Visibility Enforcement (via discover)

- Given a function with `schedule` set and
  `visibility: "public"`, when discovered, then discovery
  returns an error containing "must be private"
- Given a function with `schedule` set and
  `visibility: "private"`, when discovered, then discovery
  succeeds with schedule fields in the descriptor
- Given a function with `schedule` set and no explicit
  visibility (defaults to public), when discovered, then
  discovery returns an error containing "must be private"

#### Schedule Fields in Descriptor

- Given a function with `schedule: "rate(5 minutes)"`,
  `scheduleTimezone: "America/Los_Angeles"`, and
  `scheduleInput: { "action": "digest" }`, when
  discovered, then the descriptor contains all three
  fields with correct values
- Given a function with `schedule: "cron(0 9 * * ? *)"`,
  no `scheduleTimezone`, and no `scheduleInput`, when
  discovered, then descriptor has `scheduleTimezone: "UTC"`
  and `scheduleInput: {}`
- Given a function with no `schedule` field, when
  discovered, then `schedule` is `null` in the descriptor

#### Schedule Fields Ignored Without Schedule

- Given a function with `scheduleTimezone:
  "America/Los_Angeles"` and `scheduleInput:
  { "x": 1 }` but no `schedule` field, when
  discovered, then no validation error occurs and
  `schedule` is `null` in the descriptor

#### Invalid Schedule in Discovery

- Given a function with an invalid schedule expression
  and `visibility: "private"`, when discovered, then
  discovery returns an error about the expression
- Given a function with `schedule` set and invalid
  `scheduleTimezone: "PST"`, when discovered, then
  discovery returns an error about the timezone

#### Template Generation

- Given one scheduled function descriptor with
  `schedule: "cron(0 9 * * ? *)"`,
  `scheduleTimezone: "America/Los_Angeles"`,
  `scheduleInput: { "action": "digest" }`, when
  `generateSchedulesTemplate()` is called, then it
  returns a YAML string containing one
  `AWS::Scheduler::Schedule` resource
- Given the generated template for a function named
  `daily-cleanup`, then the resource logical ID is
  `DailyCleanupSchedule`
- Given the generated template, then the
  `ScheduleExpression` matches the input expression
- Given the generated template, then
  `ScheduleExpressionTimezone` matches the input timezone
- Given the generated template, then `FlexibleTimeWindow`
  is `{ Mode: 'OFF' }`
- Given the generated template, then the `Target.Input`
  contains `_boaInternal.name` set to the function name
- Given the generated template, then the `Target.Input`
  contains `_boaInternal.scheduledAt` set to
  `<aws.scheduler.scheduled-time>`
- Given the generated template, then the `Target.Input`
  contains `payload` matching the `scheduleInput` object
- Given multiple scheduled functions (`alpha-fn`,
  `beta-fn`, `gamma-fn`), when
  `generateSchedulesTemplate()` is called, then the
  resources appear alphabetically sorted in output
- Given multiple scheduled functions, when
  `generateSchedulesTemplate()` is called, then every
  generated resource has
  `FlexibleTimeWindow: { Mode: 'OFF' }`
- Given the same input descriptors, when
  `generateSchedulesTemplate()` is called twice, then the
  output is identical (deterministic)
- Given an empty list of descriptors (no schedules), when
  `generateSchedulesTemplate()` is called, then it
  returns `null`
- Given a function named `my-cool-function`, then the
  resource logical ID is `MyCoolFunctionSchedule`
  (kebab-case to PascalCase)

#### Registry Inclusion

- Given a function with a schedule, when
  `buildRegistry()` is called, then the registry entry
  includes `schedule` and `scheduleTimezone`
- Given a function without a schedule, when
  `buildRegistry()` is called, then the registry entry
  does not have a `schedule` key

### File: `cli/__tests__/functions-runtime-schedule.test.mjs`

#### Schedule Auth Path

- Given an event with `_boaInternal.scheduledAt` set and
  no `apikey` header, when `buildCtx()` is called, then
  `ctx.role` is `'service_role'`
- Given an event with `_boaInternal.scheduledAt` set and
  no `apikey` header, when `buildCtx()` is called, then
  `ctx.userId` is `''`
- Given an event with `_boaInternal.scheduledAt` set and
  no `apikey` header, when `buildCtx()` is called, then
  `ctx.jwt` is `''`
- Given an event with `_boaInternal.scheduledAt` set and
  no `apikey` header, when `buildCtx()` is called, then
  `ctx.email` is `''`
- Given an event with `_boaInternal` but no `scheduledAt`
  field and an `apikey` header matching service role key,
  when `buildCtx()` is called, then `ctx.role` is
  `'service_role'` (existing direct-invoke behavior
  unchanged)
- Given an event with `_boaInternal` but no `scheduledAt`
  field and no auth headers, when `buildCtx()` is called,
  then `ctx.role` is `'anon'` (existing behavior
  unchanged)

#### `_scheduledAt` Injection

- Given an event with `_boaInternal.scheduledAt` set to
  `"2026-06-01T09:00:00Z"` and `payload: { "action":
  "digest" }`, when the handler processes the event, then
  `req.body._scheduledAt` equals
  `"2026-06-01T09:00:00Z"`
- Given an event with `_boaInternal.scheduledAt` set and
  `payload: { "action": "digest" }`, when the handler
  processes the event, then `req.body.action` equals
  `"digest"` (original payload preserved)
- Given an event with `scheduleInput` containing
  `_scheduledAt: "user-value"` and
  `_boaInternal.scheduledAt: "2026-06-01T09:00:00Z"`,
  when the handler processes the event, then
  `req.body._scheduledAt` equals
  `"2026-06-01T09:00:00Z"` (BOA overwrites user value)
- Given an event with `_boaInternal.scheduledAt` set and
  no `payload` field (empty), when the handler processes
  the event, then `req.body` is `{ _scheduledAt:
  "2026-06-01T09:00:00Z" }`
- Given an event with `_boaInternal.scheduledAt` set,
  when the handler processes the event, then
  `req.method` is `'POST'`
- Given an event with `_boaInternal.scheduledAt` set,
  when the handler processes the event, then
  `req.headers` is `{}`

#### Direct Invoke Unchanged

- Given a direct-invoke event with `_boaInternal.name`
  set but no `scheduledAt`, and `headers: { apikey:
  <service-role-key> }`, when the handler processes the
  event, then `req.body` does NOT contain `_scheduledAt`
- Given a direct-invoke event with `_boaInternal.name`
  set but no `scheduledAt`, when the handler processes
  the event, then routing still works correctly (function
  is invoked and returns a response)

## Implementation Notes

- Import `validateScheduleExpression` and
  `validateTimezone` from
  `../lib/functions/schedule.mjs` (module does not exist
  yet -- tests will fail on import).
- Import `generateSchedulesTemplate` from the same
  module.
- For discovery tests, create a temporary directory
  structure with `functions/<name>/boa.json` and
  `functions/<name>/index.mjs`, then call `discover()`
  on it.
- For runtime tests, import `buildCtx` from
  `../lib/functions/runtime/ctx.mjs` and the `handler`
  from `../lib/functions/runtime/handler.mjs`. Mock the
  registry to include the test function as private.
  Test auth behavior through `buildCtx` (the public
  interface), not `extractAuth` (internal function).
  Assert on `ctx.role`, `ctx.userId`, `ctx.email`,
  `ctx.jwt`.
- For registry tests, import `buildRegistry` from
  `../lib/functions/registry.mjs`.
- Group tests into `describe` blocks by concern:
  "Expression validation", "Timezone validation",
  "Visibility enforcement", "Schedule fields in
  descriptor", "Schedule fields ignored without
  schedule", "Template generation", "Registry",
  "Schedule auth path", "_scheduledAt injection",
  "Direct invoke unchanged".

## Acceptance Criteria

- Both test files compile and run with
  `node --test cli/__tests__/functions-schedule.test.mjs`
  and
  `node --test cli/__tests__/functions-runtime-schedule.test.mjs`
- All tests fail with clear assertion messages indicating
  what is missing (e.g., import failures for the
  not-yet-created module, or assertion failures for
  missing behavior)
- No test panics or produces cryptic failures

## Conflict Criteria

- If any test that should fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps in the implementer prompt: investigate the code
  path, verify the assertion targets the right behavior,
  and attempt to rewrite the test to isolate the intended
  path. Only escalate if you cannot construct a
  well-formed test that targets the desired behavior.
