# DSQL Patterns

Aurora DSQL-specific patterns for the BOA stack.

---

## Connecting to DSQL from Lambda

DSQL uses IAM authentication. Never hardcode credentials.

```javascript
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import pg from 'pg';

const { Pool } = pg;

// Initialize outside handler for connection reuse across invocations
const endpoint = process.env.DSQL_ENDPOINT;
const region = process.env.REGION_NAME;

let pool;

async function getPool() {
  if (pool) return pool;

  const signer = new DsqlSigner({ hostname: endpoint, region });
  const token = await signer.getDbConnectAdminAuthToken();

  pool = new Pool({
    host: endpoint,
    port: 5432,
    user: 'admin',
    password: token,
    database: 'postgres',
    ssl: { rejectUnauthorized: true },
    max: 5,                          // Lambda concurrency is per-instance
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  });

  // Refresh token before expiration (tokens valid 15 min)
  setInterval(async () => {
    const newToken = await signer.getDbConnectAdminAuthToken();
    pool.options.password = newToken;
  }, 10 * 60 * 1000); // refresh every 10 minutes

  return pool;
}
```

## Migrations

BOA uses file-based migrations with a tracking table. Never run DDL directly — write a numbered SQL file in `migrations/` and run the migration script.

See [MIGRATIONS.md](MIGRATIONS.md) for the complete guide: file naming, content rules, common patterns, and runner usage.

Quick summary: write numbered SQL files in `migrations/`, run `migrate.sh`. The runner tracks applied migrations in a `_boa_migrations` table and verifies checksums to prevent tampering.

## Row-Level Security (RLS)

DSQL supports PostgreSQL RLS policies. Use them for defense-in-depth (application-layer checks are primary).

```sql
-- Enable RLS on a table
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own items
CREATE POLICY items_isolation ON items
  USING (user_id = current_setting('app.user_id'));

-- Set the user context in Lambda before queries
-- pool.query("SET app.user_id = $1", [userId]);
```

**Note**: RLS in DSQL works the same as PostgreSQL. Set `app.user_id` via `SET` command at the start of each request, then all queries are automatically filtered.

## Common Query Patterns

### Pagination (cursor-based)

```sql
SELECT * FROM items
WHERE user_id = $1
  AND created_at < $2          -- cursor: last item's created_at
ORDER BY created_at DESC
LIMIT 20;
```

### Full-text search

```sql
-- Add a tsvector column
ALTER TABLE posts ADD COLUMN search_vector tsvector;
CREATE INDEX idx_posts_search ON posts USING gin(search_vector);

-- Update on insert/update (via trigger or application code)
UPDATE posts SET search_vector = to_tsvector('english', title || ' ' || content)
WHERE id = $1;

-- Search
SELECT * FROM posts
WHERE search_vector @@ plainto_tsquery('english', $1)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
LIMIT 20;
```

### Aggregation with materialized counts

Instead of `COUNT(*)` on every read, maintain denormalized counts:

```sql
-- When adding a like
BEGIN;
  INSERT INTO likes (user_id, post_id) VALUES ($1, $2);
  UPDATE posts SET like_count = like_count + 1 WHERE id = $2;
COMMIT;

-- When removing a like
BEGIN;
  DELETE FROM likes WHERE user_id = $1 AND post_id = $2;
  UPDATE posts SET like_count = like_count - 1 WHERE id = $2;
COMMIT;
```

## DSQL Limitations to Know

1. **No stored procedures/functions**: Use Lambda for business logic, not database-side PL/pgSQL
2. **No triggers**: Implement trigger-like behavior in Lambda handlers
3. **No sequences**: Use `gen_random_uuid()` for primary keys instead of `SERIAL`
4. **No advisory locks**: Use application-level locking if needed
5. **Single database per cluster**: All tables share the `postgres` database
6. **IAM auth tokens expire in 15 minutes**: Refresh them in long-running processes
