# BOA — Backend on AWS

BOA is an open-source skill that teaches coding agents to build production-ready, serverless backends on AWS. The backend uses Aurora DSQL (serverless PostgreSQL), better-auth (via pgrest-lambda), AWS Lambda (Node.js 20.x), API Gateway REST with AWS WAF, Amazon S3, AWS Amplify, and CloudFormation.

## Critical Rules

Follow these rules when building BOA backends. They come from real failures observed across hundreds of AI agent builds.

1. **Always `AllowAdminCreateUserOnly: false`** for Cognito self-signup
2. **Always deploy a pre-signup Lambda** that auto-confirms users
3. **Always use Node.js for Lambda** — never Python (binary dependency failures)
4. **Never set `AWS_REGION` as a Lambda env var** — it is reserved; use `REGION_NAME`
5. **Never make S3 buckets public** — always use presigned URLs
6. **Always add `global: 'globalThis'` polyfill** to Vite config for Cognito SDK browser compatibility
7. **Never use `/<*>` as Amplify SPA redirect** — use regex excluding static assets
8. **DSQL requires IAM auth tokens** for connections — never hardcode credentials
9. **Extensions are optional** — the default backend works without any extensions

## Backend

| Layer | Service |
|-------|---------|
| Database | Aurora DSQL (serverless PostgreSQL) |
| Auth | Amazon Cognito |
| Authorization | Access policies (deny-by-default) |
| Compute | Lambda (Node.js 20.x) |
| API | Lambda Function URLs (free) |
| Storage | Amazon S3 |
| Hosting | AWS Amplify |
| IaC | CloudFormation |

API Gateway is available as an extension (`boa extend api-gateway`) for rate limiting, WAF, or custom domains.

## References

For full skill instructions, patterns, and templates, see:

- **Full skill:** `plugin/skills/boa/SKILL.md`
- **Pitfalls and fixes:** `plugin/docs/PITFALLS.md`
- **Architecture patterns:** `plugin/docs/ARCHITECTURE.md`
- **DSQL patterns:** `plugin/docs/DSQL-PATTERNS.md`
- **Auth patterns:** `plugin/docs/AUTH-PATTERNS.md`
- **API patterns:** `plugin/docs/API-PATTERNS.md`
- **Storage patterns:** `plugin/docs/STORAGE-PATTERNS.md`
- **CloudFormation template:** `cli/templates/backend.yaml`
- **Lambda handlers:** `plugin/lambda-templates/`
