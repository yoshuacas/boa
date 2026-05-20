# Plan: Scheduled Functions

## Problem

`plans/functions.md` shipped Functions with one ingress: API Gateway. Anything time-driven (a daily cleanup, a weekly digest, a 5-minute health probe) requires the developer to hand-author an EventBridge Scheduler resource, an IAM role, and a target invocation payload. That is exactly the AWS complexity BOA exists to remove. The functions plan calls scheduled functions out as an explicit follow-up.

## Solution

**A scheduled function is a private function with a `schedule` field in `boa.json`.** The developer drops a cron or rate expression next to the rest of the function's config; `boa deploy` provisions an EventBridge Scheduler schedule that direct-invokes the FunctionsLambda with the existing `_boaInternal` envelope. No new runtime, no new auth model, no new ingress — just a trigger.

Two non-negotiables:

1. **Scheduled functions must be `visibility: "private"`.** A function that runs on a clock and is *also* publicly callable is a footgun (rate-limited cron leaking through the public route, or a public route accidentally given background-job privileges). Discovery rejects the combination at deploy time.
2. **Scheduled invocations run as `service_role`.** A schedule has no caller, so there is no JWT to forward. EventBridge is in BOA's trust boundary; it gets the same `ctx.role` as a service-key direct invoke. The function is responsible for any per-tenant scoping.

## Surface Area

```
project/
├── functions/
│   ├── daily-cleanup/
│   │   ├── index.mjs
│   │   └── boa.json          # adds "schedule": "cron(0 9 * * ? *)" + visibility:"private"
```

**`functions/<name>/boa.json`** (additions only)

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `schedule` | string | unset | EventBridge Scheduler expression. `cron(...)`, `rate(...)`, or `at(...)` (one-time). Unset means no schedule. |
| `scheduleTimezone` | string | `"UTC"` | IANA TZ name (e.g. `"America/Los_Angeles"`). EventBridge Scheduler accepts these directly. |
| `scheduleInput` | object | `{}` | Static JSON delivered as `req.body` on each invocation. |

`schedule` requires `visibility: "private"`. `scheduleTimezone` and `scheduleInput` only apply when `schedule` is set.

**`functions/<name>/index.mjs`** — same contract as before. The handler sees:

```javascript
export default async function handler(req, ctx) {
  // ctx.role === 'service_role'
  // ctx.userId === ''       — schedules have no caller
  // ctx.jwt    === ''
  // req.body   === scheduleInput verbatim (or {})
  // req.headers === {}
  // req.method === 'POST'
}
```

The handler cannot tell from `ctx` alone that it was triggered by a schedule. That is intentional — a function should be the same code whether it is invoked manually with the service key, or by EventBridge. If a function genuinely needs to know, it can read `req.body._scheduledAt` (set by the schedule input — see below) but BOA does not inject anything implicit.

## Routing & Visibility

```
EventBridge Scheduler  →  FunctionsLambda direct invoke
                          payload: { _boaInternal: { name, scheduledAt }, payload: <scheduleInput>, headers: {} }
                          ctx.role = service_role (no auth headers, no JWT)
                          ctx.userId = ''
```

The route table grows by zero rows. Schedules do not touch API Gateway.

