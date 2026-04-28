# Task 05: Extension List + Remove Commands

**Agent:** implementer
**Design:** docs/design/api-gateway-default.md
**Depends on:** Task 03

## Objective

Update the `boa extensions` list and `boa remove` commands
to reflect ALB as an extension and `api-gateway` as
deprecated.

## Target Tests

From `cli/__tests__/extensions-list-command.test.mjs`:

- `alb` appears in available extensions
- `api-gateway` appears with deprecated marker
- When `alb` is enabled, shows `[enabled]` status

From `cli/__tests__/remove-command.test.mjs`:

- All existing remove-command tests pass with `alb`
  replacing `api-gateway` as the extension name

## Implementation

### 1. `cli/commands/extensions.mjs` (or list command)

Locate the command that handles `boa extensions` output.
Update it to:

- List `alb` as an available extension with its
  description from the registry
- List `api-gateway` with a `(deprecated)` marker
- Show `[enabled]` next to `alb` when it's in the
  project's extensions array
- Handle the `deprecated` flag in the registry: when a
  registry entry has `deprecated: true`, append
  `(deprecated)` to its display line

### 2. `cli/commands/remove.mjs`

Update any hardcoded `api-gateway` references to use
`alb` as the primary extension name. The remove logic
should work generically against the registry, so this
may only require updating test fixtures rather than the
command itself. Verify by reading the existing code.

### 3. Handle legacy `api-gateway` in extensions array

When `extensions` array contains `'api-gateway'`, the
extensions list should show it as enabled but deprecated.
The `boa remove api-gateway` command should silently
remove it from the array (it's a no-op at the template
level since api-gateway is the default).

## Acceptance Criteria

- All target tests in `extensions-list-command.test.mjs`
  pass
- All target tests in `remove-command.test.mjs` pass
- `boa extensions` output shows `alb` and `api-gateway`
  with appropriate status markers
- No regressions in other test files

## Conflict Criteria

If all target tests already pass before any code changes
are made, investigate whether the tests are true positives
before marking the task complete.
