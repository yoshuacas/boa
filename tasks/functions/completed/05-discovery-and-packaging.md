# Task 05: Discovery, Registry, and Packaging

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Create the modules that walk the `functions/` directory to
discover user functions, validate names and config, build the
routing registry, and package everything into a deployable zip.

## Target Tests

From `functions-discover.test.mjs`:
- Valid function discovered with defaults
- boa.json overrides applied
- Invalid name rejected with clear error
- Reserved names (v1, health, _internal) rejected
- Missing index.mjs rejected
- Missing SSM secret reported with path and hint
- Empty functions/ returns empty array
- Timeout below minimum rejected
- Memory above maximum rejected

From `functions-registry.test.mjs`:
- Registry contains all functions with correct fields
- Reserved name defense-in-depth rejection
- Empty list produces empty JSON object

From `functions-package.test.mjs`:
- Zip contains runtime files + all function files
- node_modules excluded
- Max timeout computed correctly
- Max memory computed correctly
- Deterministic zip hash
- Sibling files included

## Implementation

### cli/lib/functions/discover.mjs

```javascript
export async function discoverFunctions(projectRoot, opts = {}) {
  const functionsDir = path.join(projectRoot, 'functions');
  // ... walk directories, validate, return descriptors
}
```

1. List subdirectories of `functions/`.
2. For each directory:
   - Validate name: `[a-z][a-z0-9-]{0,62}` regex.
   - Reject reserved names: `v1`, `health`, `_internal`.
   - Check `index.mjs` exists.
   - Parse `boa.json` if present, apply defaults:
     - visibility: 'public'
     - timeout: 30 (validate 1-30)
     - memory: 256 (validate 128-1024)
     - env: {}
     - secrets: []
   - If `opts.validateSecrets` and secrets are declared,
     check SSM for each at `/<stackName>/functions/<name>/<secret>`.
     On missing, throw with the full path and the
     `aws ssm put-parameter` remediation command.
3. Return array of descriptors:
   `[{name, visibility, timeout, memory, env, secrets, path}]`

Error messages must match the design exactly:
- `Invalid function name '<name>'. Function names must match [a-z][a-z0-9-]{0,62}.`
- `Reserved function name '<name>'. Choose a different name.`
- Multi-line SSM error with the store command hint.

### cli/lib/functions/registry.mjs

```javascript
export function buildRegistry(descriptors) {
  // Returns { [name]: { visibility, timeout, memory } }
}
```

Defense-in-depth: also reject reserved names here.

### cli/lib/functions/package.mjs

```javascript
export async function packageFunctions(descriptors, opts = {}) {
  // Returns { zipPath, zipHash, maxTimeout, maxMemory }
}
```

1. Create temp directory.
2. Copy runtime files from `cli/lib/functions/runtime/`
   (`handler.mjs`, `ctx.mjs`, `boa-client.mjs`, `logger.mjs`).
3. For each descriptor, copy `functions/<name>/` contents
   (excluding `node_modules/`) into
   `<temp>/functions/<name>/`.
4. Write `_registry.json` via `buildRegistry()`.
5. Zip the temp directory.
6. Compute SHA-256 hash of the zip.
7. Compute max timeout and max memory across all functions.

Use the `archiver` npm package if available, or Node.js
built-in zlib. Check existing packaging code in
`cli/lib/deploy.mjs` or `cli/commands/deploy.mjs` for the
project's zip pattern.

## Acceptance Criteria

- All `functions-discover.test.mjs` tests pass
- All `functions-registry.test.mjs` tests pass
- All `functions-package.test.mjs` tests pass
- Error messages match design document exactly
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the project uses a specific zip library or pattern in
  existing deploy code, follow that pattern rather than
  introducing a new dependency.
