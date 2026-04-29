# BOA Architecture

Backend on AWS, without the complexity.

BOA deploys a complete serverless backend on AWS with a single command. This document describes every component in the default template, the design decisions behind them, and the roadmap toward a complete Supabase-equivalent platform on AWS.

---

## System Overview

```
Client Application
│
│  @supabase/supabase-js (drop-in, unmodified)
│
▼
┌─────────────────────────────────────┐
│  API Gateway REST + WAF             │
│  (HTTPS, rate limiting, IP rep)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Lambda (Node.js 20.x, 256MB)       │
│  ┌───────────────────────────────┐  │
│  │  pgrest-lambda (npm package)  │  │
│  │  ┌─────────┐ ┌────────────┐   │  │
│  │  │PostgREST│ │GoTrue API  │   │  │
│  │  │ API     │ │  (Cognito) │   │  │
│  │  └────┬────┘ └─────┬──────┘   │  │
│  │       │            │          │  │
│  │  ┌────┴────────────┴-──────┐  │  │
│  │  │  Cedar Authorization    │  │  │
│  │  │  (policy → SQL WHERE)   │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Presigned URL Handler (S3)   │  │
│  └───────────────────────────────┘  │
└──────┬──────────┬──────────┬────────┘
       │          │          │
       ▼          ▼          ▼
  Aurora DSQL   Cognito   S3 Bucket
  (database)    (users)   (files)
```

Every component is serverless. The entire stack scales to zero when idle and scales to millions under load. There are no servers to manage, no capacity to plan, no clusters to size.

