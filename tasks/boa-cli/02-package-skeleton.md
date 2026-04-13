# Task 02: Package Skeleton and Entry Point

**Agent:** implementer
**Design:** docs/design/boa-cli.md

## Objective

Create the `cli/` package structure with `package.json`,
the entry point `bin/boa.mjs` with command dispatch, and
the output formatting helper `lib/output.mjs`.

## Target Tests

From `cli/__tests__/cli.test.mjs`:
- `boa --version` prints version string and exits 0
- `boa -v` prints version string and exits 0
- `boa --help` prints usage text containing "Commands:"
  and exits 0
- `boa -h` prints usage text and exits 0
- `boa` with no arguments prints usage text and exits 0
- `boa frobnicate` prints "Unknown command: frobnicate"
  to stderr and exits 1
- `boa frobnicate` stderr contains "Run 'boa --help' for
  usage."
- `boa --help` lists all seven commands: init, deploy,
  migrate, verify, teardown, status, check
- `boa --help` contains "--version" and "--help" in Options

## Implementation

### cli/package.json

Create per the design's Package Configuration section:

```json
{
  "name": "boa-cli",
  "version": "0.1.0",
  "description": "CLI for BOA (Backend on AWS) serverless backends",
  "type": "module",
  "bin": {
    "boa": "./bin/boa.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "bin/",
    "commands/",
    "lib/",
    "templates/"
  ],
  "keywords": ["aws", "serverless", "backend", "cli"],
  "license": "MIT"
}
```

### cli/bin/boa.mjs

Create the entry point per the design's Entry Point section.
Must include a `#!/usr/bin/env node` shebang. Key behaviors:

1. `--version` / `-v`: read version from `../package.json`,
   print it, exit 0.
2. `--help` / `-h` / no command: print help text listing
   all commands and options, exit 0.
3. Known command: dynamic import from `../commands/<cmd>.mjs`
   and call the default export with remaining args.
4. Unknown command: print error to stderr, suggest
   `--help`, exit 1.

The help text must include the full command list from the
design's Command Overview section.

No argument parsing framework. Each command receives its
`args` array and parses its own flags.

### cli/lib/output.mjs

Create per the design's Output Module section with these
exports:
- `ok(msg)` -- prints `  [OK] <msg>`
- `pass(msg)` -- prints `  [PASS] <msg>`
- `fail(msg)` -- prints `  [FAIL] <msg>`
- `skip(msg)` -- prints `  [skip] <msg>`
- `error(msg)` -- prints `Error: <msg>` to stderr
- `header(title)` -- prints a boxed header with `=` lines

### Stub command files

Create empty stub files so the entry point's dynamic import
does not fail during testing. Each stub exports a default
async function that throws "not implemented":
- `cli/commands/init.mjs`
- `cli/commands/deploy.mjs`
- `cli/commands/migrate.mjs`
- `cli/commands/verify.mjs`
- `cli/commands/teardown.mjs`
- `cli/commands/status.mjs`
- `cli/commands/check.mjs`

For `init.mjs`, also export `validateStackName` and
`validateRegion` stubs (throw "not implemented").

For `migrate.mjs`, also export `sha256` stub.

### Directory structure

```
cli/
├── __tests__/        (created in Task 01)
├── bin/
│   └── boa.mjs
├── commands/
│   ├── init.mjs      (stub)
│   ├── deploy.mjs    (stub)
│   ├── migrate.mjs   (stub)
│   ├── verify.mjs    (stub)
│   ├── teardown.mjs  (stub)
│   ├── status.mjs    (stub)
│   └── check.mjs     (stub)
├── lib/
│   └── output.mjs
└── package.json
```

Make `bin/boa.mjs` executable (`chmod +x`).

## Acceptance Criteria

- All cli.test.mjs tests pass.
- `node cli/bin/boa.mjs --version` prints `0.1.0`.
- `node cli/bin/boa.mjs --help` prints the command list.
- `node cli/bin/boa.mjs unknown` exits 1 with error message.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
