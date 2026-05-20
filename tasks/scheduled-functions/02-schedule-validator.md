# Task 02: Schedule Expression & Timezone Validator

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Create `cli/lib/functions/schedule.mjs` with
`validateScheduleExpression()` and `validateTimezone()`
functions that enforce schedule expression syntax and IANA
timezone names.

## Target Tests

From `cli/__tests__/functions-schedule.test.mjs`:

- All "Expression validation" tests (cron, rate, at
  accepted; invalid forms rejected; shell metacharacters
  rejected)
- All "Timezone validation" tests (valid IANA accepted;
  abbreviated forms rejected)

## Implementation

Create `cli/lib/functions/schedule.mjs` with:

```javascript
const CRON_RE = /^cron\(.+\)$/;
const RATE_RE = /^rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)$/;
const AT_RE = /^at\(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\)$/;
const SHELL_META = /[;&|`$'"\\<>]/;

export function validateScheduleExpression(expr) { ... }
export function validateTimezone(tz) { ... }
```

**Details:**

- `validateScheduleExpression`:
  1. Check `SHELL_META` first -- reject with "contains
     invalid characters" if matched.
  2. Test against `CRON_RE`, `RATE_RE`, `AT_RE` -- accept
     if any match.
  3. Otherwise reject with "must be cron(...), rate(...),
     or at(...)".
  4. Return `{ valid: true }` or
     `{ valid: false, error: '...' }`.

- `validateTimezone`:
  1. Use `Intl.supportedValuesOf('timeZone')` to get
     valid timezones.
  2. Return `{ valid: true }` if `tz` is in the list.
  3. Otherwise return
     `{ valid: false, error: 'Use an IANA timezone like "America/Los_Angeles" or "UTC"' }`.

**Note:** `SHELL_META` includes `<` and `>` to reject
EventBridge context attribute syntax
(`<aws.scheduler.scheduled-time>`) which is only valid in
the Target Input field, not user expressions.

## Acceptance Criteria

- All "Expression validation" tests pass
- All "Timezone validation" tests pass
- No existing tests broken

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
