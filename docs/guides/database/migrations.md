# Migrations

Every schema change is a numbered SQL file. Write the file, run `boa migrate`, done. BOA tracks which migrations have been applied and prevents accidental modifications.

> **One SQL statement per file.** DSQL does not support multi-statement batching. If you put two statements in one file, the second one will fail silently or error. Split every `CREATE TABLE`, `ALTER TABLE`, and `CREATE INDEX` into its own file.

## The Rule

Never run DDL directly against DSQL. Always write a migration file, then run `boa migrate`.

This ensures every schema change is recorded, version-controlled, and replayable on new environments.

## File Location

```
your-project/
├── .boa/config.json
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_create_posts.sql
│   └── 003_add_posts_indexes.sql
└── ...
```

Place migration files in `migrations/` at the project root (same level as `.boa/`).

## File Naming

- **Three-digit prefix**: `001`, `002`, `003`, ...
- **Underscore separator** between prefix and description
- **Descriptive name** in lowercase with underscores
- **`.sql` extension**

Examples:
```
001_create_users.sql
002_create_todos.sql
003_add_priority_to_todos.sql
004_create_comments.sql
005_add_indexes.sql
```

## Content Rules

1. **One SQL statement per file** — DSQL does not support multi-statement batching
2. **One logical change per file** — don't combine table creation with unrelated index changes
3. **Use `IF NOT EXISTS` / `IF EXISTS`** — DDL is auto-committed in DSQL; this makes re-runs safe
4. **No `SERIAL` / `BIGSERIAL`** — use `TEXT DEFAULT gen_random_uuid()::text` for primary keys
5. **No `REFERENCES` (foreign keys)** — DSQL doesn't support foreign key constraints; use the `_id` naming convention for resource embedding
6. **`CREATE INDEX ASYNC`** — DSQL requires ASYNC for index creation
7. **No triggers, stored procedures, or functions** — implement in Lambda handlers

## Running Migrations

```bash
boa migrate
```

This is also called automatically by `boa init` and `boa deploy` when a `migrations/` directory exists.

## How the Runner Works

1. Reads `.boa/config.json` for DSQL endpoint and region
2. Generates an IAM auth token (valid 15 minutes)
3. Creates `_boa_migrations` tracking table if it doesn't exist
4. Reads `migrations/*.sql` files in sort order
5. For each file:
   - **Already applied**: verifies SHA-256 checksum matches — errors if the file was modified
   - **Pending**: executes via `psql`, records name + checksum in `_boa_migrations`
6. After applying new migrations, refreshes the PostgREST schema cache so new tables are immediately available via the API

## Common Patterns

### Create a table

```sql
-- 001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Create a table with a relationship

```sql
-- 002_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,  -- references users(id), enforced in app
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Add an index

```sql
-- 003_add_todos_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_todos_user ON todos(user_id);
```

### Add a column

```sql
-- 004_add_priority_to_todos.sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
```

### Drop a column

```sql
-- 005_drop_display_name.sql
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
```

### Rename a column

```sql
-- 006_rename_title_to_name.sql
ALTER TABLE todos RENAME COLUMN title TO name;
```

## What Happens When a Migration Fails

DDL in DSQL is auto-committed. If a `CREATE TABLE` executes successfully but a subsequent migration in the same deploy fails, the first table exists and cannot be rolled back.

**Consequences:**
- The `_boa_migrations` table records only the migrations that completed successfully.
- Your database may be in a partial state: some tables exist, others don't.
- Re-running `boa migrate` will skip already-applied migrations and retry the failed one.

**How to recover:**

1. Read the error message from `boa migrate`. Common causes: typo in SQL, missing `ASYNC` on index creation, multi-statement file.
2. If the failed migration was partially applied (e.g., table was created but it's not in `_boa_migrations`), add `IF NOT EXISTS` to the statement so it's safe to re-run.
3. If the migration is fundamentally wrong, fix the file (it hasn't been checksummed yet since it didn't complete), then re-run `boa migrate`.
4. If a previously-applied migration caused the problem, never edit it. Write a corrective migration instead (see Fixing Mistakes below).

**Best practice:** Always use `IF NOT EXISTS` and `IF EXISTS` in your DDL. This makes every migration idempotent, so partial failures are recoverable by simply re-running `boa migrate`.

## Fixing Mistakes

**Never edit an applied migration.** The runner detects checksum changes and will error.

Instead, write a new migration that corrects the problem:

| Mistake | Fix |
|---------|-----|
| Wrong column type | `ALTER TABLE ... ALTER COLUMN ... TYPE ...` |
| Missing column | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` |
| Wrong table name | `ALTER TABLE ... RENAME TO ...` |
| Unwanted table | `DROP TABLE IF EXISTS ...` |
| Unwanted column | `ALTER TABLE ... DROP COLUMN IF EXISTS ...` |

## Testing Migrations

There is no dry-run mode. DDL is auto-committed the moment it executes, so you cannot test migrations against your production database.

Instead, deploy a separate environment for testing:

```bash
# Create a dev environment
boa init --region us-east-1 --stack-name myapp-dev

# Test your migrations there
boa migrate

# When confident, deploy to production
boa init --region us-east-1 --stack-name myapp-prod
boa migrate
```

Each environment has its own DSQL cluster and its own `_boa_migrations` table, so the same migration files apply independently.

## Checking Migration State

```bash
boa status
```

Or query the tracking table directly:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION")

PGPASSWORD="$TOKEN" psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require" \
  -c "SELECT name, applied_at FROM _boa_migrations ORDER BY name"
```

## Multi-Environment Deployments

Each environment (dev, staging, prod) has its own DSQL cluster, so the same migration files apply independently. The migration runner tracks state per cluster in the `_boa_migrations` table.

```bash
# Deploy to staging
boa init --region us-east-1 --stack-name myapp-staging

# Deploy to production
boa init --region us-east-1 --stack-name myapp-prod
```

## Next Step

With your schema in place, connect to the database from your app. See [Connecting to Your Database](connecting.md).
