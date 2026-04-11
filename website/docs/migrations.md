---
outline: deep
---

# Database Migrations

BOA uses file-based migrations to track every schema change. When your agent creates a table or adds a column, it writes a numbered SQL file. When you deploy to a new environment, those files replay in order to recreate the schema.

## Why file-based migrations?

- **Reproducible** — run the same migrations on dev, staging, and production to get identical schemas
- **Version-controlled** — migration files live in your Git repo alongside your application code
- **Agent-friendly** — coding agents write SQL files naturally; no ORM or migration framework to learn
- **Auditable** — every schema change has a file, a timestamp, and a checksum

## How it works

```
Developer: "Add a comments table"
    │
    ▼
Agent writes migrations/003_create_comments.sql
    │
    ▼
Agent runs migrate.sh
    │
    ▼
migrate.sh connects to DSQL via IAM auth
    │
    ├── Creates _boa_migrations tracking table (first run only)
    ├── Skips 001, 002 (already applied)
    ├── Applies 003_create_comments.sql
    ├── Records name + SHA-256 checksum
    └── Refreshes PostgREST schema cache
    │
    ▼
GET /rest/v1/comments now works immediately
```

No Lambda redeployment needed. The PostgREST engine discovers new tables automatically.

## Writing a migration

### File naming

Place migration files in a `migrations/` directory at your project root:

```
my-app/
├── .boa/config.json
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_create_todos.sql
│   └── 003_add_priority_to_todos.sql
└── src/
```

Rules:
- **Three-digit prefix** (`001`, `002`, `003`) — controls execution order
- **Underscore separator** and **descriptive name** — makes the intent clear
- **`.sql` extension**

### Content rules

Each file contains standard PostgreSQL DDL:

```sql
-- 001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Guidelines:
- **One logical change per file** — easier to track and debug
- **Use `IF NOT EXISTS` / `IF EXISTS`** — makes migrations safe to re-run as a fallback
- **No SERIAL** — Aurora DSQL doesn't support sequences; use `gen_random_uuid()::text` for IDs
- **No triggers or stored procedures** — DSQL doesn't support them; use Lambda for business logic

## Running migrations

### Directly

```bash
bash plugin/scripts/migrate.sh
```

### Via bootstrap (first deploy)

`bootstrap.sh` automatically runs `migrate.sh` after creating the stack. If you have migration files ready before your first deploy, they'll be applied immediately.

### Via deploy (subsequent deploys)

`deploy.sh` runs `migrate.sh` after every redeployment. New migration files added since the last deploy are applied automatically.

## Deploying to a new environment

This is where migrations pay off. To stand up an identical backend in a new region or account:

1. Run `bootstrap.sh` with a new stack name — creates all AWS resources
2. `bootstrap.sh` calls `migrate.sh` — replays every migration from `001` forward
3. The new environment has the exact same schema as the original

No manual SQL, no copying databases, no guesswork.

## Inspecting migration state

Connect to your DSQL cluster and query the tracking table:

```bash
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION")

PGPASSWORD="$TOKEN" psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require" \
  -c "SELECT name, applied_at FROM _boa_migrations ORDER BY name"
```

```
       name                |          applied_at
---------------------------+-------------------------------
 001_create_users.sql      | 2026-04-10 14:23:01.123456+00
 002_create_todos.sql      | 2026-04-10 14:23:01.456789+00
 003_add_priority.sql      | 2026-04-11 09:15:33.789012+00
```

## Fixing mistakes

Never edit a migration file after it has been applied. The runner computes a SHA-256 checksum of each file and will error if a previously applied file has changed.

Instead, write a new migration:

| Mistake | Fix migration |
|---------|---------------|
| Wrong column type | `ALTER TABLE todos ALTER COLUMN priority TYPE BIGINT` |
| Missing column | `ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date DATE` |
| Wrong table name | `ALTER TABLE todo RENAME TO todos` |
| Unwanted table | `DROP TABLE IF EXISTS temp_data` |

## Example walkthrough

Starting from a fresh project:

**1. First deploy — create users and todos**

```sql
-- migrations/001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```sql
-- migrations/002_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
```

Run `bootstrap.sh` — stack is created, both migrations are applied. The API immediately serves `/rest/v1/users` and `/rest/v1/todos`.

**2. A week later — add a priority column**

```sql
-- migrations/003_add_priority.sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
```

Run `migrate.sh` (or `deploy.sh`). Only `003` is applied. The API now accepts and returns the `priority` field.

**3. Deploy to staging**

Run `bootstrap.sh` with `--stack-name my-app-staging`. All three migrations replay in order. Staging has the same schema as production.
