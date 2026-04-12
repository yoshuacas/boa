---
name: boa
description: Build serverless backends on AWS with Aurora DSQL, Cognito, Lambda, API Gateway, and S3. Use when building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage. Covers the same capabilities as Supabase but fully serverless on AWS.
license: Apache-2.0
compatibility: Requires AWS CLI (>= 2.32), SAM CLI, Node.js 18+, psql, jq
allowed-tools: "Bash(sam *) Bash(aws *) Bash(node *) Bash(npm *) Bash(bash *) Bash(brew *) Bash(apt *) Bash(sudo *) Bash(psql *) Read Grep Glob Write Edit"
metadata:
  author: aws
  version: "0.2"
---

# BOA — Backend on AWS

Build a complete serverless backend on AWS. This skill is extremely opinionated.
There is one way to do things — the way that works.

## Architecture

```
Client App (React/Next.js/Vue)  ──  @supabase/supabase-js (drop-in client)
    │
    ▼
API Gateway (REST) ─── BOA Authorizer (JWT dual-layer validation)
    │
    ▼
Lambda (Node.js 20.x) ─── pgrest-lambda engine
    │
    ├──▶ Aurora DSQL ─── PostgreSQL (PostgREST-compatible REST API)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ Cognito ─── User management (GoTrue-compatible auth)
```

Everything is serverless. No servers to manage. Scales to zero. Scales to millions.

