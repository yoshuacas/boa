# Scheduled Functions

## Overview

Add schedule-driven invocation to BOA Functions. A developer
adds `"schedule": "cron(...)"` or `"rate(...)"` to a
function's `boa.json`, runs `boa deploy`, and an EventBridge
Scheduler schedule invokes the FunctionsLambda on the given
cadence. No new runtime, no new auth model, no new ingress
-- just a trigger.

Scheduled functions must be `visibility: "private"` (a
function that runs on a clock and is also publicly callable
is a footgun). Scheduled invocations run as `service_role`
(a schedule has no caller, so there is no JWT to forward).

## Current CX / Concepts

### Functions Today

The Functions implementation (`docs/design/functions.md`)
provides two ingress paths:

1. **HTTP via API Gateway** -- public functions at
   `/functions/v1/<name>`.
2. **Direct invoke via `_boaInternal`** -- private functions
   called by another function or a service-key holder.

Functions are discovered from `functions/<name>/boa.json`,
validated by `cli/lib/functions/discover.mjs`, packaged into
a shared Lambda zip, and deployed to a single
`FunctionsLambda`. The runtime (`handler.mjs`) routes by
function name, checks visibility, and builds a normalized
`req`/`ctx` pair.

### Direct Invoke Envelope

The existing `_boaInternal` envelope
(`cli/lib/functions/runtime/handler.mjs:46-48`) carries:

```json
{
  "_boaInternal": { "name": "<function-name>" },
  "payload": { ... },
  "headers": { "apikey": "<service-role-key>" }
}
```

When `_boaInternal` is present, the handler routes by
`event._boaInternal.name` and skips API Gateway path
parsing. Auth is extracted from `event.headers` (apikey or
Authorization).

### Auth Extraction

`cli/lib/functions/runtime/ctx.mjs:23-59` determines the
caller role:

- Bearer JWT with valid signature -> `authenticated`
- `apikey` header matching service role key -> `service_role`
- Neither -> `anon`

Direct invokes with a service-role apikey get
`role='service_role'`. Direct invokes with no auth headers
get `role='anon'`.

### Deploy Pattern

`cli/commands/deploy.mjs` packages the functions zip,
uploads to S3 with a content-addressed key, and passes
`FunctionsLambdaS3Key` as a CloudFormation parameter. All
functions infrastructure lives in the main
`cli/templates/backend.yaml` -- no nested stacks exist
today.

### Registry

`cli/lib/functions/registry.mjs` builds a routing manifest
with `{ visibility, timeout, memory }` per function.
`cli/commands/functions.mjs` uses the registry for the
`list` subcommand, formatting name/visibility/status columns.

## Proposed CX / CX Specification

### Schema Additions

`functions/<name>/boa.json` gains three optional fields:

```json
{
  "visibility": "private",
  "schedule": "cron(0 9 * * ? *)",
  "scheduleTimezone": "America/Los_Angeles",
  "scheduleInput": { "action": "digest" }
}
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `schedule` | string | unset | EventBridge Scheduler expression: `cron(...)`, `rate(...)`, or `at(...)`. Unset means no schedule. |
| `scheduleTimezone` | string | `"UTC"` | IANA timezone (e.g. `"America/Los_Angeles"`). Scheduler accepts these directly. |
| `scheduleInput` | object | `{}` | Static JSON delivered as `req.body` on each invocation. |

**Invariants:**

- `schedule` requires `visibility: "private"`. A scheduled
  function cannot be public.
- `scheduleTimezone` and `scheduleInput` are ignored when
  `schedule` is not set.
- If `scheduleInput` contains a `_scheduledAt` key, the
  runtime overwrites it (BOA's value is authoritative).

### Expression Syntax

Three forms are accepted:

| Form | Example | Meaning |
|------|---------|---------|
| `cron(...)` | `cron(0 9 ? * MON-FRI *)` | Six-field EventBridge cron |
| `rate(...)` | `rate(5 minutes)` | Fixed interval |
| `at(...)` | `at(2026-06-01T09:00:00)` | One-time invocation |

The expression validator rejects anything that does not
match one of these three patterns. It does not fully parse
cron fields (EventBridge validates at deploy time) but
rejects obviously malformed input (empty parens, shell
metacharacters, missing required parts). The `rate()`
validator enforces valid units: `minute`, `minutes`,
`hour`, `hours`, `day`, `days`.

**Validation errors:**

```
Error: Invalid schedule expression 'every 5 minutes'.
  Must be cron(...), rate(...), or at(...).
  Examples:
    cron(0 9 ? * MON-FRI *)   -- weekdays at 9am
    rate(5 minutes)            -- every 5 minutes
    at(2026-06-01T09:00:00)   -- once at a specific time
