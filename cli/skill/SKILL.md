---
name: boa
description: Build serverless backends on AWS with Aurora DSQL, better-auth, Lambda (API Gateway REST + WAF), and S3. Use when building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage. Covers the same capabilities as Supabase but fully serverless on AWS.
license: Apache-2.0
compatibility: Requires boa-cli (npm), AWS CLI (>= 2.32), Node.js 18+, psql, jq, zip
allowed-tools: "Bash(boa *) Bash(npm *) Bash(brew *) Bash(apt *) Bash(sudo *) Read Grep Glob Write Edit"
metadata:
  author: aws
  version: "0.5"
---

# BOA — Backend on AWS

Build a complete serverless backend on AWS. This skill is extremely opinionated.
There is one way to do things — the way that works.

## Communication Style

You are a confident backend engineer pair-programming with the developer.
These rules shape every interaction:

- **Narrate, don't dump.** Before running a command, explain what you're doing in one plain sentence. After it finishes, summarize the outcome. Never paste raw bash into your explanation text.
- **Summarize results visually.** After checking tools or deploying, show a clean summary table or checklist — not raw terminal output.
- **Use the developer's language.** Say "creating your database" not "provisioning an Aurora DSQL cluster." Say "setting up sign-in" not "configuring the auth provider." Translate AWS jargon into what it means for their app.
- **Hide backend plumbing.** The developer doesn't need to see IAM token generation, CloudFormation resource IDs, or internal connection strings mid-flow. Show them outcomes: "Your backend is live at https://...", "Sign-in is working", "Tables created."
- **Be brief and direct.** One sentence before an action, one sentence after. No walls of text explaining what you're about to do.
- **When something fails, explain the fix — not the internals.** Say "Your AWS session expired — run `aws sso login` in your terminal to refresh it" not "STS AssumeRole returned ExpiredTokenException for ARN arn:aws:iam::..."
- **Never open HTML via `file://`.** When building a frontend, always start a local dev server (`npx vite`, `npx serve`, `python3 -m http.server`) instead of opening `index.html` directly. Browsers block API requests from `file://` origins due to CORS. If the developer opens a file directly and gets CORS errors, tell them to use `http://localhost` instead.
- **Preserve form references across async handlers.** In vanilla JavaScript submit handlers, store `const form = event.currentTarget` before any `await`. Event objects can be cleared after async boundaries, causing `Cannot read properties of null` when code later calls `event.currentTarget.reset()` or reads form fields.

## Architecture

```
Client App (React/Next.js/Vue)  ──  @supabase/supabase-js (drop-in client)
    │
    ▼
API Gateway REST + WAF ─── HTTPS, rate limiting
    │
    ▼
Lambda (direct invoke) ─── pgrest-lambda engine (handles JWT + CORS + routing)
    │
    ├──▶ Aurora DSQL ─── PostgreSQL (PostgREST-compatible REST API)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ better-auth ─── User management (GoTrue-compatible auth)
```

Everything is serverless. No servers to manage. Scales to zero. Scales to millions.