The REST API and auth engine are provided by [`pgrest-lambda`](https://github.com/yoshuacas/pgrest-lambda) — an npm library that introspects your database schema at runtime and auto-generates a full PostgREST-compatible REST API with GoTrue-compatible auth. `@supabase/supabase-js` works as a drop-in client.

## Quick Start — "Create a backend for my app"

When the developer asks to create a backend, follow these steps in order:

1. **Setup** — Run through Step 1 below to ensure all tools are installed and AWS credentials are active
2. **Deploy** — Run `bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/bootstrap.sh --stack-name <app-name>`
3. **Schema** — Write migration files for the app's data model, then run `bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/migrate.sh`
4. **Policies** — Write Cedar policies for authorization, then redeploy with `bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/deploy.sh`. See [POLICIES.md](../../docs/POLICIES.md) for entity model and examples.
5. **Frontend** — Connect the frontend using `@supabase/supabase-js` with `apiUrl` and `anonKey` from `.boa/config.json`
6. **Verify** — Run `bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/verify.sh`

Every table in the database is immediately available as a REST endpoint. Authorization policies control who can read and write what.

## Critical Rules

These come from hundreds of real AI-built backends. Every rule prevents a real failure.

1. **Cognito self-signup**: Always set `AllowAdminCreateUserOnly: false`
2. **Pre-signup trigger**: Always deploy a Lambda that auto-confirms users
3. **API Gateway type**: Always use REST (not HTTP API) — required for REQUEST-type Lambda authorizer
4. **Lambda runtime**: Always Node.js 20.x — never Python (binary dependency failures in Lambda)
5. **Reserved env vars**: Never set `AWS_REGION` as Lambda env var — use `REGION_NAME`
6. **S3 security**: Never make buckets public — always use presigned URLs
7. **Vite polyfill**: Always add `global: 'globalThis'` in Vite config for Cognito SDK
8. **Amplify redirects**: Never use `/<*>` as SPA redirect — use regex excluding static assets
9. **DSQL auth**: Always use IAM authentication tokens — never hardcode credentials

## Step 1: Setup

Run through this checklist. For each missing tool, install it before continuing.
The agent should detect the OS and run the appropriate install command automatically.

### 1a. Detect the platform

```bash
uname -s   # Darwin = macOS, Linux = Linux
```

### 1b. Check and install tools

Check each tool. Install any that are missing. Detect the OS from step 1a and use the appropriate install command.

| Tool | Check | macOS | Linux |
|------|-------|-------|-------|
| AWS CLI >= 2.32 | `aws --version` | `brew install awscli` | [awscli installer](https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip) |
| SAM CLI | `sam --version` | `brew install aws-sam-cli` | `pip3 install aws-sam-cli` |
| Node.js >= 18 | `node --version` | `brew install node` | [nodesource setup_20.x](https://deb.nodesource.com/setup_20.x) |
| psql | `psql --version` | `brew install libpq && brew link --force libpq` | `sudo apt-get install -y postgresql-client` |
| jq | `jq --version` | `brew install jq` | `sudo apt-get install -y jq` |

### 1c. AWS account

Check if the developer has an AWS account and active credentials:

```bash
aws sts get-caller-identity
```

If this succeeds, skip to Step 2.

If this fails, the developer needs to set up AWS access:

**If they have an AWS account but no local credentials:**

Tell the developer to run `aws login` in their terminal. This opens a browser where they sign in to AWS and temporary credentials are stored locally. The developer must run this command themselves — it requires interactive browser access. Session lasts 12 hours.

After they confirm login succeeded, verify with `aws sts get-caller-identity`.

**If they do NOT have an AWS account:**

Tell them to create one at https://aws.amazon.com/free/ (free tier covers everything BOA uses), then run `aws login`.

### 1d. Verify region

Aurora DSQL is available in us-east-1 and us-east-2:

```bash
aws configure get region
```

If the region is not us-east-1 or us-east-2, use `--region us-east-1` for all subsequent commands.

## Step 2: Deploy the Backend

```bash
bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/bootstrap.sh --stack-name "<app-name>"
```

This creates: DSQL cluster, Cognito user pool, Lambda functions (powered by pgrest-lambda), REST API Gateway with BOA authorizer, S3 bucket. It generates BOA keys (anonKey + serviceRoleKey) and writes everything to `.boa/config.json`.

## Step 3: Create the Database Schema

Write migration files instead of running SQL directly. Never connect to DSQL and run DDL by hand.

```bash
mkdir -p migrations
```

Write your schema as numbered SQL files:

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
  user_id TEXT NOT NULL,  -- references users(id), enforced by Cedar policies
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```sql
-- migrations/003_add_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_todos_user ON todos(user_id);
```

Run the migrations:

```bash
bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/migrate.sh
```

This applies pending migrations and refreshes the schema cache so new tables are immediately available via the REST API. For details on naming, format, and common patterns, see [MIGRATIONS.md](../../docs/MIGRATIONS.md).

## Step 4: Write Authorization Policies

Cedar policies in `policies/` control who can access what data. They are bundled with the Lambda at deploy time.

Without custom policies, pgrest-lambda uses sensible defaults: authenticated users can CRUD their own rows (where `user_id` matches), `service_role` bypasses everything, anonymous users are denied.

For most apps, write a policy file per table:

```bash
mkdir -p policies
```

```cedar
// policies/todos.cedar — users own their todos
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };

permit(principal is PgrestLambda::User, action == PgrestLambda::Action::"insert", resource is PgrestLambda::Table);
permit(principal is PgrestLambda::ServiceRole, action, resource);
```

After writing policies, redeploy: `bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/deploy.sh`

For the full Cedar entity model, more examples (public read/private write, role-based, multi-table), and how policies translate to SQL WHERE clauses, see [POLICIES.md](../../docs/POLICIES.md).

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

For filtering syntax, headers, @supabase/supabase-js examples, and error handling, see [REST-API.md](../../docs/REST-API.md).

## Authentication

The auth engine is GoTrue-compatible at `/auth/v1/*`:

```
POST /auth/v1/signup                         — register
POST /auth/v1/token?grant_type=password      — sign in
POST /auth/v1/token?grant_type=refresh_token — refresh
GET  /auth/v1/user                           — current user
POST /auth/v1/logout                         — sign out
```

The bootstrap script generates two API keys in `.boa/config.json`:
- **anonKey** — role `anon`, for public access
- **serviceRoleKey** — role `service_role`, bypasses authorization (server-side only)

For Cognito flows, social login, MFA, and token handling details, see [AUTH-PATTERNS.md](../../docs/AUTH-PATTERNS.md).

## Step 5: Frontend Configuration

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

For Vite: add `define: { global: 'globalThis' }` to `vite.config.js` (required for Cognito SDK).

## Step 6: Verify Deployment

```bash
bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/verify.sh
```

This checks: Cognito self-signup enabled, API returns 401 (not 500), S3 bucket is private.

## Dashboard

```bash
if [[ ! -f .boa/dashboard/index.html ]]; then
  mkdir -p .boa/dashboard/css .boa/dashboard/js
  for f in index.html database.html auth.html functions.html api.html storage.html; do
    curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
  for f in css/dashboard.css js/aws-cli-bridge.js js/dashboard-core.js; do
    curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/$f" -o ".boa/dashboard/$f"
  done
fi
open .boa/dashboard/index.html
```

## Deep References

Load these on demand when you need detailed patterns:

- [REST-API.md](../../docs/REST-API.md) — Full REST API reference: filtering, pagination, headers, @supabase/supabase-js, errors
- [POLICIES.md](../../docs/POLICIES.md) — Cedar authorization: entity model, examples per app type, SQL translation
- [PITFALLS.md](../../docs/PITFALLS.md) — Every known failure with severity and fix
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — DSQL schema patterns per app type
- [DSQL-PATTERNS.md](../../docs/DSQL-PATTERNS.md) — SQL patterns, migrations, RLS, IAM auth
- [AUTH-PATTERNS.md](../../docs/AUTH-PATTERNS.md) — Cognito flows, token handling, MFA
- [API-PATTERNS.md](../../docs/API-PATTERNS.md) — API Gateway + Lambda patterns
- [STORAGE-PATTERNS.md](../../docs/STORAGE-PATTERNS.md) — S3 presigned URLs, file management
- [MIGRATIONS.md](../../docs/MIGRATIONS.md) — Migration file format, runner usage, common patterns

## Teardown

```bash
bash $(dirname ${CLAUDE_SKILL_DIR})/scripts/teardown.sh
```
