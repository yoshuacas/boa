# Task 09: migrate Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 03, Task 05

## Objective

Implement `cli/commands/migrate.mjs`, porting
`plugin/scripts/migrate.sh` to Node.js. Applies pending
SQL migrations with SHA-256 checksums and tracks them in
a `_boa_migrations` table.

## Target Tests

From `cli/__tests__/checksum.test.mjs`:
- sha256 of known content produces correct hex digest
- Identical files produce identical digests
- Different files produce different digests
- Empty file produces the known empty-content digest

## Implementation

Replace the stub in `cli/commands/migrate.mjs`. The command
must export:
- Default export: `async function migrate(args)` -- the
  command handler.
- Named export: `sha256(filePath)` -- for testing.

### SHA-256 checksum

```javascript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}
```

This replaces the cross-platform `sha256sum`/`shasum`
detection in the shell script with native Node.js crypto.

### Argument parsing

- `--dry-run`: show what would run without executing.

### Steps (ported from migrate.sh)

1. Load config via `config.requireConfig()`. Read
   `dsqlEndpoint` and `region`. Error if `dsqlEndpoint`
   is null or missing:
   `Error: dsqlEndpoint not found in .boa/config.json`
2. Check for `migrations/` directory. If missing or empty,
   print `No migrations/ directory found. Nothing to
   migrate.` and exit 0.
3. Collect `.sql` files, sort alphabetically.
4. Generate DSQL IAM auth token via
   `aws.dsqlGenerateAuthToken()`.
5. Connect via `psql` and create tracking table:
   ```sql
   CREATE TABLE IF NOT EXISTS _boa_migrations (
     name TEXT PRIMARY KEY,
     checksum TEXT NOT NULL,
     applied_at TIMESTAMPTZ DEFAULT NOW()
   )
   ```
6. Load applied migrations (name|checksum pairs) via
   `psql` query.
7. For each `.sql` file:
   a. Compute SHA-256 via `sha256(filePath)`.
   b. If already applied: verify checksum matches. On
      mismatch, print error and exit 1:
      `[ERROR] <file> -- file modified after being applied`
      `Never edit an applied migration. Write a new
      migration to fix the issue.`
   c. If `--dry-run`, print what would run and skip.
   d. If not applied: run via `psql -f`, record in
      `_boa_migrations`.
8. If any migrations were applied and `apiUrl` +
   `serviceRoleKey` are in config, refresh PostgREST
   schema cache via GET `<apiUrl>/rest/v1/_refresh` using
   `curl` (same approach as the shell script).
9. Print summary: `Migration complete: N applied,
   M skipped.`

### psql execution

Use the same connection approach as the shell script:
```javascript
const token = aws.dsqlGenerateAuthToken(endpoint, region);
const connstr = `host=${endpoint} port=5432 dbname=postgres user=admin sslmode=require`;
aws.exec(`psql "${connstr}" -q -c "${sql}"`, {
  env: { ...process.env, PGPASSWORD: token }
});
```

### Error handling

- Modified applied migration: fatal error (exit 1) with
  the exact error messages from the design.
- Failed migration: fatal error (exit 1) with:
  `Migration failed. Fix the issue and run 'boa migrate'
  again.`
  `Migrations that were already applied before this run
  are safe.`

## Acceptance Criteria

- All checksum.test.mjs tests pass.
- `node cli/bin/boa.mjs migrate` in a directory without
  config prints the config-not-found error.
- Full migrate flow works against a real DSQL database
  (manual integration test).
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