The `_boaInternal` envelope already exists (`cli/lib/functions/runtime/handler.mjs:25-26, 46-52`). Schedules reuse it verbatim. The runtime adds **one** field: `_boaInternal.scheduledAt` (ISO timestamp from EventBridge's `<aws.scheduler.scheduled-time>` context attribute). The handler does not branch on it; the user can read it from `req.body._scheduledAt` if BOA copies the timestamp into the body before invoking the user handler.

Decision: BOA copies `event._boaInternal.scheduledAt` into `req.body._scheduledAt` only when present. This keeps user handlers framework-agnostic and lets a function distinguish "I was triggered by a schedule" from "the service key invoked me directly" without a parallel envelope.

## Tokens & Authorization

A schedule has no caller, so the token table from `plans/functions.md` extends by exactly one row:

| Caller | `ctx.role` | `ctx.userId` | `ctx.db` is bound to | `ctx.boa` |
|--------|------------|--------------|----------------------|-----------|
| EventBridge Scheduler | `'service_role'` | `''` | DSQL role `service_role` | service-role client (full powers) |

The runtime detects the schedule case the same way it detects a direct service-key invoke: `event._boaInternal` is present, and the headers do not carry an `apikey`. The existing `extractAuth` in `ctx.mjs` returns `'anon'` in that case today, which is wrong for schedules. The runtime change: when `event._boaInternal.scheduledAt` is present, force `role = 'service_role'`. EventBridge is in BOA's trust boundary; it does not have a JWT to present.

This is the smallest possible change to `ctx.mjs` and keeps the schedule trust assertion in one place.

## Cloud Resources (CloudFormation deltas)

Scheduled functions are dynamic — adding or removing one cannot require hand-editing `backend.yaml`. The deploy command emits a **per-stack child stack** for schedules so the registry of schedules is regenerated each deploy without polluting the main stack with N parameterized resources.

Two options were considered:

1. **Inline in `backend.yaml`** with one resource per schedule, gated by deploy-time substitution. Rejected: the file would grow proportional to the number of scheduled functions and CloudFormation parameters cannot create resources conditionally based on a list.
2. **Nested stack `functions-schedules.yaml`** — written by the deploy command from the discovered schedule list, uploaded to the same Lambda S3 bucket alongside the functions zip, referenced from `backend.yaml` as `AWS::CloudFormation::Stack`.

Option 2 is chosen. The main stack always references the nested stack; with no scheduled functions, the nested stack contains zero schedule resources but still deploys cleanly.

Added to `cli/templates/backend.yaml`:

| Resource | Purpose |
|----------|---------|
| `FunctionsScheduleRole` | One IAM role assumed by EventBridge Scheduler, with permission to invoke `FunctionsLambda`. Reused by every schedule. |
| `FunctionsSchedulesStack` | Nested stack pointing at the generated `functions-schedules.yaml`. Parameters: `FunctionsLambdaArn`, `FunctionsScheduleRoleArn`, `ProjectName`. |

Generated nested stack `functions-schedules.yaml` (one resource per scheduled function):

```yaml
{name}Schedule:
  Type: AWS::Scheduler::Schedule
  Properties:
    Name: !Sub '${ProjectName}-{name}'
    ScheduleExpression: <expression>
    ScheduleExpressionTimezone: <tz>
    FlexibleTimeWindow: { Mode: 'OFF' }
    Target:
      Arn: !Ref FunctionsLambdaArn
      RoleArn: !Ref FunctionsScheduleRoleArn
      Input: |
        {"_boaInternal":{"name":"<name>","scheduledAt":"<aws.scheduler.scheduled-time>"},
         "payload": <scheduleInput JSON>,
         "headers":{}}
```

`<aws.scheduler.scheduled-time>` is a literal EventBridge Scheduler context attribute string — Scheduler substitutes it at invocation time, not at deploy time.

`FlexibleTimeWindow: OFF` is the strict default. A future option could surface `flexibleTimeWindowMinutes` in `boa.json`.

## CLI Changes

Existing commands extend; no new top-level subcommand is added.

| Command | New behavior |
|---------|--------------|
| `boa deploy` | Discovers `schedule` fields in `boa.json`. Validates: expression syntax, TZ string, `visibility==='private'`. Generates `functions-schedules.yaml`, uploads alongside the functions zip, deploys main stack with the nested-stack reference. |
| `boa functions list` | Adds a `schedule` column showing the cron/rate expression for scheduled functions. |
| `boa functions invoke <name>` | If `<name>` is scheduled, invokes it the same way as any private function (direct-invoke with `_boaInternal`). No new flag — manual invocation of a scheduled function is just "trigger it now without waiting for the next tick." |
| `boa verify` | New checks: every scheduled function has a corresponding `AWS::Scheduler::Schedule` in the deployed nested stack; every deployed schedule has a matching local function (drift detection); the schedule expression in CFN matches `boa.json`. |

No `boa functions schedule` subcommand. State lives in `boa.json` and the deployed CFN stack — no imperative drift.

## Skill Changes (`plugin/skills/boa/`)

Append to the "Custom Functions" section of `SKILL.md`:

> **Scheduled functions.** Add `"schedule": "cron(...)"` or `"rate(...)"` to a function's `boa.json` and BOA wires up an EventBridge Scheduler invocation. Scheduled functions must be `"visibility": "private"` — the schedule is the trigger, the public HTTP route is not. The function runs as `service_role` with no caller JWT. Use the decision tree:
>
> - Time-driven (daily, every 5 minutes, weekly): **schedule it**.
> - Event-driven (on row insert, on file upload): out of scope today, use a database trigger or an S3 notification (extension).
> - User-triggered: not a scheduled function — that's a public function.

Update `plugin/docs/FUNCTIONS.md`:

- Add a "Scheduled functions" section after "Visibility" with one full example (`functions/daily-digest/boa.json` + `index.mjs`).
- Document the cron/rate/at expression syntax with three concrete examples.
- Document the `service_role` invariant and the `req.body._scheduledAt` injection.
- Document the timezone field with the most common pitfall (UTC default).

Update `plugin/skills/boa/evals/evals.json` with one new eval scenario:

- "Add a daily digest job that runs at 9am Pacific and emails users with new comments" — exercises `schedule`, `scheduleTimezone`, `visibility: "private"`, `secrets` (SES key), and the agent must *not* expose the digest publicly.

`plugin/CLAUDE.md` and `plugin/AGENTS.md` get a one-line addition to the architecture diagram noting `EventBridge Scheduler → FunctionsLambda` for scheduled functions.

## Repository Documentation Changes

| File | Change |
|------|--------|
| `plugin/docs/FUNCTIONS.md` | Scheduled functions section (above) |
| `plugin/docs/ARCHITECTURE.md` | Add `EventBridge Scheduler` row to the stack table; show schedule arrow into FunctionsLambda |
| `plugin/docs/PITFALLS.md` | "scheduled function set to public", "schedule expression in local time confused with UTC", "schedule input larger than EventBridge's 256KB limit" |
| `plugin/CLAUDE.md` | Architecture diagram |
| `plugin/AGENTS.md` | Same |
| `docs/GLOSSARY.md` | Add `scheduled function`, `EventBridge Scheduler`, `schedule expression` |
| `website/docs/functions.html` | Append the scheduled-function section |
| `cli/README.md` | One paragraph on scheduling, points at `boa.json` reference |

## Files That Change

```
NEW:
  plans/functions-scheduler.md                                   ← this file
  cli/lib/functions/schedule.mjs                                 # validate expressions, generate nested stack
  cli/__tests__/functions-schedule.test.mjs
  cli/__tests__/functions-runtime-schedule.test.mjs

MODIFIED:
  cli/lib/functions/discover.mjs                                 # parse + validate schedule, scheduleTimezone, scheduleInput
  cli/lib/functions/registry.mjs                                 # registry entry includes schedule fields (for `boa functions list`)
  cli/lib/functions/runtime/ctx.mjs                              # schedule case → role='service_role', _scheduledAt → req.body._scheduledAt
  cli/lib/functions/runtime/handler.mjs                          # propagate scheduledAt into req.body
  cli/commands/deploy.mjs                                        # generate + upload nested stack, pass to main stack
  cli/commands/functions.mjs                                     # `list` shows schedule column
  cli/commands/verify.mjs                                        # parity check between local schedules and deployed nested stack
  cli/templates/backend.yaml                                     # FunctionsScheduleRole + FunctionsSchedulesStack reference
  plugin/skills/boa/SKILL.md                                     # scheduled-functions section
  plugin/skills/boa/evals/evals.json                             # +1 schedule scenario
  plugin/docs/FUNCTIONS.md                                       # scheduled-functions reference
  plugin/docs/ARCHITECTURE.md
  plugin/docs/PITFALLS.md
  plugin/CLAUDE.md
  plugin/AGENTS.md
  docs/GLOSSARY.md
  website/docs/functions.html
  cli/README.md
```

## Testing

### Unit tests (added to `cli/__tests__/`)

| File | What it asserts |
|------|-----------------|
| `functions-schedule.test.mjs` | Discovery accepts `cron(...)`, `rate(...)`, `at(...)` expressions. Rejects unknown forms. Rejects `schedule` set without `visibility: "private"` with a specific error. `scheduleTimezone` defaults to `"UTC"`. `scheduleInput` defaults to `{}`. The generated nested-stack YAML contains one `AWS::Scheduler::Schedule` per scheduled function with the correct expression, TZ, and target Input JSON. Multiple schedules produce stable, ordered output (deterministic deploy). |
| `functions-runtime-schedule.test.mjs` | Runtime tests for the schedule trust path: <ul><li>Event with `_boaInternal.scheduledAt` and no `apikey` header → `ctx.role === 'service_role'`, `ctx.userId === ''`, `ctx.jwt === ''`</li><li>`req.body._scheduledAt` matches the value from `_boaInternal.scheduledAt`</li><li>If a malicious caller direct-invokes the Lambda with `_boaInternal.scheduledAt` set but the IAM principal is wrong, this is out of scope for the runtime test (it is a CFN-trust property covered by the integration test below)</li><li>A direct invoke without `scheduledAt` still routes the existing way (private function path is unchanged)</li></ul> |
| `functions-discover.test.mjs` (existing — extend) | Add cases: invalid TZ, invalid cron, schedule on a public function, schedule on a function whose name has spaces (rejected by existing name pattern, no new behavior). |
| `verify-functions.test.mjs` (existing — extend) | Reports drift when a `schedule` field exists locally but the nested stack has no matching schedule (and vice versa). |

### Negative / security tests

- A scheduled function with `visibility: "public"` fails deploy at the discovery step, before any AWS API call. Asserts the exact error message.
- The generated nested-stack template, when run through CloudFormation's `validate-template`, has `FlexibleTimeWindow: OFF` for every schedule. (Run via the same dry-run mechanism the existing CFN tests use, or a static YAML parse test.)
- A schedule expression with embedded shell metacharacters (`'; rm -rf /'`) is rejected by the expression validator before reaching CFN.

### Integration test (live deploy, added to `plans/e2e-testing-plan.md`)

A live happy path against a real BOA stack, after the existing functions E2E:

1. Add `functions/scheduled-tick/boa.json` with `"schedule": "rate(1 minute)"` and `"visibility": "private"`. Handler writes a row to a `_schedule_ticks` table with `now()`.
2. `boa deploy`
3. Wait 90 seconds. Query the table — expect ≥ 1 row.
4. `aws scheduler get-schedule --name <stack>-scheduled-tick` returns the schedule with `State: ENABLED`.
5. Edit `boa.json` to change to `"rate(5 minutes)"`. `boa deploy`. The schedule expression in CFN now matches.
6. Remove the `schedule` field. `boa deploy`. The schedule resource is gone from the nested stack. The function still exists (now invocable only by direct invoke).
7. Delete `functions/scheduled-tick/`. `boa deploy`. Both the function and any prior schedule are gone.
8. `boa teardown` cleans up.

### Manual test entries (added to `plans/manual-test-plan.md`)

- "Scheduled function: rate expression" — happy path.
- "Scheduled function: cron with TZ" — verify TZ honored against AWS console.
- "Scheduled function: rejected when public" — deploy fails before AWS call.
- "Scheduled function: scheduleInput delivered" — function reads `req.body.foo === 'bar'`.
- "Scheduled function: drift detection" — manually delete the EventBridge schedule via console, run `boa verify`, expect a drift warning.

### Skill-level eval (added to `plugin/skills/boa/evals/evals.json`)

| Scenario | Pass criteria |
|----------|---------------|
| "Add a function that runs every weekday at 9am Pacific and sends a digest email" | Agent creates `functions/<name>/` with `visibility: "private"`, `schedule: "cron(0 9 ? * MON-FRI *)"`, `scheduleTimezone: "America/Los_Angeles"`, lists the SES secret. Does **not** set visibility to public. Does **not** wire up an HTTP route. Tells the developer the next invocation time. |

### Launch gate

Scheduled functions ships when:
- All new and extended `cli/__tests__/` files pass in CI.
- The live E2E test (steps 1-8) runs green on a clean account, including drift detection.
- The new eval passes with the production skill in a fresh Claude Code session.
- All five manual test entries pass on the pre-launch run.

## Implementation Order

1. **Discovery + validation, with tests.** Extend `discover.mjs` to read `schedule`, `scheduleTimezone`, `scheduleInput`. Enforce `visibility: "private"`. Validate expression syntax with a small parser (cron/rate/at). `functions-schedule.test.mjs` covers it. No CFN, no live AWS yet.
2. **Nested-stack generation, with tests.** `cli/lib/functions/schedule.mjs` writes deterministic YAML. Test against fixture inputs.
3. **Runtime auth path, with tests.** `ctx.mjs` returns `service_role` for the scheduled case. `handler.mjs` injects `_scheduledAt` into `req.body`. `functions-runtime-schedule.test.mjs` covers it.
4. **CloudFormation.** Add `FunctionsScheduleRole` and `FunctionsSchedulesStack` reference in `backend.yaml`. Deploy command uploads the nested template.
5. **Deploy wiring.** `deploy.mjs` generates and uploads the nested template alongside the functions zip; passes the S3 URL as a parameter to the main stack.
6. **CLI list/verify, with tests.** `boa functions list` shows the schedule column. `boa verify` adds the parity check.
7. **E2E + manual + evals.** Add the integration test, manual entries, and the eval scenario.
8. **Skill and docs.** Update `SKILL.md`, `FUNCTIONS.md`, `PITFALLS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, website page, glossary. Per the saved "never document what you haven't deployed" rule, docs go last.

## Out of Scope

- **Per-schedule overrides for timeout/memory.** Schedules use the same shared FunctionsLambda timeout/memory as everything else. A 30-second cap applies. Workloads that need more belong in `boa extend isolated-functions`.
- **Backfills / catch-up.** EventBridge Scheduler does not retroactively invoke missed runs. BOA does not paper over this — if a schedule was disabled or the account was paused, missed runs are missed.
- **State / locking across runs.** Two overlapping invocations of the same scheduled function are possible (long run > schedule interval). The function is responsible for its own idempotency. BOA does not add a distributed lock.
- **One-time `at(...)` expressions on `boa init`.** Init does not scaffold a one-time scheduled function; only the recurring example. One-time schedules are still supported via `boa.json`.
- **Cron preview in CLI.** No "next 5 firings" output. The skill teaches agents to use AWS console or `aws scheduler get-schedule` for that.
- **Disabling without removing.** `state: "DISABLED"` is not surfaced in `boa.json`. To disable, comment out `schedule` and redeploy.

## Open Questions

- **Nested stack vs. parameterized resource list:** chosen nested stack to avoid cluttering `backend.yaml`. Reconsider if nested stacks add operational pain (slower deploys, deeper failure modes) during implementation.
- **Where the scheduled-time context attribute lives in `req`:** `req.body._scheduledAt` (chosen) keeps user code framework-agnostic. Alternative: `req.scheduledAt` as a top-level field. The body approach loses precedence to a `scheduleInput` that happens to define `_scheduledAt`. Resolve during implementation: if `scheduleInput` carries `_scheduledAt`, the runtime overwrites it (BOA's value is authoritative).
- **Per-function vs. shared schedule role:** chosen one shared `FunctionsScheduleRole` invokable by every schedule. Per-function roles would tighten blast radius but multiply IAM resources. Revisit if fine-grained audit becomes a customer ask.