```

```
Error: Scheduled function 'daily-cleanup' must be private.
  Functions with a schedule cannot have visibility: "public".
  Set "visibility": "private" in functions/daily-cleanup/boa.json.
```

```
Error: Invalid scheduleTimezone 'PST'.
  Use an IANA timezone like "America/Los_Angeles" or "UTC".
```

### Handler Experience

A scheduled function sees the same `(req, ctx)` interface:

```javascript
export default async function handler(req, ctx) {
  // ctx.role === 'service_role'
  // ctx.userId === ''
  // ctx.jwt === ''
  // req.body === scheduleInput (or {})
  // req.body._scheduledAt === ISO timestamp of trigger
  // req.headers === {}
  // req.method === 'POST'
}
```

The handler cannot tell from `ctx` alone that it was
triggered by a schedule vs. a manual direct invoke with the
service key. This is intentional -- same code works both
ways. If the function needs to distinguish, it reads
`req.body._scheduledAt` (present only for schedule
invocations).

### CLI Output

**`boa functions list` with schedules:**

```
Functions:

  hello           public    deployed
  daily-cleanup   private   deployed   cron(0 9 * * ? *)
  health-check    private   deployed   rate(5 minutes)

Run 'boa deploy' to sync local changes.
```

A fourth column shows the schedule expression for
scheduled functions. Non-scheduled functions show nothing.

**`boa deploy` with schedules:**

```
  Preparing REST API...              done
  Uploading functions...             done
  Generating schedules template...   done
  Deploying stack...                 done
  Verifying deployment...            done

Stack deployed.
  API:       https://xxx.execute-api.us-east-1.amazonaws.com/prod
  Functions: 3 deployed (2 scheduled)
```

**`boa verify` schedule checks:**

```
Verifying deployment...

  [PASS] Functions registry in sync
  [PASS] SSM secrets present
  [PASS] Public routes reachable
  [PASS] Schedules in sync

  [FAIL] Schedule drift detected:
    daily-cleanup: local cron(0 9 * * ? *) != deployed cron(0 8 * * ? *)

1 issue found. Run 'boa deploy' to fix.
```

### Routing

```
EventBridge Scheduler -> FunctionsLambda (direct invoke)
  payload: {
    "_boaInternal": {
      "name": "<function-name>",
      "scheduledAt": "<aws.scheduler.scheduled-time>"
    },
    "payload": <scheduleInput>,
    "headers": {}
  }
