# Database Migrations

File-based, forward-only migrations for Aurora DSQL.

---

## The Rule

Never run DDL directly against DSQL. Always write a migration file, then run `migrate.sh`.

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
- **Descriptive name** in lowercase
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

1. **One logical change per file** — don't combine table creation with unrelated index changes
2. **Use `IF NOT EXISTS` / `IF EXISTS`** — makes migrations idempotent as a safety net
3. **No SERIAL / BIGSERIAL** — DSQL doesn't support sequences; use `gen_random_uuid()::text` for primary keys
4. **No triggers** — implement trigger logic in Lambda handlers
5. **No stored procedures or functions** — DSQL doesn't support PL/pgSQL
6. **No advisory locks** — use application-level locking if needed
7. **Standard DDL works** — CREATE TABLE, ALTER TABLE, CREATE INDEX, DROP TABLE, etc.

## Running Migrations

```bash
bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/migrate.sh
```

The script is also called automatically by `bootstrap.sh` and `deploy.sh` when a `migrations/` directory exists.

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

### Create a table with a foreign key

```sql
-- 002_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
```

### Add a column

```sql
-- 003_add_priority_to_todos.sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
```

### Add an index

```sql
-- 004_add_todos_created_index.sql
CREATE INDEX IF NOT EXISTS idx_todos_created ON todos(created_at DESC);
```

### Drop a column

```sql
-- 005_drop_display_name.sql
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
```

### Drop a table

```sql
-- 006_drop_legacy_items.sql
DROP TABLE IF EXISTS legacy_items;
```

### Rename a column

```sql
-- 007_rename_title_to_name.sql
ALTER TABLE todos RENAME COLUMN title TO name;
```

## Fixing Mistakes

**Never edit an applied migration.** The runner detects checksum changes and will error.

Instead, write a new migration that corrects the problem:

| Mistake | Fix |
|---------|-----|
| Wrong column type | New migration: `ALTER TABLE ... ALTER COLUMN ... TYPE ...` |
| Missing column | New migration: `ALTER TABLE ... ADD COLUMN ...` |
| Wrong table name | New migration: `ALTER TABLE ... RENAME TO ...` |
| Unwanted table | New migration: `DROP TABLE IF EXISTS ...` |
| Unwanted column | New migration: `ALTER TABLE ... DROP COLUMN IF EXISTS ...` |

## Checking Migration State

Connect to DSQL and query the tracking table:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION")

PGPASSWORD="$TOKEN" psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require" \
  -c "SELECT name, applied_at FROM _boa_migrations ORDER BY name"
```

## DSQL-Specific Notes

- **DDL is auto-committed.** If a migration has multiple DDL statements and one fails, earlier statements are already committed. This is why `IF NOT EXISTS` / `IF EXISTS` matters — it makes re-running safe.
- **No transactional DDL.** Unlike standard PostgreSQL, you cannot wrap DDL in a transaction and roll it all back on failure.
- **IAM auth tokens expire in 15 minutes.** For large migration sets, the token may need refreshing. In practice this is rarely an issue since migrations run quickly.
