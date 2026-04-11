# BOA — Backend on AWS (Plugin Quick Reference)

This plugin teaches your agent to build serverless backends on AWS.

## Stack (all serverless, scales to zero)
| Layer      | Service              |
|------------|----------------------|
| Database   | Aurora DSQL          |
| Auth       | Amazon Cognito       |
| Compute    | Lambda (Node.js 20)  |
| API        | API Gateway (REST)   |
| Storage    | Amazon S3            |
| Hosting    | AWS Amplify          |
| IaC        | SAM / CloudFormation |

## Critical Rules
1. Always `AllowAdminCreateUserOnly: false` for Cognito self-signup
2. Always deploy pre-signup Lambda that auto-confirms users
3. Always use REST API Gateway (not HTTP API) — required for REQUEST-type Lambda authorizer with header caching
4. Always use Node.js for Lambda — never Python (binary dependency failures)
5. Never set `AWS_REGION` as Lambda env var — it's reserved; use `REGION_NAME`
6. Never make S3 buckets public — always use presigned URLs
7. Always add `global: 'globalThis'` polyfill to Vite config for Cognito SDK
8. Never use `/<*>` as Amplify SPA redirect — use regex excluding static assets
9. DSQL requires IAM auth tokens for connections — never hardcode credentials

## Authorizer Contract
The BOA custom Lambda authorizer (replaces CognitoAuthorizer) passes flat keys:
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
| `docs/PITFALLS.md` | Every known failure with fix |
| `docs/ARCHITECTURE.md` | Schema patterns per app type |
| `docs/DSQL-PATTERNS.md` | SQL, migrations, RLS |
| `templates/backend.yaml` | SAM template (full stack) |
| `lambda-templates/` | Ready-to-use Lambda handlers |
| `scripts/deploy.sh` | One-command deploy |
| `docs/MIGRATIONS.md` | Migration file format, runner, patterns |
| `scripts/migrate.sh` | Database migration runner |
