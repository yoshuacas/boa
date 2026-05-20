# Task 03: Integrate Schedule Validation into Discovery

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Extend `cli/lib/functions/discover.mjs` to parse schedule
fields from `boa.json`, enforce the private-visibility
invariant, validate expressions and timezones, and include
schedule data in returned descriptors.

## Target Tests

From `cli/__tests__/functions-schedule.test.mjs`:

- All "Visibility enforcement" tests (schedule + public
  rejected, schedule + private accepted, schedule +
  default visibility rejected)
- All "Schedule fields in descriptor" tests (all three
  fields present, defaults applied, null when no
  schedule)
- All "Invalid schedule in discovery" tests (invalid
  expression error, invalid timezone error)

## Implementation

Modify `cli/lib/functions/discover.mjs`:

1. Add import at top:
   ```javascript
   import { validateScheduleExpression, validateTimezone }
     from './schedule.mjs';
   ```

2. After existing config parsing (around line 45, after
   `visibility`, `timeout`, `memory`, `env`, `secrets`
   extraction), add schedule field extraction:

   ```javascript
   const schedule = config.schedule || null;
   const scheduleTimezone = config.scheduleTimezone || 'UTC';
   const scheduleInput = config.scheduleInput || {};
   ```

3. Add validation block (after the existing validation
   section, before pushing to the descriptors array):

   ```javascript
   if (schedule) {
     if (visibility !== 'private') {
       errors.push(
         `Scheduled function '${name}' must be private.\n` +
         `  Functions with a schedule cannot have visibility: "public".\n` +
         `  Set "visibility": "private" in functions/${name}/boa.json.`
       );
     }
     const exprResult = validateScheduleExpression(schedule);
     if (!exprResult.valid) {
       errors.push(
         `Invalid schedule expression '${schedule}'.\n` +
         `  ${exprResult.error}`
       );
     }
     if (scheduleTimezone !== 'UTC') {
       const tzResult = validateTimezone(scheduleTimezone);
       if (!tzResult.valid) {
         errors.push(
           `Invalid scheduleTimezone '${scheduleTimezone}'.\n` +
           `  ${tzResult.error}`
         );
       }
     }
   }
   ```

4. Add schedule fields to the returned descriptor object:

   ```javascript
   {
     name, visibility, timeout, memory, env, secrets, path,
     schedule,
     scheduleTimezone,
     scheduleInput,
   }
   ```

**Depends on:** Task 02 (schedule.mjs must exist)

## Test Requirements

If `cli/__tests__/functions-discover.test.mjs` exists,
extend it with schedule-related cases (invalid TZ, invalid
cron, schedule on public function, schedule fields present
in descriptor). These supplement the E2E tests in
`functions-schedule.test.mjs` by validating the discovery
module in isolation.

## Acceptance Criteria

- All "Visibility enforcement" tests pass
- All "Schedule fields in descriptor" tests pass
- All "Schedule fields ignored without schedule" tests pass
- All "Invalid schedule in discovery" tests pass
- Existing `functions-discover.test.mjs` tests still pass
- No warnings or lint errors

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If `discover.mjs` already imports or references schedule
  validation, escalate -- the design assumes it does not
  exist yet.