```

The route table grows by zero rows. Schedules do not touch
API Gateway. The `_boaInternal` envelope is reused
verbatim; schedules add only the `scheduledAt` field to
signal the schedule trust path.

### Token Model Extension

| Caller | `ctx.role` | `ctx.userId` | `ctx.db` bound to | `ctx.boa` |
|--------|------------|--------------|-------------------|-----------|
| EventBridge Scheduler | `'service_role'` | `''` | DSQL role `service_role` | service-role client |

The runtime detects the schedule case when
`event._boaInternal.scheduledAt` is present and no `apikey`
header exists. In that scenario it forces
`role = 'service_role'` rather than the default `anon`.
EventBridge is in BOA's trust boundary; it does not present
a JWT.

## Technical Design

### Schedule Expression Validator

New module: `cli/lib/functions/schedule.mjs`

```javascript
const CRON_RE = /^cron\(.+\)$/;
const RATE_RE = /^rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)$/;
const AT_RE = /^at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)$/;
const SHELL_META = /[;&|`$'"\\<>]/;

export function validateScheduleExpression(expr) {
  if (SHELL_META.test(expr)) {
    return { valid: false, error: 'contains invalid characters' };
  }
  if (CRON_RE.test(expr) || RATE_RE.test(expr) || AT_RE.test(expr)) {
    return { valid: true };
  }
  return { valid: false, error: 'must be cron(...), rate(...), or at(...)' };
}
```

The `SHELL_META` pattern also rejects `<` and `>` to
prevent confusion with the EventBridge context attribute
syntax (`<aws.scheduler.scheduled-time>`), which is only
valid in the Target Input field -- not in user-provided
expressions.

The validator rejects shell metacharacters before pattern
matching to prevent injection through the CloudFormation
template.

### Timezone Validation

The timezone string is validated against
`Intl.supportedValuesOf('timeZone')` (available in
Node.js 20.x). Abbreviated forms like `PST` or `EST` are
rejected with a suggestion to use the full IANA name.

```javascript
export function validateTimezone(tz) {
  const valid = Intl.supportedValuesOf('timeZone');
  if (!valid.includes(tz)) {
    return { valid: false, error: `Use an IANA timezone like "America/Los_Angeles" or "UTC"` };
  }
  return { valid: true };
}
```

### Discovery Changes (`discover.mjs`)

After existing config parsing (line 45), add schedule field
extraction:

```javascript
const schedule = config.schedule || null;
const scheduleTimezone = config.scheduleTimezone || 'UTC';
const scheduleInput = config.scheduleInput || {};

if (schedule) {
  if (visibility !== 'private') {
    errors.push(`Scheduled function '${name}' must be private.`);
  }
  const exprResult = validateScheduleExpression(schedule);
  if (!exprResult.valid) {
    errors.push(`Invalid schedule expression: ${exprResult.error}`);
  }
  if (scheduleTimezone !== 'UTC') {
    const tzResult = validateTimezone(scheduleTimezone);
    if (!tzResult.valid) {
      errors.push(`Invalid scheduleTimezone: ${tzResult.error}`);
    }
  }
}
```

The returned descriptor gains three fields:

```javascript
{
  name, visibility, timeout, memory, env, secrets, path,
  schedule,           // string | null
  scheduleTimezone,   // string ('UTC' default)
  scheduleInput,      // object ({} default)
}
```

### Registry Changes (`registry.mjs`)

The registry manifest gains an optional `schedule` field:

```javascript
registry[name] = {
  visibility,
  timeout,
  memory,
  ...(schedule && { schedule, scheduleTimezone }),
};
```

`scheduleInput` is not included in the registry -- it is
only needed at deploy time for the nested-stack template,
not at runtime.

### Nested Stack Generation (`schedule.mjs`)

New function `generateSchedulesTemplate(descriptors, opts)`:

1. Filters descriptors to those with `schedule !== null`.
2. For each, emits an `AWS::Scheduler::Schedule` resource.
3. Returns a YAML string (or `null` if no schedules).

The generated template:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Parameters:
  FunctionsLambdaArn:
    Type: String
  FunctionsScheduleRoleArn:
    Type: String
  ProjectName:
    Type: String

Resources:
  DailyCleanupSchedule:
    Type: AWS::Scheduler::Schedule
    Properties:
      Name: !Sub '${ProjectName}-daily-cleanup'
      ScheduleExpression: 'cron(0 9 * * ? *)'
      ScheduleExpressionTimezone: 'America/Los_Angeles'
      FlexibleTimeWindow:
        Mode: 'OFF'
      Target:
        Arn: !Ref FunctionsLambdaArn
        RoleArn: !Ref FunctionsScheduleRoleArn
        Input: !Sub |
          {
            "_boaInternal": {
              "name": "daily-cleanup",
              "scheduledAt": "<aws.scheduler.scheduled-time>"
            },
            "payload": {"action":"digest"},
            "headers": {}
          }
```

Resource logical IDs are derived from the function name
by converting kebab-case to PascalCase and appending
`Schedule` (e.g., `daily-cleanup` becomes
`DailyCleanupSchedule`). Output is deterministic: functions
sorted alphabetically, producing stable diffs across
deploys.

### Runtime Changes

**`handler.mjs`** -- After building `req` from the
`_boaInternal` path (lines 64-70, specifically after
`body: parseBody(event)` at line 69), inject
`_scheduledAt`:

```javascript
if (event._boaInternal && event._boaInternal.scheduledAt) {
  req.body = typeof req.body === 'object' ? req.body : {};
  req.body._scheduledAt = event._boaInternal.scheduledAt;
}
```

Note: `parseBody` (line 26) returns `event.payload || {}`
for `_boaInternal` events, so `req.body` is already the
`scheduleInput` object. The `_scheduledAt` injection
overwrites any user-provided `_scheduledAt` in
`scheduleInput` (BOA's value is authoritative).

**`ctx.mjs`** -- In `extractAuth` (lines 23-59), before
the existing auth logic (line 29, `let role = 'anon'`),
add the schedule trust check:

```javascript
if (event._boaInternal && event._boaInternal.scheduledAt) {
  return { role: 'service_role', userId: '', email: '', jwt: '' };
}
```

This short-circuits before JWT/apikey parsing. The
presence of `scheduledAt` in the trusted `_boaInternal`
envelope is sufficient -- only EventBridge (via the
`FunctionsScheduleRole` IAM role) can direct-invoke the
Lambda with this payload shape. Note: `extractAuth`
receives the full `event` object (passed through
`buildCtx` at line 68), so it can inspect
`event._boaInternal` directly.

### CloudFormation Additions (`backend.yaml`)

Two new resources in the main template:

**`FunctionsScheduleRole`** -- IAM role for EventBridge
Scheduler (conditional, same `HasSchedules` condition):

```yaml
FunctionsScheduleRole:
  Type: AWS::IAM::Role
  Condition: HasSchedules
  Properties:
    RoleName: !Sub '${ProjectName}-functions-schedule'
    AssumeRolePolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Principal:
            Service: scheduler.amazonaws.com
          Action: sts:AssumeRole
    Policies:
      - PolicyName: InvokeFunctionsLambda
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: lambda:InvokeFunction
              Resource: !GetAtt FunctionsLambda.Arn
```

**`FunctionsSchedulesStack`** -- Nested stack reference
(conditional):

```yaml
Conditions:
  HasSchedules:
    !Not [!Equals [!Ref FunctionsSchedulesTemplateUrl, '']]

FunctionsSchedulesStack:
  Type: AWS::CloudFormation::Stack
  Condition: HasSchedules
  Properties:
    TemplateURL: !Ref FunctionsSchedulesTemplateUrl
    Parameters:
      FunctionsLambdaArn: !GetAtt FunctionsLambda.Arn
      FunctionsScheduleRoleArn: !GetAtt FunctionsScheduleRole.Arn
      ProjectName: !Ref ProjectName
```

New parameter:

```yaml
FunctionsSchedulesTemplateUrl:
  Type: String
  Default: ''
  Description: S3 URL for the schedules nested stack template
```

The `Default: ''` allows deploys with no schedules to omit
the parameter entirely. The `HasSchedules` condition
prevents CloudFormation from attempting to create a nested
stack with no template URL.

When no functions are scheduled, the deploy command skips
the nested stack entirely: it does not upload a template
and does not pass `FunctionsSchedulesTemplateUrl` as a
parameter. The `FunctionsSchedulesStack` resource in
`backend.yaml` is conditional on the parameter being
non-empty (using a `Condition` that checks
`FunctionsSchedulesTemplateUrl != ''`).

### Deploy Changes (`deploy.mjs`)

After functions zip upload, add schedule template
generation:

1. Call `generateSchedulesTemplate(descriptors)`.
2. Upload the YAML to the artifacts bucket at
   `schedules/${hash}.yaml` (content-addressed).
3. Pass the S3 URL as the
   `FunctionsSchedulesTemplateUrl` parameter.

The `packageArtifacts()` return shape gains a
`schedulesTemplateUrl` field:

```javascript
return {
  bucket, lambdaKey, functionsKey,
  schedulesTemplateUrl, templateUrl, accountId
};
```

### Verify Changes (`verify.mjs`)

New check after existing functions verification:

1. List deployed schedules by describing the nested stack
   resources.
2. Compare local `schedule` fields against deployed
   schedule expressions.
3. Report drift: local schedule missing from deployed,
   deployed schedule missing from local, expression
   mismatch.

Output follows the existing pass/fail format.

### Functions List Changes (`functions.mjs`)

Extend the tabular output to include a schedule column.
The column only renders when at least one function has a
schedule. Padding: `name.padEnd(16) + visibility.padEnd(10)
+ status.padEnd(14) + (schedule || '')`.

## Code Architecture / File Changes

### New Files

```
cli/lib/functions/schedule.mjs
  - validateScheduleExpression(expr)
  - validateTimezone(tz)
  - generateSchedulesTemplate(descriptors, opts)

cli/__tests__/functions-schedule.test.mjs
  - Expression validation (cron, rate, at, invalid, metachar)
  - Visibility enforcement (schedule + public -> error)
  - Timezone validation (valid IANA, invalid abbrev)
  - Template generation (single, multiple, empty, ordering)
  - scheduleInput serialization in template

cli/__tests__/functions-runtime-schedule.test.mjs
  - scheduledAt in _boaInternal -> role='service_role'
  - _scheduledAt injected into req.body
  - Direct invoke without scheduledAt unchanged
  - scheduleInput._scheduledAt overwritten by runtime
```

### Modified Files

| File | Change |
|------|--------|
| `cli/lib/functions/discover.mjs` | Parse `schedule`, `scheduleTimezone`, `scheduleInput`. Enforce private invariant. Validate expression and timezone. |
| `cli/lib/functions/registry.mjs` | Include `schedule` and `scheduleTimezone` in registry entries when present. |
| `cli/lib/functions/runtime/ctx.mjs` | Short-circuit `extractAuth` to `service_role` when `_boaInternal.scheduledAt` is present. |
| `cli/lib/functions/runtime/handler.mjs` | Inject `_scheduledAt` into `req.body` when `_boaInternal.scheduledAt` is present. |
| `cli/commands/deploy.mjs` | Generate schedules template, upload to S3, pass URL as CFN parameter. |
| `cli/commands/functions.mjs` | Show schedule column in `list` output. |
| `cli/commands/verify.mjs` | Add schedule drift detection (local vs. deployed parity). |
| `cli/templates/backend.yaml` | Add `FunctionsScheduleRole`, `FunctionsSchedulesStack`, `FunctionsSchedulesTemplateUrl` parameter. |
| `cli/__tests__/functions-discover.test.mjs` | Extend: invalid TZ, invalid cron, schedule on public, schedule fields in descriptor. |
| `cli/__tests__/verify-functions.test.mjs` | Extend: schedule drift detection cases. |

### Documentation (last)

| File | Change |
|------|--------|
| `plugin/skills/boa/SKILL.md` | Scheduled functions section in "Custom Functions". |
| `plugin/skills/boa/evals/evals.json` | +1 schedule eval scenario. |
| `plugin/docs/FUNCTIONS.md` | "Scheduled functions" section with examples. |
| `plugin/docs/ARCHITECTURE.md` | EventBridge Scheduler row in stack table. |
| `plugin/docs/PITFALLS.md` | Schedule-specific failure modes. |
| `plugin/CLAUDE.md` | Architecture diagram update. |
| `plugin/AGENTS.md` | Same. |
| `docs/GLOSSARY.md` | New terms: scheduled function, EventBridge Scheduler, schedule expression. |
| `website/docs/functions.html` | Scheduled functions section. |
| `cli/README.md` | Scheduling paragraph. |

## Testing Strategy

### Unit Tests (`cli/__tests__/`)

| File | What it asserts |
|------|-----------------|
| `functions-schedule.test.mjs` | Discovery accepts `cron(...)`, `rate(...)`, `at(...)`. Rejects unknown forms. Rejects shell metacharacters (`'; rm -rf /'`). Rejects `schedule` without `visibility: "private"` with exact error message. `scheduleTimezone` defaults to `"UTC"`. `scheduleInput` defaults to `{}`. Generated nested-stack YAML contains one `AWS::Scheduler::Schedule` per scheduled function with correct expression, TZ, and Input JSON. Multiple schedules produce alphabetically-sorted, deterministic output. Empty schedule list returns `null` (no template generated). |
| `functions-runtime-schedule.test.mjs` | Event with `_boaInternal.scheduledAt` and no `apikey` -> `ctx.role === 'service_role'`, `ctx.userId === ''`, `ctx.jwt === ''`. `req.body._scheduledAt` matches `_boaInternal.scheduledAt` value. Direct invoke without `scheduledAt` still routes normally (private function path unchanged, role from apikey). If `scheduleInput` contains `_scheduledAt`, runtime overwrites it with BOA's value. |
| `functions-discover.test.mjs` (extend) | Invalid TZ rejected. Invalid cron rejected. Schedule on public function rejected. `schedule`, `scheduleTimezone`, `scheduleInput` present in returned descriptor. |
| `verify-functions.test.mjs` (extend) | Reports drift when schedule field exists locally but nested stack has no matching schedule. Reports drift when deployed schedule exists with no local match. Reports expression mismatch. |

### Negative / Security Tests

- Scheduled function with `visibility: "public"` fails at
  discovery, before any AWS API call. Asserts exact error.
- Generated template has `FlexibleTimeWindow: { Mode: 'OFF' }`
  for every schedule (static YAML parse assertion).
- Schedule expression with shell metacharacters rejected by
  validator before reaching CFN.
- `_boaInternal.scheduledAt` set by a non-EventBridge caller
  is an IAM trust boundary concern (the
  `FunctionsScheduleRole` restricts who can invoke), not a
  runtime concern. The runtime test documents this boundary.

### Integration Test (live deploy)

Added to `plans/e2e-testing-plan.md`:

1. Add `functions/scheduled-tick/boa.json` with
   `"schedule": "rate(1 minute)"`, `"visibility": "private"`.
   Handler writes a row to `_schedule_ticks` with `now()`.
2. `boa deploy`
3. Wait 90 seconds. Query the table -- expect >= 1 row.
4. `aws scheduler get-schedule --name <stack>-scheduled-tick`
   returns `State: ENABLED`.
5. Edit `boa.json` to `"rate(5 minutes)"`. `boa deploy`.
   Schedule expression in CFN now matches.
6. Remove `schedule` field. `boa deploy`. Schedule resource
   gone from nested stack. Function still exists (direct
   invoke only).
7. Delete `functions/scheduled-tick/`. `boa deploy`. Both
   function and schedule are gone.
8. `boa teardown` cleans up.

### Manual Test Entries

Added to `plans/manual-test-plan.md`:

- "Scheduled function: rate expression" -- deploy a
  rate(1 minute) function, verify it fires.
- "Scheduled function: cron with TZ" -- deploy a cron with
  `America/Los_Angeles`, verify in AWS console.
- "Scheduled function: rejected when public" -- attempt
  deploy with schedule + public, see error before AWS call.
- "Scheduled function: scheduleInput delivered" -- function
  reads `req.body.foo === 'bar'` from scheduleInput.
- "Scheduled function: drift detection" -- manually delete
  EventBridge schedule in console, run `boa verify`, see
  drift warning.

### Skill-Level Eval

| Scenario | Pass criteria |
|----------|---------------|
| "Add a function that runs every weekday at 9am Pacific and sends a digest email" | Agent creates `functions/<name>/` with `visibility: "private"`, `schedule: "cron(0 9 ? * MON-FRI *)"`, `scheduleTimezone: "America/Los_Angeles"`, lists the SES secret. Does **not** set visibility to public. Does **not** wire up an HTTP route. |

### Launch Gate

Scheduled functions ships when:

- All new and extended `cli/__tests__/` files pass in CI.
- The live E2E test (steps 1-8) runs green on a clean
  account, including drift detection.
- The new eval passes with the production skill in a fresh
  Claude Code session.
- All five manual test entries pass on the pre-launch run.

## Implementation Order

1. **Discovery + validation + tests.** Extend
   `discover.mjs` to read `schedule`, `scheduleTimezone`,
   `scheduleInput`. Enforce `visibility: "private"`.
   Validate expression syntax with the validator in
   `schedule.mjs`. Write `functions-schedule.test.mjs`
   covering validation. No CFN, no live AWS.

2. **Nested-stack generation + tests.** Complete
   `schedule.mjs` with `generateSchedulesTemplate()`.
   Test against fixture inputs: single schedule, multiple
   schedules, empty list, deterministic ordering.

3. **Runtime auth path + tests.** `ctx.mjs` returns
   `service_role` for the scheduled case. `handler.mjs`
   injects `_scheduledAt` into `req.body`. Write
   `functions-runtime-schedule.test.mjs`.

4. **CloudFormation deltas.** Add `FunctionsScheduleRole`
   and `FunctionsSchedulesStack` reference in
   `backend.yaml`. Add `FunctionsSchedulesTemplateUrl`
   parameter.

5. **Deploy wiring.** `deploy.mjs` generates and uploads
   the nested template alongside the functions zip; passes
   the S3 URL as a parameter to the main stack.

6. **List/verify CLI + tests.** `boa functions list` shows
   schedule column. `boa verify` adds parity check. Extend
   existing test files.

7. **E2E + manual + evals.** Add integration test to E2E
   plan, manual entries, and the eval scenario. Run all.

8. **Skill + docs.** Update `SKILL.md`, `FUNCTIONS.md`,
   `PITFALLS.md`, `ARCHITECTURE.md`, `CLAUDE.md`,
   `AGENTS.md`, website page, glossary. Docs last per the
   "never document what you haven't deployed" rule.

## Open Questions

1. **Nested stack vs. parameterized resource list.** Nested
   stack chosen to avoid cluttering `backend.yaml`.
   Reconsider if nested stacks add operational pain (slower
   deploys, deeper failure modes) during implementation.

2. **`_scheduledAt` collision with `scheduleInput`.** If
   `scheduleInput` carries a `_scheduledAt` key, the
   runtime overwrites it (BOA's value is authoritative).
   Chosen resolution: overwrite and log a warning.

3. **Per-function vs. shared schedule role.** One shared
   `FunctionsScheduleRole` invokable by every schedule.
   Per-function roles would tighten blast radius but
   multiply IAM resources. Revisit if fine-grained audit
   becomes a customer ask.

4. **Empty nested stack on first deploy.** When no
   functions have schedules, the nested stack needs at
   least one resource (CloudFormation rejects empty
   `Resources`). Use a `AWS::CloudFormation::WaitConditionHandle`
   as a no-op placeholder, or make the
   `FunctionsSchedulesStack` reference conditional on
   having at least one schedule. Resolve during
   implementation -- conditional reference is simpler
   (skip the nested stack entirely when no schedules).
