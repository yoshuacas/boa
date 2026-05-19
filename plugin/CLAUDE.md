# BOA — Backend on AWS (Skill Quick Reference)

The BOA skill teaches your agent to build serverless backends on AWS.

## Backend (all serverless, scales to zero)
| Layer      | Service                  |
|------------|--------------------------|
| Database   | Aurora DSQL              |
| Auth       | better-auth via pgrest-lambda |
| Authorization | Access policies (Cedar) |
| Engine     | pgrest-lambda (npm)      |
| Compute    | Lambda (Node.js 20)      |
| Compute (Custom) | FunctionsLambda (shared) |
| API        | API Gateway REST + WAF (default) |
| Storage    | Amazon S3                |
| Hosting    | AWS Amplify              |
| IaC        | CloudFormation           |

API Gateway REST + WAF is the default traffic layer. ALB is available as an extension (`boa extend alb`) for long-running requests, streaming, or high-throughput workloads.

**pgrest-lambda** provides a PostgREST-compatible REST API and GoTrue-compatible auth backed by better-auth. `@supabase/supabase-js` works as a drop-in client. The Lambda handlers are thin wrappers (~20 lines total).

## Critical Rules
1. New projects use `AUTH_PROVIDER=better-auth`.
2. Always use Node.js for Lambda — never Python (binary dependency failures).
3. Never set `AWS_REGION` as Lambda env var — it is reserved; use `REGION_NAME`.
4. Never make S3 buckets public — always use presigned URLs.
5. Never use `/<*>` as the Amplify SPA redirect — use a regex that excludes static assets.
6. DSQL requires IAM auth tokens for connections — never hardcode credentials.
7. Extensions are optional. The default backend works without any extensions.

## Authorizer Contract
pgrest-lambda handles JWT validation internally and attaches flat keys to every event:
```javascript
event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
event.requestContext.authorizer.userId   // user UUID or '' for anon
event.requestContext.authorizer.email    // user email or ''
```
Custom Lambda code should read these flat keys.

## Key Files
| File | Purpose |
|------|---------|
| `skills/boa/SKILL.md` | Full skill instructions |
| `docs/REST-API.md` | Full REST API reference (filtering, pagination, errors) |
| `docs/POLICIES.md` | Access policies (entity model, examples, SQL translation) |
| `docs/PITFALLS.md` | Every known failure with fix |
| `docs/ARCHITECTURE.md` | Schema patterns per app type |
| `docs/DSQL-PATTERNS.md` | SQL, migrations, access policies |
| `docs/MIGRATIONS.md` | Migration file format, runner, patterns |
| `docs/FUNCTIONS.md` | Custom functions reference (handler, ctx, routing, secrets) |
| `cli/lib/functions/` | Functions runtime, discovery, packaging, and registry |
| `cli/commands/functions.mjs` | CLI subcommands: list, invoke, logs, remove |

## BOA CLI
| Command | What it does |
|---------|-------------|
| `boa init` | First-time deploy |
| `boa deploy` | Rebuild + redeploy |
| `boa migrate` | Apply pending SQL migrations |
| `boa verify` | Post-deploy verification |
| `boa functions` | Manage custom functions (list, invoke, logs, remove) |
| `boa teardown` | Backend removal |
