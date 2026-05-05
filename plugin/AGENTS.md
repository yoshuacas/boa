# BOA — Backend on AWS

Build serverless backends on AWS using Aurora DSQL (PostgreSQL), better-auth, Lambda behind API Gateway REST + WAF, and S3.

## When to use this
When building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage.

## Critical rules
1. New projects use `AUTH_PROVIDER=better-auth`.
2. Always use Node.js for Lambda. Never Python (binary deps break).
3. Never set `AWS_REGION` as a Lambda env var. It is reserved. Use `REGION_NAME`.
4. Never make S3 buckets public. Always use presigned URLs.
5. Never use `/<*>` as the Amplify SPA redirect. Use a regex that excludes static assets.
6. DSQL uses IAM auth tokens. Never hardcode credentials.
7. Every table needs an access policy. Tables without policies return 403 on all requests.
8. API Gateway REST + WAF is the default traffic layer. ALB is available as an extension.
9. Extensions are optional. The default backend works without any extensions.

## Backend
- Database: Aurora DSQL (serverless PostgreSQL)
- Auth: better-auth (GoTrue-compatible) via pgrest-lambda
- Authorization: Cedar policies (deny by default)
- Engine: pgrest-lambda (PostgREST-compatible REST API, auto-generates endpoints from schema)
- Compute: Lambda (Node.js 20.x)
- API: API Gateway REST + WAF
- Storage: S3 (presigned URLs only)
- Hosting: Amplify
- IaC: CloudFormation
- Client: @supabase/supabase-js (drop-in compatible)

ALB is available as an extension (`boa extend alb`) for long-running requests, streaming, or high throughput.

## BOA Studio
BOA Studio is a web UI for managing your backend. Deploy it with `boa studio deploy --repo <url> --token <pat>`. Update with `boa studio update`. Remove with `boa studio remove`.

## References
- Full skill: `skills/boa/SKILL.md`
- Pitfalls: `docs/PITFALLS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Lambda handlers: `lambda-templates/index.mjs` (pgrest-lambda engine), `lambda-templates/presigned-upload.mjs`
