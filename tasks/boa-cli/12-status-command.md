# Task 12: status Command

**Agent:** implementer
**Design:** docs/design/boa-cli.md
**Depends on:** Task 03, Task 05

## Objective

Implement `cli/commands/status.mjs`, a new command (no
script equivalent) that shows stack info, database tables,
and pending migrations.

## Target Tests

No unit tests (this command connects to live DSQL).
Verified via manual integration testing.

## Implementation

Replace the stub in `cli/commands/status.mjs`:

1. Load config via `config.requireConfig()`. Read
   `stackName`, `region`, `apiUrl`, `dsqlEndpoint`,
   `deployedAt`.
2. Print header and stack info:
   ```
   ======================================
     BOA Status
   ======================================

     Stack:       my-app
     Region:      us-east-1
     API URL:     https://xxx...amazonaws.com/prod
     Deployed at: 2026-04-11T12:00:00Z
   ```
3. Generate DSQL auth token via
   `aws.dsqlGenerateAuthToken()`.
4. Query database tables using `pg_catalog` (DSQL
   compatible, same approach as PostgREST design):
   ```sql
   SELECT c.relname AS tablename
   FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
   ORDER BY c.relname
   ```
5. Query applied migrations:
   ```sql
   SELECT name, applied_at
   FROM _boa_migrations
   ORDER BY name
   ```
   Handle the case where `_boa_migrations` doesn't exist
   (no migrations have ever been run) -- treat as empty.
6. Scan `migrations/` directory for `.sql` files not in
   the applied list to find pending migrations.
7. Print formatted output matching the design example.

### Graceful degradation

Per the design's Open Question #4: if the database is
unreachable (e.g., credentials expired, network error),
degrade gracefully:
- Print stack info from config (always available).
- Print a note: `Database info unavailable (connection
  failed).`
- Do not exit 1; exit 0 with partial output.

Wrap the database queries in a try/catch. If any psql
command fails, show the config-based info and skip the
database sections.

### psql execution

Same connection approach as the migrate command:
```javascript
const token = aws.dsqlGenerateAuthToken(endpoint, region);
const connstr = `host=${endpoint} port=5432 dbname=postgres
  user=admin sslmode=require`;
const result = aws.exec(
  `psql "${connstr}" -t -A -c "${sql}"`,
  { env: { ...process.env, PGPASSWORD: token } }
);
```

Use `-t -A` flags for unformatted, tuple-only output
(easier to parse).

## Acceptance Criteria

- `node cli/bin/boa.mjs status` in a directory without
  config prints the config-not-found error and exits 1.
- Full status flow works against a deployed stack (manual
  integration test): shows tables, applied and pending
  migrations.
- When database is unreachable, command still shows config
  info and exits 0.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