---
## client library
[DC: Not built yet, I've been using Supabase library directly for my testing and applciation, which is partially compatible].

Web applications use the BOA Library. The BOA library is partially compatible with Supabase. It deals with managing the JWT tokens and calling the dataplane backend APIs. 

The BOA library knows how to consume the API 3.0 specification provided by the BOA Backend.

---

## The BOA Skill

The BOA skill is a plugin that teaches AI coding agents how to build, operate, and troubleshoot BOA backends. It works with Claude Code, Kiro, VS Code Copilot, and Codex. The skill is four specialized sub-skills, each triggered by different developer intent.

### boa (main skill)

The primary skill for building backends. Guides agents through the full lifecycle: checking prerequisites, deploying infrastructure, designing schemas, writing access policies, creating custom functions, and connecting frontends.

**Two entry points:**

- **"Create a backend"** -- runs `boa check`, then `boa init <name>`, delivers a working API URL and keys. No tables, no schema, just bare infrastructure with auth endpoints working immediately.

- **"Build me an app"** -- runs the full workflow: init, design a data model, write migrations with DSQL-safe SQL, write Cedar access policies, deploy, connect a frontend with `@supabase/supabase-js`, and verify.

**What it knows:**

- All BOA CLI commands and when to use each one
- DSQL constraints (no foreign keys, no SERIAL, ASYNC indexes, no triggers) and their workarounds
- Cedar policy patterns: ownership-based, public read/private write, role-based, table-specific
- How to write custom Lambda functions: API endpoints (JWT-protected), webhooks (signature-verified), and scheduled jobs (EventBridge cron)
- Frontend integration with `@supabase/supabase-js` including Vite configuration
- Resource embedding via the `_id` naming convention for joins without foreign keys
- 13 critical rules derived from hundreds of real agent-built backends
- References to 11 deep documentation files it can load on demand for detailed patterns

**Communication style:** The skill instructs agents to narrate in plain sentences (not dump raw output), hide AWS plumbing (no IAM tokens or CloudFormation IDs in user-facing output), and present results as clean tables and checklists.

### boa-doctor (troubleshooting)

Triggers on error messages, HTTP status codes, stack traces, and phrases like "not working", "broken", "failing", "can't sign in", "getting 403".

**Seven diagnostic flows:**

| Symptom | What boa-doctor checks |
|---------|----------------------|
| API returns 403 | Missing Cedar policy, policies not deployed, user not authenticated, ownership mismatch |
| API returns 500 | Lambda logs, database connection errors, missing environment variables, missing packages |
| Deploy failed | Stack status and events, CloudFormation errors, stack stuck in ROLLBACK_COMPLETE |
| Auth not working | Self-signup disabled, user stuck UNCONFIRMED, wrong grant type, token expired |
| CORS errors | Lambda not returning CORS headers, OPTIONS not configured, origin mismatch |
| Migration failed | DSQL constraint violations (REFERENCES, SERIAL, missing ASYNC, triggers) |
| Frontend issues | Missing Vite globalThis polyfill, Amplify redirect catching static assets, wrong API URL |

**Quick error lookup:** Maps 10 common error messages directly to their most likely root cause and fix, so the agent does not need to run the full diagnostic flow for known patterns.

### boa-manage (operations)

Triggers on "show me my tables", "what's deployed", "open dashboard", "view logs", "seed data", "test locally", "how much is this costing".

**Capabilities:**

- **Schema inspection** -- list tables, describe columns, show row counts, list indexes
- **Stack status** -- current state, all outputs, recent CloudFormation events
- **Lambda logs** -- tail in real time, search for errors
- **Auth management** -- list users, check a specific user, delete test users
- **Database seeding** -- create and run seed files (same pattern as migrations), reset database
- **Local testing** -- run API locally with SAM, quick smoke test against deployed backend (signup, sign in, list tables)
- **Storage inspection** -- list files in S3, check bucket size, verify bucket is not public
- **Cost monitoring** -- current month charges by service, estimated month-end cost
- **Dashboard** -- downloads and opens a local HTML management UI from GitHub on demand

### boa-pricing (cost estimation)

Triggers on "costs", "pricing", "how much will this cost", "is BOA cheaper than Supabase", "estimate my AWS bill".

**How it works:**

1. **Interviews the developer** about their app: type, monthly active users, requests per user, read/write ratio, file storage, database storage. Provides six pre-built app profiles (productivity, social, real-time, e-commerce, SaaS, IoT) as starting points.

2. **Calculates BOA costs** using current AWS rates (us-east-1): Aurora DSQL DPUs and storage, Cognito MAU tiers, Lambda requests and compute, API Gateway requests, S3 storage and operations. Accounts for AWS Free Tier.

3. **Calculates Supabase equivalent** using their plan tiers (Free, Pro at $25/month, Team at $599/month) plus compute tier sizing based on estimated peak operations per second.

4. **Presents a comparison table** at multiple user scales showing both platforms side by side.

5. **Gives honest recommendations.** BOA wins at low scale (AWS Free Tier covers most costs) and for variable traffic (scales to zero). Supabase can be cheaper at growth stage (10K-100K users) where its flat monthly fee beats per-request pricing. Shows numbers and lets the developer decide.

The skill has access to pre-calculated pricing data for 6 app types at 4 scales (50, 1K, 100K, 2M users).

### Skill documentation

Each skill has access to 11 deep reference documents that it loads on demand:

| Document | Content |
|----------|---------|
| REST-API.md | Full REST API reference: filtering, pagination, headers, resource embedding, errors |
| POLICIES.md | Cedar entity model, policy examples per app type, operator-to-SQL translation table |
| PITFALLS.md | 41 known pitfalls with severity levels, indexed to detailed docs |
| ARCHITECTURE.md | Schema patterns for 5 app types (productivity, social, real-time, e-commerce, multi-tenant SaaS) |
| DSQL-PATTERNS.md | DSQL constraints, schema patterns, query patterns |
| AUTH-PATTERNS.md | Cognito flows, social sign-in, MFA, token handling |
| API-PATTERNS.md | API Gateway REST + WAF configuration, ALB extension patterns |
| STORAGE-PATTERNS.md | S3 presigned URLs, file management |
| FUNCTIONS.md | Custom Lambda functions: API endpoints, webhooks, scheduled jobs, common mistakes |
| MIGRATIONS.md | Migration file format, runner behavior, common patterns |
| FEEDBACK.md | How to report BOA bugs found during a session |

---

## The Lambda Function

A single Lambda function handles all API requests: REST operations, authentication, file uploads, and downloads.

### Configuration

```yaml
ApiFunction:
  Type: AWS::Serverless::Function
  Properties:
    Runtime: nodejs20.x
    MemorySize: 256
    Timeout: 30
    ReservedConcurrentExecutions: 50
```

**Reserved concurrency of 50.** This prevents a traffic spike from consuming the account's entire Lambda concurrency pool and starving other functions. It is a safety limit, not a performance target, and can be increased in the template.

### Handler structure

```javascript
export async function handler(rawEvent) {
  const event = normalizeEvent(rawEvent);
  const path = event.path || '';

  if (path === '/upload' || path === '/download') {
    return addStatusDescription(await uploadHandler(event));
  }

  return addStatusDescription(await pgrest.handler(event));
}
```

The handler does three things:

1. **Normalizes the event.** ALB, Function URL, and API Gateway send different event formats. The normalizer bridges them into a single format with consistent `path`, `httpMethod`, `headers`, `body`, and `requestContext.authorizer` fields. It also extracts JWT claims from the `Authorization` header and the API key role from the `apikey` header.

2. **Routes storage requests.** Upload and download requests go to the presigned URL handler.

3. **Delegates everything else to pgrest-lambda.** REST operations, authentication, API docs, and schema refresh all go through the pgrest-lambda handler.

---

## pgrest-lambda
https://github.com/yoshuacas/pgrest-lambda

pgrest-lambda is the engine that makes BOA work. It is an AI Generated project (npm package) that turns a PostgreSQL database (in our case DSQL) into a PostgREST-compatible REST API with GoTrue-compatible authentication and Cedar authorization (Open API Spec 3.0). You import it into your Lambda handler; it is not a standalone service.

I built Pgrest-lambda because: 1/ PostGREST (the project used by Supabase) is stateful and cannot work in lambda. 2/ because I needed to leverage DSQL features to achieve the same capabilities in PostGREST, this library for example supports Joins by using naming conventions instead of Foreign Keys (e.g., customers, customer_id).3/ I used CEDAR for authorization because DSQL doens't support Row Level Security (What Supabase and PostGREST use.)

### What it provides

**PostgREST-compatible REST API.** Auto-generates CRUD endpoints from the database schema:

```
GET    /rest/v1/<table>                List rows (with filtering, ordering, pagination)
POST   /rest/v1/<table>                Insert rows
PATCH  /rest/v1/<table>?id=eq.<value>  Update rows
DELETE /rest/v1/<table>?id=eq.<value>  Delete rows
GET    /rest/v1/                       OpenAPI 3.0 spec (JSON)
GET    /rest/v1/_docs                  Interactive Scalar API docs
POST   /rest/v1/_refresh               Refresh schema cache
```

It supports the full PostgREST query syntax: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `not.*` operators, `order`, `limit`, `offset` for pagination, `Prefer: count=exact` for total counts, `Prefer: return=representation` for returning inserted/updated rows, and `on_conflict` for upserts.

**Resource embedding (joins).** Since DSQL lacks foreign keys, pgrest-lambda infers relationships from column naming: `player_id` on `game_stats` references the `players` table. This enables nested queries:

```javascript
const { data } = await supabase
  .from('games')
  .select('opponent_name, game_stats(goals, players(name, position))');
```

Supports many-to-one, one-to-many, multi-level nesting, aliased embeds, disambiguation when multiple columns reference the same table, and inner joins via `!inner`.

---

## The Database: Aurora DSQL

Aurora DSQL is a serverless PostgreSQL-compatible database. It scales to zero, authenticates via IAM tokens (no stored credentials), and has deletion protection enabled by default.

### Connection pattern

Lambda connects using IAM authentication tokens with a 15-minute TTL:

```javascript
const signer = new DsqlSigner({ hostname: DSQL_ENDPOINT, region: REGION_NAME });
const token = await signer.getDbConnectAdminAuthToken();
const pool = new pg.Pool({
  host: DSQL_ENDPOINT,
  port: 5432,
  user: 'admin',
  password: token,
  database: 'postgres',
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 60000,
});
```
---

### DSQL constraints

DSQL is PostgreSQL-compatible but not PostgreSQL-identical. These constraints shape the entire schema design:

| Feature | Status | Workaround |
|---------|--------|------------|
| `SERIAL` / `BIGSERIAL` | Not supported | `TEXT DEFAULT gen_random_uuid()::text` |
| `REFERENCES` (foreign keys) | Not supported | Naming convention (`{table}_id`), Cedar policies |
| `CREATE INDEX` | Must use `ASYNC` | `CREATE INDEX ASYNC IF NOT EXISTS` |
| Stored procedures / triggers | Not supported | Implement in Lambda |
| Row-Level Security (RLS) | Not supported | Cedar policies (faster, more expressive) |
| Multi-statement transactions | Limited | Execute one statement at a time |
| Transactional DDL | Not supported | DDL auto-commits; use `IF NOT EXISTS` |

The lack of foreign keys is the most impactful constraint. pgrest-lambda compensates by inferring relationships from column naming conventions: a column named `player_id` on the `game_stats` table is treated as a foreign key to the `players` table. This enables resource embedding (joins) without database-level constraints.

### CloudFormation resource

```yaml
DsqlCluster:
  Type: AWS::DSQL::Cluster
  DeletionPolicy: Retain
  UpdateReplacePolicy: Retain
  Properties:
    DeletionProtectionEnabled: true
```

Both `DeletionPolicy: Retain` and `DeletionProtectionEnabled: true` are set. The cluster survives accidental `boa teardown`, CloudFormation stack deletion, and console mistakes. This is a deliberate guardrail: data loss is the one thing that kills projects permanently.

---

## The CLI

The BOA CLI is the single interface for the full backend lifecycle. Developers and AI agents use the same commands.
Developers create a new folder for their project and start it with the boa init command.

```
boa init <name>       Create project, deploy backend, write .boa/config.json
boa deploy            Rebuild and redeploy (SAM build/deploy, bundle policies, run migrations)
boa migrate           Apply pending SQL migrations to DSQL
boa verify            Check all backend components are correct (7 checks)
boa status            Show backend info, tables, applied/pending migrations
boa check             Verify required tools and AWS credentials
boa teardown          Destroy everything (requires typing backend name to confirm)
boa extend <name>     Add an optional extension (e.g., api-gateway)
boa remove <name>     Remove an extension
boa extensions        List available and enabled extensions
```

### Design decisions

BOA relies on SAM and AWS CLI to deploy cloudformation templates that create, update and destroy infrastructure for the backend.

**One command to deploy.** `boa init` does everything: generates JWT secrets, stores them in SSM Parameter Store, generates anon and service role API keys, copies the SAM template, runs `sam build` and `sam deploy`, extracts CloudFormation outputs (API Gateway URL, Cognito IDs, DSQL endpoint, bucket name), writes `.boa/config.json`, and copies the bundled skill. The developer goes from nothing to a working backend in under a minute.

**Deploy includes migrations.** `boa deploy` automatically runs pending migrations after the CloudFormation update completes. This prevents the common mistake of deploying code that references tables that do not exist yet.

**Verification is built in.** `boa verify` runs checks: Cognito self-signup enabled, API Gateway stage exists, WAF attached, API responding, S3 bucket exists, Block Public Access enabled. When the ALB extension is active, it also checks ALB target group health and Lambda reserved concurrency. This catches configuration drift from corporate security policies and manual console changes.

**Config lives in `.boa/config.json`.** A single JSON file with the API URL, anon key, service role key, region, stack name, and enabled extensions. Frontend apps read from this file. The CLI reads and updates it on every deploy.

---

### Migration system

Migrations live in the folder `migrations/` as numbered SQL files:

```
001_create_users.sql
002_create_todos.sql
003_add_indexes.sql
```

The CLI tracks applied migrations in a `_boa_migrations` table in the DSQL datbase with SHA-256 checksums. Modified migrations are rejected. This prevents the silent data corruption that happens when someone edits a migration that has already been applied to production.

---

## Authentication: Cognito

Cognito us used to authenticate end/users. The APIs exposed to the client library are not Cognito, but the GoTrue compatible (Supabase comaptible endpoints)

### Design decisions

**Self-signup enabled.** `AllowAdminCreateUserOnly: false` is critical. Cognito defaults to admin-only user creation, which means `supabase.auth.signUp()` returns a 400 error with no useful message.

**Pre-signup auto-confirm.** Without the pre-signup Lambda trigger, new users are stuck in `UNCONFIRMED` status until they verify their email. 

### User Pool configuration

```yaml
UserPool:
  Type: AWS::Cognito::UserPool
  DeletionPolicy: Retain
  Properties:
    AdminCreateUserConfig:
      AllowAdminCreateUserOnly: false
    AutoVerifiedAttributes: [email]
    UsernameAttributes: [email]
    DeletionProtection: ACTIVE
    LambdaConfig:
      PreSignUp: !GetAtt PreSignUpFunction.Arn
```

### API keys

Each BOA backend requires keys that are used to connect to APIs. 

Keys are Generated during `boa init` and stored in the file `.boa/config.json`:

| Key | Role | Purpose |
|-----|------|---------|
| `anonKey` | `anon` | Public key for frontend, unauthenticated requests |
| `serviceRoleKey` | `service_role` | Admin key that bypasses all authorization |

Both are JWTs signed with the JWT secret stored in AWS Secrete manager Parameter Store. The `role` claim determines authorization behavior.

### Service role key handling

The service role key bypasses Cedar. Any code that presents it reads and writes every table and row unconditionally. That is useful for CI, admin scripts, SSR renderers, and backend-to-backend traffic. It is catastrophic if it reaches a browser.

Rules of thumb:

- **Never** embed `serviceRoleKey` in frontend bundles, mobile apps, desktop apps, or anything distributed to users.
- **Never** commit `.boa/config.json`. The default `.gitignore` excludes `.boa/` — keep it that way.
- For production, fetch the key at runtime from AWS Systems Manager Parameter Store or AWS Secrets Manager instead of checking it into your deployment artifact.
- Rotate keys on a schedule with `boa rotate-keys`. The default lifetime is 90 days (see `boa/cli/lib/keys.mjs`).
- If a leak is suspected, rotate immediately with `boa rotate-keys --rotate-secret`. That also mints a new JWT secret, invalidating every outstanding user session.

If a code path wants service-role privileges from the browser, it's wrong. Write a narrower Cedar rule and use the anon or authenticated key instead.

---

## Authorization: Cedar Policies

BOA uses Cedar (AWS's policy-as-code engine) instead of PostgreSQL Row-Level Security. DSQL does not support RLS, but Cedar is a better fit regardless: policies are version-controlled files, evaluation takes approximately 5 microseconds, and conditions translate directly to SQL WHERE clauses.

### Entity model

```
Principals:  PgrestLambda::User          (authenticated, has email, role)
             PgrestLambda::ServiceRole    (admin, bypasses all policies)
             PgrestLambda::AnonRole       (unauthenticated)

Actions:     PgrestLambda::Action::"select"   → GET
             PgrestLambda::Action::"insert"    → POST
             PgrestLambda::Action::"update"    → PATCH
             PgrestLambda::Action::"delete"    → DELETE

Resources:   PgrestLambda::Table    (table name as resource ID)
             PgrestLambda::Row      (row attributes auto-typed from schema)
```

### Default behavior

Without custom policies, the default behavior is:

- Authenticated users can read, update, and delete rows where `user_id` matches their ID
- Authenticated users can insert into any table
- `service_role` key bypasses all authorization
- Anonymous users are denied everything
- Any request without a matching policy returns 403 Forbidden

### Policy deployment

Policies live in the folder `policies/*.cedar` in the project root. During `boa deploy`, the CLI copies them to the Lambda build directory. pgrest-lambda loads and caches them alongside the schema.

---

### Environment variables

```yaml
DSQL_ENDPOINT: !GetAtt DsqlCluster.Endpoint
REGION_NAME: !Ref 'AWS::Region'
BUCKET_NAME: !Ref StorageBucket
USER_POOL_ID: !Ref UserPool
USER_POOL_CLIENT_ID: !Ref UserPoolClient
JWT_SECRET: !Sub '{{resolve:ssm:/${ProjectName}/jwt-secret}}'
AUTH_PROVIDER: cognito
POLICIES_PATH: ./policies
API_BASE_URL: !Sub 'https://${Api}.execute-api.${AWS::Region}.amazonaws.com/prod/rest/v1'
```

The JWT secret is resolved from SSM Parameter Store at deploy time, not stored in the template. `API_BASE_URL` is set so that the auto-generated OpenAPI spec and Scalar docs use the correct API Gateway URL.

### IAM permissions

The Lambda function has scoped IAM policies:

- **DSQL**: `dsql:DbConnect`, `dsql:DbConnectAdmin` (generate auth tokens)
- **Cognito**: 9 specific actions (SignUp, InitiateAuth, GetUser, AdminGetUser, etc.)
- **S3**: CRUD on the storage bucket only
- **SSM**: Read access to the JWT secret parameter

---

**GoTrue-compatible authentication.** Exposes the same auth endpoints that `@supabase/supabase-js` expects:

| Endpoint | Purpose |
|----------|---------|
| `POST /auth/v1/signup` | Register new user |
| `POST /auth/v1/token?grant_type=password` | Sign in |
| `POST /auth/v1/token?grant_type=refresh_token` | Refresh session |
| `GET /auth/v1/user` | Get current user |
| `POST /auth/v1/logout` | Sign out |

The auth provider is swappable. BOA uses Cognito by default (`AUTH_PROVIDER=cognito`). pgrest-lambda also supports a "GoTrue-native" mode that stores users directly in PostgreSQL with bcrypt password hashing, and a custom provider interface.

**Cedar authorization.** Evaluates Cedar policies and translates conditions into SQL WHERE clauses. A policy like:

```cedar
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};
```

Becomes `WHERE user_id = $1` in the SQL query. Authorization happens in the database, not in application code. Policy evaluation takes approximately 5 microseconds per request.

**Schema caching.** Introspects the database schema on first request and caches it with a 30-second TTL. The cache is refreshed automatically or on demand via `POST /rest/v1/_refresh`. The migration runner calls refresh after applying migrations.

### Why pgrest-lambda exists

The alternative is deploying PostgREST as a container (ECS/Fargate) and GoTrue as another container. That means managing two services, configuring networking between them, setting up health checks, and paying for always-on compute. pgrest-lambda collapses both into a single npm import that runs in the same Lambda function as the rest of the backend. Zero additional infrastructure.

### Supabase client compatibility

Because pgrest-lambda implements PostgREST and GoTrue protocols faithfully, `@supabase/supabase-js` works as the client SDK with no modifications:

```javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(API_URL, ANON_KEY);

await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });
const { data } = await supabase.from('todos').select('*');
```

This is a deliberate strategy. Supabase has the best developer experience for PostgreSQL backends. BOA provides the same DX on infrastructure you own.

---

## The Traffic Layer: API Gateway REST

API Gateway REST is the default entry point for all API
traffic. It provides HTTPS out of the box via the
`*.execute-api.<region>.amazonaws.com` endpoint, requiring
no ACM certificate or custom domain.

### Configuration

```yaml
Api:
  Type: AWS::Serverless::Api
  Properties:
    StageName: prod
    Cors:
      AllowMethods: "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization,apikey,...'"
      AllowOrigin: "'*'"
```

### Design decisions

**API Gateway over ALB.** ALB ships with no HTTPS listener
(requires ACM cert + custom domain). Chrome's HTTPS-First
mode silently upgrades `http://` requests to `https://`,
causing `TypeError: Failed to fetch` with no useful error.
API Gateway provides HTTPS on the default endpoint with no
setup. ALB is available as an extension (`boa extend alb`)
for long-running requests (>29s), streaming, or high
throughput.

**No VPC required.** API Gateway does not need a VPC,
eliminating VPC, subnets, internet gateway, route tables,
and security groups from the default template. This reduces
deploy time and simplifies teardown.

**WAF on API Gateway stage.** WAF associates with the API
Gateway stage ARN
(`arn:aws:apigateway:<region>::/restapis/<id>/stages/prod`).
Same WAF rules as before (rate limiting + IP reputation).

---

## The Firewall: WAF + Shield

### WAF rules

```yaml
WafWebAcl:
  Type: AWS::WAFv2::WebACL
  Properties:
    Scope: REGIONAL
    DefaultAction: Allow
    Rules:
      - Name: rate-limit
        Priority: 1
        Action: Block
        Statement:
          RateBasedStatement:
            Limit: 1000
            AggregateKeyType: IP
      - Name: ip-reputation
        Priority: 2
        OverrideAction: None
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesAmazonIpReputationList
```

**Rate limiting: 1000 requests per 5 minutes per IP.** This prevents a single client from overwhelming the backend. The limit is intentionally conservative for prototypes and side projects; production deployments should increase it.

**IP reputation list.** AWS maintains a list of known malicious IP addresses (botnets, scanners, abuse sources). Requests from these IPs are blocked automatically.

### Why WAF is in the default template

Most serverless tutorials skip DDoS protection entirely. A Lambda endpoint with no rate limiting can be hit with millions of requests, generating a large AWS bill. WAF prevents this by default.

## Storage: S3

### Current implementation (presigned URL handler)

The default template includes a basic presigned URL handler for file uploads and downloads:

```
POST /upload   → Lambda generates presigned S3 PUT URL → Client uploads directly to S3
GET  /download → Lambda verifies ownership → Returns presigned S3 GET URL
```

Security constraints:
- Allowed content types: JPEG, PNG, GIF, WebP, PDF, plain text, CSV, JSON
- Max file size: 10 MB
- User isolation: files stored in `uploads/{userId}/{uuid}-{filename}`
- All files behind presigned URLs (never public)
- Block Public Access enabled on all four settings

### S3 bucket configuration

```yaml
StorageBucket:
  Type: AWS::S3::Bucket
  DeletionPolicy: Retain
  Properties:
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
    CorsConfiguration:
      CorsRules:
        - AllowedMethods: [GET, PUT, POST]
          AllowedHeaders: ['*']
          AllowedOrigins: ['*']
          MaxAge: 3600
```

The bucket has `DeletionPolicy: Retain`, matching the same philosophy as DSQL and Cognito: data survives accidental destruction.

---

## Infrastructure as Code: SAM/CloudFormation

The entire backend is defined in a single SAM template (`backend.yaml`, 372 lines). `boa init` copies it to `.boa/template.yaml`, and `boa deploy` runs `sam build` and `sam deploy` against it.

### Resources created

| Resource | Type | Deletion Policy |
|----------|------|-----------------|
| DSQL Cluster | `AWS::DSQL::Cluster` | Retain + DeletionProtection |
| Cognito User Pool | `AWS::Cognito::UserPool` | Retain + DeletionProtection |
| Cognito User Pool Client | `AWS::Cognito::UserPoolClient` | - |
| Pre-Signup Lambda | `AWS::Serverless::Function` | - |
| API Lambda | `AWS::Serverless::Function` | - |
| S3 Storage Bucket | `AWS::S3::Bucket` | Retain |
| API Gateway REST | `AWS::Serverless::Api` | - |
| WAF WebACL | `AWS::WAFv2::WebACL` | - |
| WAF Association | `AWS::WAFv2::WebACLAssociation` | - |
| Lambda Permission (Cognito) | `AWS::Lambda::Permission` | - |

### Extension system

Extensions are YAML fragments that merge into the base template. Currently available:

- **`alb`**: Adds ALB + VPC + HTTP listener for long-running requests, streaming, or high throughput. Removes API Gateway resources, adds VPC, subnets, ALB, and WAF-to-ALB association.

Extensions are managed via `boa extend <name>` and `boa remove <name>`. The enabled extensions list is stored in `.boa/config.json`.

---

## Future: storage-lambda

[storage-lambda](https://github.com/yoshuacas/storage-lambda) (v0.1.0) is an npm package that replaces the basic presigned URL handler with a full Supabase-compatible storage API. It will be integrated into BOA as the default storage layer.

### What it adds

**Full Supabase Storage API compatibility.** All endpoints under `/storage/v1`:

- **Objects**: upload, download (authenticated and public), batch delete, list, move, copy, metadata (JSON and HEAD)
- **Signed URLs**: create signed download URL, batch signed URLs, create signed upload URL, upload via signed URL
- **Buckets**: list, create, get, update, delete, empty

**Smarter upload handling.** Files under 6MB go through Lambda. Files over 6MB use a signed upload URL so the client uploads directly to S3, keeping Lambda memory low.

**Metadata in PostgreSQL.** File metadata (name, size, content type, owner) is stored in `_storage_buckets` and `_storage_objects` tables. S3 stores the bytes; the database stores the metadata. This enables listing, searching, and access control without S3 ListObjects calls.

**Cedar authorization for storage.** Storage operations map to Cedar actions (`storage.upload`, `storage.download`, `storage.delete`, `storage.list`, `storage.move`, `storage.copy`). The same policy engine that protects database tables also protects files.

**S3 event trigger.** An optional Lambda that listens to S3 events (`ObjectCreated`, `ObjectRemoved`) to confirm metadata and clean orphaned entries.

### What changes in BOA

The presigned URL handler in `lambda/presigned-upload.mjs` will be replaced by a `storage-lambda` import, similar to how pgrest-lambda replaced the inline REST engine. The SAM template may add the S3 event trigger Lambda. Client code switches from custom `/upload` and `/download` endpoints to standard `supabase.storage.from('bucket').upload(...)` calls.

---

## Future: events-lambda

[events-lambda](https://github.com/yoshuacas/events-lambda) (v0.1.0) is an npm package that provides Supabase-compatible real-time events backed by AWS AppSync Events. It will be integrated into BOA as an extension or default feature.

### What it adds

**Supabase Realtime compatibility.** Standard channel subscriptions work:

```javascript
supabase.channel('todos')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos' },
    (payload) => console.log('New todo:', payload.new))
  .subscribe();
```

**Two-part architecture:**

1. **Publisher (server-side).** After a successful database write, the Lambda publishes a change event to AppSync Events. This is application-layer publishing, not WAL-based. One INSERT generates one event regardless of subscriber count.

2. **Adapter (client-side).** A realtime adapter that plugs into `@supabase/supabase-js` so standard `.channel()`, `.on()`, and `.subscribe()` methods work without modification.

**Three channel types:**

| Type | AppSync Channel Pattern | Auth |
|------|------------------------|------|
| Postgres Changes | `/db/public/{table}/{event}` | IAM publish (Lambda only), Cognito subscribe |
| Broadcast | `/broadcast/{room}/{event}` | Cognito for both publish and subscribe |
| Presence | `/presence/{room}` | Cognito for both (deferred to Phase 3) |

**Why AppSync Events, not custom WebSockets.** AppSync Events handles connection management, subscription tracking, and message fan-out at 1M outbound messages per second. The alternative is a DynamoDB connection table, a cleanup Lambda, and custom WebSocket code. AppSync eliminates all of that.

**Why application-layer publishing, not WAL.** DSQL has no logical replication, no triggers, and no LISTEN/NOTIFY. Even if it did, WAL-based realtime has a scaling problem: one INSERT with 100 subscribers means 100 RLS evaluations. Application-layer publishing generates one event per write, and AppSync handles fan-out.

### What changes in BOA

The SAM template will add an AppSync Events API resource and a Cognito identity pool for WebSocket authentication. The Lambda handler will import the publisher module and call it after successful writes. Client applications will import the adapter and pass it to `createClient`.

---

## Security Model

### Defense in depth

| Layer | Protection |
|-------|-----------|
| Network | API Gateway REST + WAF rate limiting (1000 req/5min/IP), IP reputation blocking |
| Transport | SSL/TLS for all connections (DSQL, Cognito, S3) |
| Authentication | Cognito user pools, JWT tokens, API key validation |
| Authorization | Cedar policies, deny-by-default, SQL WHERE clause injection |
| Data | DSQL encryption at rest, S3 default encryption, SSM Parameter Store for secrets |
| Deletion | Retain policies on DSQL, Cognito, and S3; deletion protection on DSQL and Cognito |

### Three authorization roles

| Role | Source | Behavior |
|------|--------|----------|
| `anon` | Anon key without bearer token | Denied by default; policies can grant access |
| `authenticated` | Bearer token from signed-in user | Subject to Cedar policies; `user_id == principal` |
| `service_role` | Service role key | Bypasses all authorization |

### Guardrails

BOA enforces 13 critical rules that prevent the most common failures:

1. Cognito self-signup always enabled
2. Pre-signup Lambda always deployed (auto-confirm users)
3. Node.js only for Lambda (never Python)
4. `REGION_NAME` env var (never `AWS_REGION`)
5. S3 never public (always presigned URLs)
6. Vite `global: 'globalThis'` for Cognito SDK browser compatibility
7. Amplify redirects never use `/<*>` (breaks static assets)
8. DSQL uses IAM auth tokens (never hardcoded credentials)
9. Tables without policies return 403
10. Never teardown to troubleshoot (only for decommissioning)
11. Never disable deletion protection
12. Extensions are optional (default backend works standalone)
13. WAF rate limiting is always on

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Lambda cold start | 1-3 seconds | Node.js 20.x, 256MB |
| Lambda warm invocation | 50-100ms | Includes DSQL query |
| Cedar policy evaluation | ~5 microseconds | Per request |
| Schema cache TTL | 30 seconds | Refreshable via `POST /rest/v1/_refresh` |
| DSQL auth token TTL | 15 minutes | Refreshed every 10 minutes |
| Database connection pool | 5 connections max | 60-second idle timeout |
| Presigned URL expiration | 1 hour | Upload and download |
| WAF rate limit | 1000 requests / 5 minutes | Per IP |
| Reserved concurrency | 50 Lambda instances | Configurable |
| Max upload size | 10 MB | Current handler; storage-lambda supports larger |

---

## Cost at Rest

When no one is using the backend:

| Service | Idle Cost |
|---------|-----------|
| Aurora DSQL | $0 (scales to zero) |
| Lambda | $0 (no invocations) |
| Cognito | $0 (no active users) |
| S3 | $0.023/GB stored |
| API Gateway | $0 (pay per request) |
| WAF | ~$6/month (WebACL + rules) |
| **Total** | **~$6/month** (WAF dominates) |

API Gateway has no fixed hourly charge (pay per request
only). WAF is the only always-on cost. For high-throughput
workloads, the ALB extension (`boa extend alb`) may be
more cost-effective due to ALB's LCU-based pricing model
vs API Gateway's per-request pricing.

---

## What is Not Included (and Why)

**Custom domains / HTTPS.** Requires ACM certificate provisioning and DNS validation, which varies by registrar. Documented as a post-init guide, not automated.

**Email sending (SES).** The pre-signup auto-confirm trigger removes the need for verification emails. Transactional email is a separate concern.

**CI/CD pipelines.** BOA manages infrastructure, not application deployment workflows. Frontend hosting via Amplify has its own Git-based CI/CD.

**Monitoring and alerting.** CloudWatch is available by default for all AWS services. BOA does not configure custom dashboards or alarms, but `boa verify` provides on-demand health checks.

**Multi-region.** DSQL supports multi-region, but the default template deploys to a single region. Multi-region adds complexity (conflict resolution, latency routing) that most projects do not need initially.

**VPC for Lambda.** Lambda runs outside the VPC. Adding Lambda to the VPC would require NAT Gateways (~$32/month each, two for HA) and add cold start latency. Since DSQL, Cognito, and S3 all have public endpoints with IAM auth, there is no security benefit.
