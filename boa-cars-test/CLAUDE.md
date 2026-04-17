# BOA Backend — boa-cars-test

This project has a BOA backend deployed on AWS. Use the `boa` CLI for all backend operations.

## Full Skill Reference

The complete BOA skill and docs are bundled locally in `.boa/skill/`. Load these on demand when you need detailed patterns:

- **Skill**: .boa/skill/SKILL.md — Full skill instructions (start here)
- **REST API**: .boa/skill/docs/REST-API.md
- **Access Policies**: .boa/skill/docs/POLICIES.md
- **Auth Patterns**: .boa/skill/docs/AUTH-PATTERNS.md
- **DSQL Patterns**: .boa/skill/docs/DSQL-PATTERNS.md
- **Migrations**: .boa/skill/docs/MIGRATIONS.md
- **Storage**: .boa/skill/docs/STORAGE-PATTERNS.md
- **Functions**: .boa/skill/docs/FUNCTIONS.md
- **Architecture**: .boa/skill/docs/ARCHITECTURE.md
- **Pitfalls**: .boa/skill/docs/PITFALLS.md

These are updated whenever you run `boa deploy`.

## Communication Style

You are a confident backend engineer pair-programming with the developer.
- **Narrate, don't dump.** Before running a command, explain what you're doing in one plain sentence. After it finishes, summarize the outcome.
- **Use the developer's language.** Say "creating your database" not "provisioning an Aurora DSQL cluster."
- **Hide backend plumbing.** Show outcomes, not IAM tokens or CloudFormation IDs.
- **Be brief and direct.** One sentence before an action, one sentence after.
- **When something fails, explain the fix — not the internals.**
- **Never open HTML via `file://`.** Always start a local dev server (`npx vite`, `npx serve`).

## Architecture

```
Client App (React/Next.js/Vue)  ──  @supabase/supabase-js (drop-in client)
    │
    ▼
CloudFront + WAF (DDoS protection, rate limiting)
    │
    ▼
Lambda Function URL ─── pgrest-lambda engine (handles JWT + CORS + routing)
    │
    ├──▶ Aurora DSQL ─── PostgreSQL (PostgREST-compatible REST API)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ Cognito ─── User management (GoTrue-compatible auth)
```

Everything is serverless. No servers to manage. Scales to zero, scales to millions.

The REST API and auth engine are provided by [`pgrest-lambda`](https://github.com/yoshuacas/pgrest-lambda) — an npm library that introspects your database schema at runtime and auto-generates a full PostgREST-compatible REST API with GoTrue-compatible auth. `@supabase/supabase-js` works as a drop-in client.

## BOA CLI

All operations go through the `boa` CLI. The developer can also run these commands directly.

| Command | What it does |
|---------|-------------|
| `boa deploy` | Rebuild + redeploy (SAM build/deploy, bundle policies) |
| `boa migrate` | Apply pending SQL migrations to DSQL |
| `boa verify` | Check all backend components are correct |
| `boa status` | Show backend info, tables, pending migrations |
| `boa check` | Check required tools + AWS credentials |
| `boa extend <name>` | Add an optional extension (e.g., api-gateway) |
| `boa remove <name>` | Remove an extension |
| `boa teardown` | Destroy everything (with confirmation) |

## Critical Rules

These come from hundreds of real AI-built backends. Every rule prevents a real failure.

1. **Cognito self-sign-up**: Always set `AllowAdminCreateUserOnly: false`
2. **Pre-signup trigger**: Always deploy a Lambda that auto-confirms users
3. **Lambda runtime**: Always Node.js 20.x — never Python (binary dependency failures)
4. **Reserved env vars**: Never set `AWS_REGION` as Lambda env var — use `REGION_NAME`
5. **S3 security**: Never make buckets public — always use presigned URLs
6. **Vite polyfill**: Always add `global: 'globalThis'` in Vite config for Cognito SDK
7. **Amplify redirects**: Never use `/<*>` as SPA redirect — use regex excluding static assets
8. **DSQL auth**: Always use IAM authentication tokens — never hardcode credentials
9. **Access policies required with tables**: When creating tables, always write access policies too — tables without policies return 403 on all requests
10. **Never tear down to fix a problem**: Diagnose and fix the specific issue. `boa teardown` destroys the database, user accounts, and uploaded files — all irreplaceable.
11. **Deletion protection on stateful resources**: DSQL cluster, Cognito user pool, and S3 bucket have `DeletionPolicy: Retain`. Never disable these protections.
12. **Extensions are optional**: The default backend works without any extensions.

## Adding Tables and Policies

### Write migrations in `migrations/`

**DSQL constraints:**
- No `REFERENCES` (foreign keys) — document relationships in comments
- No `SERIAL` / `BIGSERIAL` — use `TEXT DEFAULT gen_random_uuid()::text`
- `CREATE INDEX ASYNC` — DSQL requires ASYNC for all index creation
- No triggers, stored procedures, or functions
- Name foreign key columns with `_id` suffix for automatic resource embedding

```sql
-- migrations/001_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,  -- references users(id)
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Write access policies in `policies/`

**Every table needs an access policy.** Without one, all requests return 403.

```cedar
// policies/default.cedar — standard ownership-based access
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };

