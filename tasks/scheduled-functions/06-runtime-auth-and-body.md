# Task 06: Runtime Schedule Auth & Body Injection

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Modify the Functions runtime so that events with
`_boaInternal.scheduledAt` get `service_role` auth (without
requiring an apikey) and have `_scheduledAt` injected into
`req.body`.

## Target Tests

From `cli/__tests__/functions-runtime-schedule.test.mjs`:

- All "Schedule auth path" tests (scheduledAt ->
  service_role, no scheduledAt unchanged)
- All "_scheduledAt injection" tests (timestamp injected,
  payload preserved, user value overwritten, empty payload
  handled)
- All "Direct invoke unchanged" tests (no scheduledAt ->
  no _scheduledAt, routing still works)

## Implementation

### `cli/lib/functions/runtime/ctx.mjs`

In `extractAuth()` (lines 23-59), add a short-circuit at
the very beginning, before `let role = 'anon'` (line 29):

```javascript
if (event._boaInternal && event._boaInternal.scheduledAt) {
  return { role: 'service_role', userId: '', email: '', jwt: '' };
}
```

This must be the first check in `extractAuth`. EventBridge
Scheduler is in BOA's trust boundary (only the
`FunctionsScheduleRole` IAM role can direct-invoke the
Lambda), so the presence of `scheduledAt` in the
`_boaInternal` envelope is sufficient for service_role
trust.

**Important:** `extractAuth` is an internal (non-exported)
function called by `buildCtx`. The E2E tests validate this
behavior through `buildCtx` (the public interface).
Verify that `extractAuth` receives the full `event` object
(not just headers). Based on the current code, `extractAuth`
is called from `buildCtx` and receives the event. If it only
receives headers, the function signature must be adjusted.

### `cli/lib/functions/runtime/handler.mjs`

After the `_boaInternal` request construction (around lines
64-70, after `body: parseBody(event)`), add `_scheduledAt`
injection:

```javascript
if (event._boaInternal && event._boaInternal.scheduledAt) {
  req.body = typeof req.body === 'object' ? req.body : {};
  req.body._scheduledAt = event._boaInternal.scheduledAt;
}
```

This goes after the `req` object is built but before
`buildCtx()` is called. The `parseBody` function already
returns `event.payload || {}` for `_boaInternal` events, so
`req.body` will be the `scheduleInput` object. The
`_scheduledAt` injection overwrites any user-provided
`_scheduledAt` in `scheduleInput` (BOA's value is
authoritative per design).

## Acceptance Criteria

- All "Schedule auth path" tests pass
- All "_scheduledAt injection" tests pass
- All "Direct invoke unchanged" tests pass
- Existing runtime tests still pass (direct invoke with
  apikey, public function HTTP routing, JWT auth)
- No changes to the existing direct-invoke behavior for
  events without `scheduledAt`

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If `extractAuth` does not receive the full event object
  (only receives headers), adjust the approach by passing
  the full event, but preserve backward compatibility with
  all existing callers.
- If `handler.mjs` already injects `_scheduledAt`,
  escalate -- the design assumes it does not.
