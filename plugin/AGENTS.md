# BOA — Backend on AWS

Build serverless backends on AWS using Aurora DSQL (PostgreSQL), Cognito, Lambda (Function URLs), and S3.

## When to use this
When building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage.

## Critical rules
1. Always `AllowAdminCreateUserOnly: false` for Cognito self-sign-up
2. Always deploy pre-signup Lambda that auto-confirms users
3. Always use Node.js for Lambda — never Python (binary deps break)
4. Never set `AWS_REGION` as Lambda env var — reserved; use `REGION_NAME`
5. Never make S3 buckets public — always use presigned URLs
6. Always add `global: 'globalThis'` polyfill to Vite for Cognito SDK
7. Never use `/<*>` as Amplify SPA redirect
8. DSQL uses IAM auth tokens — never hardcode credentials
9. Extensions are optional — the default backend works without any extensions

## Backend
- Database: Aurora DSQL (serverless PostgreSQL)
- Auth: Amazon Cognito (GoTrue-compatible via pgrest-lambda)
- Engine: pgrest-lambda (PostgREST-compatible REST API, auto-generates endpoints from schema)
- Compute: Lambda (Node.js 20.x)
- API: Lambda Function URLs (free)
- Storage: S3 (presigned URLs)
- Hosting: Amplify
- IaC: SAM/CloudFormation
- Client: @supabase/supabase-js (drop-in compatible)

API Gateway is available as an extension (`boa extend api-gateway`) for rate limiting, WAF, or custom domains.

## References
- Full skill: `skills/boa/SKILL.md`
- Pitfalls: `docs/PITFALLS.md`
- Architecture: `docs/ARCHITECTURE.md`
- SAM template: `templates/backend.yaml`
- Lambda handlers: `lambda-templates/index.mjs` (pgrest-lambda engine), `lambda-templates/authorizer.mjs`, `lambda-templates/presigned-upload.mjs`
