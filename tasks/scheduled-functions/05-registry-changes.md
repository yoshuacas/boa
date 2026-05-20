# Task 05: Registry Schedule Fields

**Agent:** implementer
**Design:** docs/design/scheduled-functions.md

## Objective

Extend `cli/lib/functions/registry.mjs` to include
`schedule` and `scheduleTimezone` in registry entries for
scheduled functions.

## Target Tests

From `cli/__tests__/functions-schedule.test.mjs`:

- All "Registry inclusion" tests (scheduled function has
  `schedule` and `scheduleTimezone`; non-scheduled
  function does not)

## Implementation

Modify `cli/lib/functions/registry.mjs` in the
`buildRegistry()` function. Where the registry entry is
built (around line 13-17), conditionally spread schedule
fields:

```javascript
registry[name] = {
  visibility,
  timeout,
  memory,
  ...(descriptor.schedule && {
    schedule: descriptor.schedule,
    scheduleTimezone: descriptor.scheduleTimezone,
  }),
};
```

The descriptor passed to `buildRegistry()` must now
include the schedule fields added in Task 03. Verify
that `buildRegistry()` receives the full descriptor
(not a subset). If it receives individual fields, adjust
the destructuring.

**Note:** `scheduleInput` is intentionally NOT included
in the registry. It is only needed at deploy time for
the nested-stack template, not at runtime.

**Depends on:** Task 03 (descriptors must include schedule
fields)

## Acceptance Criteria

- All "Registry inclusion" tests pass
- Existing registry tests still pass
- Non-scheduled functions are unaffected (no new keys)

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If the registry already includes schedule fields,
  escalate -- the design assumes it does not.
