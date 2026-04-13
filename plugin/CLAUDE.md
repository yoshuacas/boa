# BOA — Backend on AWS (Skill Quick Reference)

The BOA skill teaches your agent to build serverless backends on AWS.

## Backend (all serverless, scales to zero)
| Layer      | Service                  |
|------------|--------------------------|
| Database   | Aurora DSQL              |
| Auth       | Amazon Cognito           |
| Authorization | Access policies (Cedar) |
| Engine     | pgrest-lambda (npm)      |
| Compute    | Lambda (Node.js 20)      |
| API        | API Gateway (REST)       |
| Storage    | Amazon S3                |
| Hosting    | AWS Amplify              |
| IaC        | SAM / CloudFormation     |

**pgrest-lambda** provides a PostgREST-compatible REST API and GoTrue-compatible auth. `@supabase/supabase-js` works as a drop-in client. The Lambda handlers are thin wrappers (~20 lines total).

## Critical Rules
1. Always `AllowAdminCreateUserOnly: false` for Cognito self-sign-up
2. Always deploy pre-signup Lambda that auto-confirms users
3. Always use REST API Gateway (not HTTP API) — required for REQUEST-type Lambda authorizer with header caching
4. Always use Node.js for Lambda — never Python (binary dependency failures)
5. Never set `AWS_REGION` as Lambda env var — it's reserved; use `REGION_NAME`
6. Never make S3 buckets public — always use presigned URLs
7. Always add `global: 'globalThis'` polyfill to Vite config for Cognito SDK
8. Never use `/<*>` as Amplify SPA redirect — use regex excluding static assets
9. DSQL requires IAM auth tokens for connections — never hardcode credentials

## Authorizer Contract
The BOA custom Lambda authorizer (JWT dual-layer validation) passes flat keys:
```javascript
event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
event.requestContext.authorizer.userId   // user UUID or '' for anon
event.requestContext.authorizer.email    // user email or ''
```
Do NOT use `event.requestContext.authorizer.claims.sub` — that is the old Cognito format.

## Key Files
| File | Purpose |
|------|---------|
| `skills/boa/SKILL.md` | Full skill instructions |
| `templates/backend.yaml` | SAM template (full backend) |
| `lambda-templates/index.mjs` | Main handler (pgrest-lambda + presigned uploads) |
| `lambda-templates/authorizer.mjs` | JWT dual-layer authorizer |
| `lambda-templates/presigned-upload.mjs` | S3 presigned URL handler |
| `boa init` | First-time deploy (replaces `scripts/bootstrap.sh`) |
| `boa deploy` | Redeploy (replaces `scripts/deploy.sh`) |
| `boa migrate` | Database migration runner (replaces `scripts/migrate.sh`) |
| `boa verify` | Post-deploy verification (replaces `scripts/verify.sh`) |
| `boa teardown` | Backend removal (replaces `scripts/teardown.sh`) |
| `docs/REST-API.md` | Full REST API reference (filtering, pagination, errors) |
| `docs/POLICIES.md` | Access policies (entity model, examples, SQL translation) |
| `docs/PITFALLS.md` | Every known failure with fix |
| `docs/ARCHITECTURE.md` | Schema patterns per app type |
| `docs/DSQL-PATTERNS.md` | SQL, migrations, access policies |
| `docs/MIGRATIONS.md` | Migration file format, runner, patterns |
