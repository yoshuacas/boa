# Task 02: TTY Guard

**Agent:** implementer
**Design:** docs/design/safe-teardown.md

## Objective

Block non-interactive invocations of `boa teardown` by
checking `process.stdin.isTTY` before any other work.

## Target Tests

From Task 01 (`cli/__tests__/teardown.test.mjs`):

- "refuses to run when stdin is not a TTY"
- "refuses piped input"
- "does not read config when stdin is not a TTY"

## Implementation

**File:** `cli/commands/teardown.mjs`

Add the TTY check as the very first statement inside the
`teardown()` function, before the config.read() call at
the current line 25.

```javascript
if (!process.stdin.isTTY) {
  console.error(
    'Error: boa teardown must be run interactively'
      + ' from a terminal.\n'
  );
  console.error(
    'Teardown is a destructive operation that requires'
      + ' human confirmation.'
  );
  console.error(
    'It cannot be run from scripts, pipes, or automated'
      + ' tools.'
  );
  process.exit(1);
}
```

`process.stdin.isTTY` is `true` when stdin is a terminal
and `undefined` otherwise. The `!` check catches both
`undefined` (pipe/file) and any falsy value.

No new imports needed. No helper extraction -- this is a
single call site.

## Acceptance Criteria

- Target tests pass
- Existing tests in `cli/__tests__/cli.test.mjs` still
  pass
- `echo "x" | node cli/bin/boa.mjs teardown` exits 1
  with the TTY error on stderr, empty stdout

## Conflict Criteria

If all target tests already pass before any changes,
investigate whether the tests are true positives (e.g.,
another guard already exists). Escalate if the tests
are not exercising the intended code path.
