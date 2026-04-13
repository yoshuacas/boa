# Connecting to Your Database

Most of the time, you don't connect to the database directly. Your frontend uses `@supabase/supabase-js` to call the REST API, and pgrest-lambda translates those calls into SQL. Direct connections are for debugging, data inspection, and custom Lambda functions.

## From the Frontend (Supabase Client)

This is the recommended path for all frontend operations. The Supabase client talks to the REST API, which pgrest-lambda translates into SQL queries against your database:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.API_URL,   // API Gateway URL
  process.env.ANON_KEY   // Public API key
)

// Query data
const { data, error } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(20)

// Insert
await supabase.from('todos').insert({ user_id: userId, title: 'New task' })

// Resource embedding (auto-resolved via _id naming convention)
const { data: posts } = await supabase
  .from('posts')
  .select('*, comments(*), users(display_name)')
```

**If the API returns 401:** Your auth token has expired. Call `supabase.auth.getSession()` to refresh it. The Supabase client handles token refresh automatically in most cases, but if you're storing tokens manually, you'll need to re-authenticate.

**If the API returns 404 for a table you just created:** The PostgREST schema cache may be stale. Run `boa migrate` (which refreshes the cache) or redeploy.

## From the CLI (psql)

Use `boa status` to connect and inspect your tables:

```bash
boa status
```

Or connect manually with `psql`:

```bash
# Generate an IAM auth token
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname "$DSQL_ENDPOINT" --region "$REGION")

# Connect with psql
PGPASSWORD="$TOKEN" psql \
  "host=$DSQL_ENDPOINT port=5432 dbname=postgres user=admin sslmode=require"
```

**If the connection fails with an auth error:** IAM tokens expire in 15 minutes. Generate a fresh token and try again. Also verify that your AWS credentials have `dsql:DbConnectAdmin` permission.

**If `psql` is not installed:** Install the PostgreSQL client. On macOS: `brew install libpq`. On Amazon Linux: `sudo yum install postgresql15`.

## From Lambda

For custom Lambda functions that need direct SQL access (joins, aggregations, batch operations), initialize the connection pool outside the handler so it persists across warm invocations:

```javascript
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import pg from 'pg';

const { Pool } = pg;

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
    max: 5,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  });

  // Token refresh — only needed for long-running Lambda functions.
  // Most Lambda invocations complete in under 30 seconds and don't
  // need this. Add it if your function runs for minutes (e.g., batch
  // processing with reserved concurrency).
  setInterval(async () => {
    const newToken = await signer.getDbConnectAdminAuthToken();
    pool.options.password = newToken;
  }, 10 * 60 * 1000); // Refresh every 10 min (tokens valid 15 min)

  return pool;
}

export async function handler(event) {
  const db = await getPool();
  const result = await db.query('SELECT * FROM todos WHERE user_id = $1', [userId]);
  return { statusCode: 200, body: JSON.stringify(result.rows) };
}
```

### Key details

- **Pool outside the handler** — Lambda reuses the execution environment across invocations. The pool is created once and reused.
- **`max: 5`** — keep the pool small. Lambda functions are short-lived; too many connections waste database resources.
- **`REGION_NAME`** — never use `AWS_REGION` as an environment variable name. It is reserved by Lambda. Use `REGION_NAME` instead.

**If the connection times out:** Check that your Lambda function has network access to the database endpoint (VPC configuration or public endpoint) and that `connectionTimeoutMillis` is set high enough for cold starts.

**If you see "password authentication failed":** The IAM token has expired. This happens when a Lambda instance sits idle for more than 15 minutes and then receives a request. The `setInterval` refresh prevents this for active instances. For infrequently invoked functions, regenerate the token on each invocation instead of caching it.

## Connection Limits

Your database does not have a fixed connection limit, but each Lambda invocation should use a small pool (`max: 1-5`). At high concurrency, hundreds of Lambda instances may each hold connections. Your database handles this, but keep per-function pools small.

## Environment Variables

Every BOA Lambda function gets these automatically:

| Variable | Description |
|----------|-------------|
| `DSQL_ENDPOINT` | Database cluster hostname |
| `REGION_NAME` | AWS region (use this, not `AWS_REGION`) |
| `API_URL` | BOA REST API endpoint |
| `ANON_KEY` | Public API key |
| `SERVICE_ROLE_KEY` | Admin API key (bypasses policies) |
| `BUCKET_NAME` | S3 storage bucket name |

## Next Step

Start reading and writing data through the REST API. See [Querying Data](querying.md).