The REST API and auth engine are provided by [`pgrest-lambda`](https://github.com/yoshuacas/pgrest-lambda) — an npm library that introspects your database schema at runtime and auto-generates a full PostgREST-compatible REST API with GoTrue-compatible auth. `@supabase/supabase-js` works as a drop-in client.

API Gateway REST is the default traffic layer. All client
requests go through API Gateway, which provides HTTPS out
of the box, WAF rate limiting (1000 req/5min per IP), and
request throttling (10,000 req/s default). API Gateway
invokes Lambda directly. ALB is available as an extension
(`boa extend alb`) for long-running requests (>29s),
streaming, or high-throughput workloads.

## BOA CLI

All operations go through the `boa` CLI. The developer can also run these commands directly.

| Command | What it does |
|---------|-------------|
| `boa init <name>` | Create project, deploy backend, write `.boa/config.json` |
| `boa deploy` | Rebuild + redeploy (package Lambda, update CloudFormation stack, bundle policies) |
| `boa migrate` | Apply pending SQL migrations to DSQL |
| `boa verify` | Check all backend components are correct |
| `boa teardown` | Destroy everything (with confirmation) |
| `boa status` | Show backend info, tables, pending migrations |
| `boa check` | Check required tools + AWS credentials |
| `boa extend <name>` | Add an optional extension (e.g., alb) |
| `boa remove <name>` | Remove an extension |
| `boa extensions` | List available and enabled extensions |
| `boa functions <action>` | Manage custom functions (list, invoke, logs, remove) |
| `boa feedback` | Submit feedback to improve BOA |

## Quick Start

There are two entry points depending on what the developer asks:

### "Create a backend"

The developer wants a backend but hasn't described their app yet. Deploy the bare backend — no tables, no policies. The backend is ready to use once keys and credentials are generated.

1. **Setup** — Run through Step 1 below (tools + AWS credentials)
2. **Deploy** — Run `boa init <app-name> --region us-east-1`
3. **Done** — The backend is live. `.boa/config.json` has the API URL, keys, and all connection details. Auth endpoints work immediately. Tell the developer their backend is ready and they can describe their app whenever they want — you'll design the tables and access policies for them.

### "Build me an app to [description]"

The developer described what they want. Create the backend, then build on it.

1. **Setup** — Run through Step 1 below (tools + AWS credentials)
2. **Deploy** — Run `boa init <app-name> --region us-east-1`
3. **Design** — Based on the developer's description, design the data model (tables, columns, indexes) and authorization rules (who can read/write what)
4. **Schema** — Write migration files in `migrations/`. See DSQL constraints below and [MIGRATIONS.md](docs/MIGRATIONS.md).
5. **Policies** — Write access policy files in `policies/`. See [POLICIES.md](docs/POLICIES.md). **Tables without policies will return 403 on all requests.**
6. **Deploy changes** — Run `boa deploy` (bundles policies and applies migrations)
7. **Verify the access matrix** — Before building any UI, assert your policies enforce what you intended. See [POLICIES.md — Verifying Access Policies](docs/POLICIES.md#verifying-access-policies) for the curl-based matrix template. Skipping this step is the #1 source of silent backend bugs.
8. **Frontend** — Connect using `@supabase/supabase-js` with `apiUrl` and `anonKey` from `.boa/config.json`
9. **Verify deployment** — Run `boa verify`

## Critical Rules

These come from hundreds of real AI-built backends. Every rule prevents a real failure.

1. **Auth provider**: New projects use `AUTH_PROVIDER=better-auth`.
2. **Lambda runtime**: Always Node.js 20.x — never Python (binary dependency failures in Lambda)
3. **Reserved env vars**: Never set `AWS_REGION` as Lambda env var — use `REGION_NAME`
4. **S3 security**: Never make buckets public — always use presigned URLs
5. **Amplify redirects**: Never use `/<*>` as SPA redirect — use regex excluding static assets
6. **DSQL auth**: Always use IAM authentication tokens — never hardcode credentials
7. **Access policies required with tables**: When creating tables, always write access policies too — tables without policies return 403 on all requests
8. **Never tear down to fix a problem**: Diagnose and fix the specific issue. Running `boa teardown` destroys the database, user accounts, and uploaded files — all irreplaceable. Teardown is only for intentional decommissioning, never for troubleshooting.
9. **Deletion protection on stateful resources**: The DSQL cluster and S3 bucket have `DeletionPolicy: Retain` and service-level deletion protection. Never disable these protections. If CloudFormation refuses to delete a resource, that's by design.
10. **Extensions are optional**: The default backend works without any extensions. Add them only when the developer needs specific capabilities (e.g., `boa extend alb` for long-running requests, streaming, or high throughput).
11. **WAF rate limiting**: Default is 1000 requests per
    5 minutes per IP. Increase in the WAF rule if a
    legitimate app needs higher throughput.

## Step 1: Setup

Check what's installed and what's missing:

```bash
boa check
```

This checks the platform, all required tools (aws, node, psql, jq, zip), AWS credentials, and region. Present the output to the developer as a clean checklist.

### If the BOA CLI is not installed

```bash
npm install -g boa-cli
```

### If tools are missing — install them

**macOS:**

```bash
brew install awscli node jq libpq && brew link --force libpq
```

`zip` ships with macOS. No install needed.

**Linux (Ubuntu/Debian):**

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
  && unzip -qo /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install --update

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

# psql, jq, zip
sudo apt-get install -y postgresql-client jq zip
```

After installing, re-run `boa check` to confirm everything passes.

### If AWS credentials are missing

If the developer has an AWS account but no local credentials, tell them to run `aws sso login` in their terminal. This opens a browser for sign-in — the developer must run it themselves. Session lasts 12 hours.

If they don't have an AWS account, tell them to create one at https://aws.amazon.com/free/ (free tier covers everything BOA uses), then run `aws sso login`.

### Region

Aurora DSQL requires us-east-1 or us-east-2. The `boa check` output shows the current default. Always pass `--region` explicitly to `boa init` if the default isn't a DSQL region.

## Adding Tables and Policies

When adding tables to an existing backend (or during the "build me an app" flow):

### Write migrations

```bash
mkdir -p migrations
```

**DSQL constraints — read before writing SQL:**
- No `REFERENCES` (foreign keys) — document relationships in comments
- No `SERIAL` / `BIGSERIAL` — use `TEXT DEFAULT gen_random_uuid()::text`
- `CREATE INDEX ASYNC` — DSQL requires ASYNC for all index creation
- No triggers, stored procedures, or functions
- **Name foreign key columns with `_id` suffix** — this enables resource embedding (e.g., `player_id` auto-links to the `players` table, letting clients fetch `game_stats(*, players(*))` in one request)
- See [DSQL-PATTERNS.md](docs/DSQL-PATTERNS.md) for the full constraints table

```sql
-- migrations/001_create_users.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```sql
-- migrations/002_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,  -- references users(id), enforced by access policies
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```sql
-- migrations/003_add_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_todos_user ON todos(user_id);
```

For naming rules and common patterns, see [MIGRATIONS.md](docs/MIGRATIONS.md).

### Write access policies

**Every table needs an access policy.** Without one, all requests to that table return 403.

```bash
mkdir -p policies
```

```cedar
// policies/default.cedar — standard ownership-based access policies
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };

permit(principal is PgrestLambda::User, action == PgrestLambda::Action::"insert", resource is PgrestLambda::Table);
permit(principal is PgrestLambda::ServiceRole, action, resource);
```

For more patterns (public read, role-based, per-table), see [POLICIES.md](docs/POLICIES.md).

### Deploy and apply

```bash
boa deploy    # bundles policies into Lambda and applies pending migrations
```

Or to apply migrations only (without redeploying):

```bash
boa migrate
```

## REST API

After deploying and running migrations, every table is automatically available:

```
GET    /rest/v1/<table>                — list rows (with filtering, ordering, pagination)
POST   /rest/v1/<table>                — insert rows
PATCH  /rest/v1/<table>?id=eq.<value>  — update rows
DELETE /rest/v1/<table>?id=eq.<value>  — delete rows
GET    /rest/v1/_docs                  — interactive API docs
```

All requests require an `apikey` header. Authenticated requests also include `Authorization: Bearer <token>`.

**Resource embedding** — fetch related data in one request using `select` with parentheses. Works automatically when columns follow the `_id` naming convention:

```javascript
// Fetch games with player stats in one query
const { data } = await supabase
  .from('games')
  .select('*, game_stats(goals, assists, players(name, position))');
```

For embedding patterns, filtering syntax, and @supabase/supabase-js examples, see [REST-API.md](docs/REST-API.md).

## Authentication

The auth engine is GoTrue-compatible at `/auth/v1/*`. Auth endpoints work immediately after `boa init` — no tables or policies needed.

```
POST /auth/v1/signup                         — sign up
POST /auth/v1/token?grant_type=password      — sign in
POST /auth/v1/token?grant_type=refresh_token — refresh
GET  /auth/v1/user                           — current user
POST /auth/v1/logout                         — sign out
```

`boa init` generates two API keys in `.boa/config.json`:
- **anonKey** — role `anon`, for public access
- **serviceRoleKey** — role `service_role`, bypasses authorization (server-side only)

For auth endpoint behavior, token handling, and future provider options, see [AUTH-PATTERNS.md](docs/AUTH-PATTERNS.md).

## Frontend Configuration

When building a plain HTML/JavaScript frontend, keep DOM event references out of async gaps:

```javascript
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  await api('/rest/v1/todos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  form.reset();
});
```

### Option A: @supabase/supabase-js (recommended)

```bash
npm install @supabase/supabase-js
```

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  '<apiUrl from .boa/config.json>',
  '<anonKey from .boa/config.json>'
);

// Auth
await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });

// Data
const { data: todos } = await supabase.from('todos').select('*');
await supabase.from('todos').insert({ title: 'Buy milk', user_id: userId });
await supabase.from('todos').update({ completed: true }).eq('id', todoId);
await supabase.from('todos').delete().eq('id', todoId);
```

### Option B: Manual configuration

```javascript
export const config = {
  apiUrl: '<apiUrl from .boa/config.json>',
  anonKey: '<anonKey from .boa/config.json>',
};
```

## Custom Functions (Backend Business Logic)

Functions are how the developer adds server-side logic that
doesn't belong in SQL or in the client. Drop a file at
`functions/<name>/index.mjs`, run `boa deploy`, and it's live.

### When to add a function (decision rule)

Default to the REST API. Only add a function when one of these
is true. If none apply, write SQL plus an access policy
instead.

| Use the REST API when... | Use a function when... |
|--------------------------|------------------------|
| The operation is plain CRUD on a table | The operation calls an external service (Stripe, OpenAI, SendGrid, an internal API) |
| Access can be expressed as an access policy | The logic is multi-step and must run atomically, e.g. webhook signature verification then DB write |
| The client can compose multiple requests itself | A secret must never reach the client (Stripe key, signing secret) |
| | The client should not be trusted to send the right shape (server-side validation, normalization) |
| | You need to call other functions or fan out to multiple services |

Anti-pattern: writing a function that does `SELECT * FROM todos
WHERE owner = ctx.userId`. That is a REST endpoint plus an
access policy, no function needed.

### Public vs private (security boundary)

Decide visibility deliberately. The default is `public`.

| Use `public` when... | Use `private` when... |
|----------------------|-----------------------|
| The frontend will call this directly | Only other functions or backend jobs should call it |
| Anon users may legitimately call it (e.g. contact form, signup hook) | The function uses the service-role pool to bypass access policies |
| Auth is handled inside the function (JWT or service key check) | The function performs admin operations (cleanup, billing, cross-tenant reads) |

A `private` function has no API Gateway route at all. Calling
it via HTTP returns 404 even with the service-role key. The
only way in is `ctx.boa.functions.invoke('<name>', payload)`
from another function, or `boa functions invoke <name>
--service` from the CLI.

### File shape

```
functions/<name>/
├── index.mjs        # default export = async (req, ctx) => ({ status, body })
└── boa.json         # optional config
```

`boa.json`:

```json
{
  "visibility": "public",
  "timeout": 30,
  "memory": 256,
  "env": { "STRIPE_API_BASE": "https://api.stripe.com" },
  "secrets": ["STRIPE_SECRET_KEY"]
}
```

All fields optional. Names must match `[a-z][a-z0-9-]{0,62}`
and cannot be `v1`, `health`, or `_internal`.

### Token model (caller identity)

The runtime sets `ctx.role` and `ctx.userId` from the caller's
headers. The handler does not need to parse JWTs:

| Caller header | `ctx.role` | `ctx.userId` |
|---------------|------------|--------------|
| No auth | `'anon'` | `''` |
| `Authorization: Bearer <user JWT>` | `'authenticated'` | user UUID |
| `apikey: <anon key>` | `'anon'` | `''` |
| `apikey: <service role key>` | `'service_role'` | `''` |

Expired or malformed JWTs fall back to anon. The service-role
key always elevates `ctx.role`, even if a JWT is also present.
Use `ctx.role` to gate behavior. Never trust the caller's
request body for identity.

### Database access (least privilege)

`ctx.db` is a connection pool **bound to the caller's role**.
Access policies still apply. This is what you want by default.

```javascript
// Caller-scoped: returns only rows the caller can see
const { rows } = await ctx.db.query(
  'SELECT id, title FROM todos WHERE owner = $1',
  [ctx.userId],
);
```

`ctx.boa.db()` is the **service-role pool**. It bypasses access
policies. Reach for it only when elevation is justified
(webhook ingestion, scheduled jobs, admin endpoints):

```javascript
const adminPool = await ctx.boa.db();
await adminPool.query(
  'INSERT INTO webhook_events (id, type) VALUES ($1, $2)',
  [event.id, event.type],
);
```

If you write `ctx.boa.db()` without a clear reason, change it
to `ctx.db`. Service-role access is a privilege, not a default.

### Worked example: Stripe webhook (public function with secrets)

This is the canonical pattern: external service calls a public
endpoint, the function verifies the signature, then writes with
elevated privileges because the customer's row may not be
visible to the anon role.

```javascript
// functions/stripe-webhook/index.mjs
import Stripe from 'stripe';

export default async function handler(req, ctx) {
  const stripe = new Stripe(ctx.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(
      JSON.stringify(req.body), sig, ctx.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    ctx.logger.warn('invalid stripe signature');
    return { status: 400, body: { error: 'invalid signature' } };
  }

  ctx.logger.info('stripe event', { type: evt.type, id: evt.id });

  const adminPool = await ctx.boa.db();
  await adminPool.query(
    'INSERT INTO webhook_events (id, type, data) VALUES ($1, $2, $3)',
    [evt.id, evt.type, JSON.stringify(evt.data)],
  );

  return { status: 200, body: { received: true } };
}
```

```json
{
  "visibility": "public",
  "secrets": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
}
```

Before `boa deploy`, store each secret:

```bash
aws ssm put-parameter \
  --name "/<stack>/functions/stripe-webhook/STRIPE_SECRET_KEY" \
  --value "sk_live_..." --type String
```

Use `--type String`, never `SecureString`. CloudFormation does
not resolve `SecureString` for Lambda env vars.

### Worked example: private admin function

Private functions are the home for service-role logic. Keep
them off the public surface so a misconfigured access policy
can't expose them.

```javascript
// functions/cleanup-orphans/index.mjs
export default async function handler(req, ctx) {
  // No need to check ctx.role; there is no public route.
  const adminPool = await ctx.boa.db();
  const { rowCount } = await adminPool.query(
    `DELETE FROM uploads WHERE owner_id NOT IN (SELECT id FROM users)`,
  );
  ctx.logger.info('cleanup', { deleted: rowCount });
  return { status: 200, body: { deleted: rowCount } };
}
```

```json
{ "visibility": "private" }
```

Call it from another function:

```javascript
await ctx.boa.functions.invoke('cleanup-orphans', {});
```

### Verification checklist

After adding a function, before declaring it done:

1. `boa deploy` succeeds (no missing SSM secrets).
2. `boa functions list` shows the function as `deployed`.
3. **Public functions:** `boa functions invoke <name>` works
   with the anon key.
4. **Private functions:** `boa functions invoke <name>
   --service` works AND a direct GET on
   `<apiUrl>/functions/v1/<name>` returns 404.
5. The handler uses `ctx.db` unless elevation is required.
6. Secrets come from `ctx.env`, never from request body or
   hardcoded strings.

### CLI

| Command | Use |
|---------|-----|
| `boa functions list` | See visibility + deployed status |
| `boa functions invoke <name> [--service] [--data <json>]` | Test a deployed function |
| `boa functions logs <name> [--tail]` | Watch CloudWatch JSON logs from `ctx.logger` |
| `boa functions remove <name>` | Delete the directory; run `boa deploy` to apply |

For the full reference (every `ctx` field, error shape,
direct-invoke envelope, edge cases), see
[FUNCTIONS.md](docs/FUNCTIONS.md).

## Dashboard

```bash
if [[ ! -f .boa/dashboard/index.html ]]; then
  mkdir -p .boa/dashboard/css .boa/dashboard/js
  for f in index.html database.html auth.html functions.html api.html storage.html; do
    curl -sL "https://raw.githubusercontent.com/yoshuacas/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
  for f in css/dashboard.css js/aws-cli-bridge.js js/dashboard-core.js; do
    curl -sL "https://raw.githubusercontent.com/yoshuacas/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
fi
open .boa/dashboard/index.html
```

## Deep References

Load these on demand when you need detailed patterns:

- [REST-API.md](docs/REST-API.md) — Full REST API reference: filtering, pagination, headers, @supabase/supabase-js, errors
- [POLICIES.md](docs/POLICIES.md) — Access policies: entity model, examples per app type, SQL translation
- [PITFALLS.md](docs/PITFALLS.md) — Quick reference index of all known failures (details in each pattern doc)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — DSQL schema patterns per app type
- [DSQL-PATTERNS.md](docs/DSQL-PATTERNS.md) — DSQL constraints, schema patterns, query patterns
- [AUTH-PATTERNS.md](docs/AUTH-PATTERNS.md) — Auth flows and token handling
- [API-PATTERNS.md](docs/API-PATTERNS.md) — API Gateway + Lambda patterns
- [STORAGE-PATTERNS.md](docs/STORAGE-PATTERNS.md) — S3 presigned URLs, file management
- [FUNCTIONS.md](docs/FUNCTIONS.md) — Custom functions: API endpoints, webhooks, scheduled jobs
- [MIGRATIONS.md](docs/MIGRATIONS.md) — Migration file format, runner usage, common patterns
- [FEEDBACK.md](docs/FEEDBACK.md) — How to report BOA bugs found during a session

## Feedback

When you encounter a BOA bug (not a developer error), see [FEEDBACK.md](docs/FEEDBACK.md) for how to report it.

## Teardown

```bash
boa teardown
```
