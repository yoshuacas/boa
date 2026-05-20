# Task 09: Functions List & Verify Schedule Support

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Extend `boa functions list` to show a schedule column and
`boa verify` to detect schedule drift between local config
and deployed state.

## Target Tests

Extend existing test files:

- `cli/__tests__/verify-functions.test.mjs`: schedule
  drift detection cases (local schedule missing from
  deployed, deployed schedule missing from local,
  expression mismatch)

These test cases should be added to the existing test file
as new describe blocks.

## Implementation

### `cli/commands/functions.mjs` -- List Changes

In the `listFunctions()` function (lines 8-45), extend
the tabular output:

1. After computing `name`, `visibility`, `status` for each
   function, add schedule from the registry or local
   descriptor:

   ```javascript
   const schedule = fn.schedule || '';
   ```

2. Adjust column formatting to include a fourth column
   when at least one function has a schedule:

   ```javascript
   const hasSchedules = functions.some(f => f.schedule);
   // ...
   const line = `  ${name.padEnd(16)}${visibility.padEnd(10)}${status.padEnd(14)}${hasSchedules ? schedule : ''}`;
   ```

3. Only show the schedule column when at least one
   function is scheduled (avoid empty trailing whitespace
   for non-scheduled projects).

**Expected output:**
```
Functions:

  hello           public    deployed
  daily-cleanup   private   deployed   cron(0 9 * * ? *)
  health-check    private   deployed   rate(5 minutes)

Run 'boa deploy' to sync local changes.
```

### `cli/commands/verify.mjs` -- Schedule Drift

Add a new verification step after the existing functions
verification. The check:

1. Get local scheduled functions from `discover()`.
2. Get deployed schedules by describing the nested stack
   resources (via
   `aws cloudformation describe-stack-resources` on the
   schedules nested stack).
3. Compare:
   - Local schedule exists but no deployed schedule ->
     drift (missing)
   - Deployed schedule exists but no local schedule ->
     drift (orphaned)
   - Expression mismatch between local and deployed ->
     drift

4. Output follows existing pass/fail format:

   ```
   [PASS] Schedules in sync
   ```

   or:

   ```
   [FAIL] Schedule drift detected:
     daily-cleanup: local cron(0 9 * * ? *) != deployed cron(0 8 * * ? *)
   ```

**Implementation detail:** To get the deployed schedule
expression, use `aws scheduler get-schedule` for each
expected schedule (name pattern: `${projectName}-${fnName}`).
Compare the returned `ScheduleExpression` against the local
value.

**Depends on:** Task 05 (registry includes schedule fields
for list display), Task 07 (CloudFormation resources for
verify drift detection), Task 08 (deploy wiring for
schedule deployment)

## Test Requirements

Add to `cli/__tests__/verify-functions.test.mjs`:

- Given a local function with
  `schedule: "cron(0 9 * * ? *)"` and no matching
  deployed schedule, when verify runs, then it reports
  drift
- Given a deployed schedule with no matching local
  function schedule, when verify runs, then it reports
  drift
- Given a local function with
  `schedule: "cron(0 9 * * ? *)"` and a deployed
  schedule with `cron(0 8 * * ? *)`, when verify runs,
  then it reports expression mismatch
- Given all local schedules matching deployed schedules,
  when verify runs, then it reports "Schedules in sync"

## Acceptance Criteria

- `boa functions list` shows schedule column when
  schedules exist
- `boa functions list` does not show schedule column when
  no schedules exist
- `boa verify` reports schedule drift correctly
- New verify tests pass
- Existing functions list and verify tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If `verify.mjs` uses a different pattern for checks than
  described (e.g., a check registry or plugin system),
  follow the existing pattern rather than adding a
  standalone check.
