# Task 08: CLI Subcommands (list, invoke, logs, remove)

**Agent:** implementer
**Design:** docs/design/functions.md

**Depends on:** Task 05, Task 06

## Objective

Create the `boa functions` CLI subcommand with `list`,
`invoke`, `logs`, and `remove` actions, and register it in
the main CLI entry point.

## Target Tests

From `functions-cli-list.test.mjs`:
- Lists deployed + local functions with status
- Matching registries -> exit 0
- Divergence -> shows sync message

From `functions-cli-invoke.test.mjs`:
- Default invoke uses anon credentials
- --service flag uses service key
- --data parsed as JSON payload
- Invalid --data JSON -> error with parse message
- Unknown function name -> error listing available functions

## Implementation

### cli/commands/functions.mjs

Export a default async function that dispatches on the first
positional argument:

```javascript
export default async function functions(args) {
  const [action, ...rest] = args;
  switch (action) {
    case 'list': return listFunctions(rest);
    case 'invoke': return invokeFunctions(rest);
    case 'logs': return logsFunctions(rest);
    case 'remove': return removeFunctions(rest);
    default:
      console.error(`Unknown action: ${action}`);
      console.error('Usage: boa functions <list|invoke|logs|remove>');
      process.exit(1);
  }
}
```

### listFunctions()

1. Discover local functions via `discoverFunctions()`.
2. Fetch deployed registry (via Lambda
   `get-function-configuration` environment variables or
   invoke with a special flag -- check existing patterns).
3. Merge and display:
   ```
   Functions:

     hello           public    deployed
     stripe-webhook  private   deployed
     new-func        public    local only

   Run 'boa deploy' to sync local changes.
   ```
4. Exit 0 if in sync, include sync message if diverged.

### invokeFunctions(args)

Parse args: `<name> [--service] [--data <json>]`

1. Validate function name exists in deployed registry.
   If not: `Error: Unknown function '<name>'. Available: ...`
2. Parse `--data` value as JSON. If invalid:
   `Error: Invalid JSON in --data: <native parse error>`
3. Invoke Lambda:
   - Default: include anon key in headers.
   - `--service`: include service role key.
   - Pass `--data` as body payload.
4. Print the response body to stdout.

### logsFunctions(args)

Parse args: `<name> [--tail]`

1. Use CloudWatch Logs `filter-log-events` or
   `tail-log-events` on the functions log group.
2. Filter by `function` field matching the name.
3. If `--tail`: use `--follow` pattern (poll loop).

### removeFunctions(args)

Parse args: `<name>`

1. Verify `functions/<name>/` exists locally.
2. Delete the directory.
3. Print:
   ```
   Removing function '<name>'...
     Deleted functions/<name>/
     Run 'boa deploy' to update the deployed stack.
   ```

### cli/bin/boa.mjs

Register the `functions` command in the command dispatch.
Add it alongside existing commands (init, deploy, migrate,
etc.):

```javascript
case 'functions':
  return (await import('../commands/functions.mjs')).default(rest);
```

## Acceptance Criteria

- All `functions-cli-list.test.mjs` tests pass
- All `functions-cli-invoke.test.mjs` tests pass
- `boa functions` is recognized by the CLI entry point
- Error messages match the design document exactly
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the CLI argument parsing pattern differs from the
  existing commands, follow the established pattern rather
  than introducing a new one.