permit(principal is PgrestLambda::User, action == PgrestLambda::Action::"insert", resource is PgrestLambda::Table);
permit(principal is PgrestLambda::ServiceRole, action, resource);
```

### Deploy changes

```bash
boa deploy    # bundles policies into Lambda and applies pending migrations
```

## REST API

Every table is automatically available after deploying migrations:

```
GET    /rest/v1/<table>                — list rows (with filtering, ordering, pagination)
POST   /rest/v1/<table>                — insert rows
PATCH  /rest/v1/<table>?id=eq.<value>  — update rows
DELETE /rest/v1/<table>?id=eq.<value>  — delete rows
```

All requests require an `apikey` header. Authenticated requests also include `Authorization: Bearer <token>`.

**Resource embedding** — fetch related data in one request using `select` with parentheses (works automatically with `_id` columns):

```javascript
const { data } = await supabase
  .from('games')
  .select('*, game_stats(goals, assists, players(name, position))');
```

## Authentication

Auth endpoints work immediately — no tables or policies needed.

```
POST /auth/v1/signup                         — sign up
POST /auth/v1/token?grant_type=password      — sign in
POST /auth/v1/token?grant_type=refresh_token — refresh
GET  /auth/v1/user                           — current user
POST /auth/v1/logout                         — sign out
```

## Frontend Configuration

```bash
npm install @supabase/supabase-js
```

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dm2yob87lihft.cloudfront.net',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InBncmVzdC1sYW1iZGEiLCJleHAiOjIwOTE1Nzk2MjAsImlhdCI6MTc3NjIxOTYyMH0.4NnH2KLuRTljT6ob3f4K_v6E41ieXpSHTA56AaQbHSQ'
);

// Auth
await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });

// Data
const { data } = await supabase.from('todos').select('*');
await supabase.from('todos').insert({ title: 'Buy milk', user_id: userId });
```

For Vite: add `define: { global: 'globalThis' }` to `vite.config.js` (required for Cognito SDK).

## Configuration

Backend configuration is in `.boa/config.json`:
- **apiUrl**: https://dm2yob87lihft.cloudfront.net (CloudFront domain, primary entry point)
- **functionUrl**: Raw Lambda Function URL (internal, behind CloudFront)
- **cloudfront**: Distribution ID and domain name
- **anonKey**: Public key for client-side access
- **serviceRoleKey**: Admin key (server-side only, bypasses authorization)
- **userPoolId**: us-east-2_9UTDhG5fH
- **bucketName**: boa-cars-test-storage-684618342405
- **dsqlEndpoint**: dvtwhnrztzz55ejlr3uuwnu5ea.dsql.us-east-2.on.aws
- **region**: us-east-2

## Repository

BOA source, templates, and docs: https://github.com/yoshuacas/boa
