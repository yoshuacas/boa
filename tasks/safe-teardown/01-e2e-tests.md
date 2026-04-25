# Task 01: End-to-End Tests for Safe Teardown

**Agent:** implementer
**Design:** docs/design/safe-teardown.md

## Objective

Create a test file covering the two bugs fixed by safe
teardown: (1) retained resources surviving `boa teardown`,
and (2) non-interactive invocations bypassing the
confirmation prompt. Tests also cover the new deny rule
written by `boa init`.

## Test File Path

`cli/__tests__/teardown.test.mjs`

## Test Cases

Use `node:test` and `node:assert/strict`, matching the
existing style in `cli/__tests__/cli.test.mjs`. Use the
same `run()` helper pattern (spawning via `execFile`).

### TTY Guard

`describe('TTY guard')`:

- **refuses to run when stdin is not a TTY**: Run
  `boa teardown` via `execFile` (child process stdin is
  not a TTY). Assert exit code 1, stderr contains
  "must be run interactively from a terminal", stdout
  is empty (no warning box, no config loading).

- **refuses piped input**: Spawn `boa teardown` with a
  writable stdin pipe, write a stack name followed by
  newline, then close. Assert exit code 1, stderr
  contains "must be run interactively from a terminal".

- **does not read config when stdin is not a TTY**: Run
  `boa teardown` via `execFile` from a directory with
  no `.boa/config.json`. Assert exit code 1, stderr
  contains "must be run interactively" (not "config.json
  not found"). This confirms the TTY check runs before
  config loading.

### Claude Code Deny Rule

`describe('Claude Code deny rule')`:

- **init writes deny rule for boa teardown**: This test
  cannot run a full `boa init` (requires AWS). Instead,
  read `cli/commands/init.mjs` source and verify the
  JSON structure written to `.claude/settings.json`
  includes a `deny` array containing
  `'Bash(boa teardown*)'`. Use a regex or AST check on
  the source to confirm the deny array is present.

  > Warning: This test checks source code, not runtime
  > behavior. It verifies the template, not an actual
  > generated file. If `init.mjs` restructures how it
  > writes settings, this test may need updating.

- **deny array precedes allow array in settings output**:
  Read `cli/commands/init.mjs` source and verify that
  the `deny` key appears in the permissions object
  alongside `allow`. Claude Code evaluates deny before
  allow, so the key must exist.

## Implementation Notes

- `execFile` spawns the child with a non-TTY stdin by
  default, which is exactly what the TTY guard should
  reject. No mocking needed.
- For piped-input tests, use `child_process.spawn` with
  `{ stdio: ['pipe', 'pipe', 'pipe'] }` to get a
  writable stdin.
- The CLI entrypoint is at `cli/bin/boa.mjs` relative to
  the test file. Use the same path resolution as
  `cli/__tests__/cli.test.mjs`.
- Import `readFileSync` to read the init.mjs source for
  the deny-rule tests.

## Acceptance Criteria

- All tests compile and run with `node --test`
- All tests fail with clear messages indicating the
  missing functionality (TTY guard not yet implemented,
  deny rule not yet added)
- No test panics or produces cryptic errors

## Conflict Criteria

If any test that should fail instead passes, diagnose
why by following the "Unexpected test results" steps:
investigate the code path, verify the assertion targets
the right behavior, and attempt to rewrite the test to
isolate the intended path. Only escalate with a conflict
file if you cannot construct a well-formed test that
targets the desired behavior.
