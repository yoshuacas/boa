# Database

Your database is PostgreSQL. You write standard SQL — `CREATE TABLE`, `INSERT`, `SELECT`, `UPDATE`, `DELETE` — everything you already know. BOA runs it on AWS. It costs nothing when idle and handles traffic growth without configuration.

Every table you create becomes a REST endpoint automatically. No routes, no controllers, no ORM configuration.

## Quick example

```sql
-- migrations/001_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

After running `boa deploy`, this table is immediately queryable:

```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', userId)
```

No additional code needed. pgrest-lambda reads your schema and generates the REST API at runtime.

## What's different from standard PostgreSQL

Your database is PostgreSQL-compatible but not feature-identical. These differences matter:

| Feature | Standard PostgreSQL | Your database | What to do instead |
|---------|-------------------|------|-------------------|
| `SERIAL` / `BIGSERIAL` | Supported | Not supported | Use `TEXT DEFAULT gen_random_uuid()::text` |
| Foreign keys (`REFERENCES`) | Supported | Not supported | Name columns with `_id` suffix for auto-linking (see below) |
| `CREATE INDEX` | Synchronous | Must use `ASYNC` | `CREATE INDEX ASYNC IF NOT EXISTS ...` |
| Stored procedures | Supported | Not supported | Write a Lambda function |
| Triggers | Supported | Not supported | Write a Lambda function |
| Row-Level Security | Supported | Not supported | Use access policies |
| DDL transactions | Supported | Not supported | DDL is auto-committed; use `IF NOT EXISTS` for safety |

Everything else works: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, transactions (DML), unique constraints, check constraints, `JSONB`, GIN indexes, `gen_random_uuid()`, `NOW()`, and standard aggregate functions.

## Relationships without foreign keys

Your database doesn't support `REFERENCES`, but BOA makes relationships work through naming conventions. Name your foreign key columns with an `_id` suffix that matches the referenced table:

```sql
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,  -- links to users.id
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT NOT NULL,  -- links to posts.id
  user_id TEXT NOT NULL,  -- links to users.id
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

pgrest-lambda detects the `_id` columns and enables resource embedding — you can fetch related data in a single request:

```javascript
// Fetch posts with their comments and comment authors
const { data } = await supabase
  .from('posts')
  .select('*, comments(*, users(display_name))')
```

This is equivalent to SQL joins but handled through the REST API.

## Connecting to your database

**From your frontend** — use `@supabase/supabase-js`. It calls the REST API, which pgrest-lambda translates into SQL. This is the recommended approach for all client-side code.

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(config.apiUrl, config.anonKey)
const { data } = await supabase.from('todos').select('*')
```

**From your terminal** — use `boa status` to see your tables, or connect directly with psql:

```bash
boa status
```

**From Lambda functions** — for complex queries beyond the REST API, connect with the `pg` library using IAM auth tokens. See [Connecting from Lambda](/docs/database/connecting).

## Cost

Your database includes a free tier of 100,000 DPUs (database processing units) and 1 GB of storage. A typical productivity app with 1,000 customers stays well within the free tier.

See the [pricing calculator](/pricing) for costs at your scale.

## Next step

**[Create your tables](/docs/database/tables)** — learn the schema patterns that work with your database and pgrest-lambda.
