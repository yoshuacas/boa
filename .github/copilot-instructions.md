# BOA — Backend on AWS

BOA is an open-source skill that teaches coding agents to build production-ready, serverless backends on AWS. The stack uses Aurora DSQL (serverless PostgreSQL), Amazon Cognito, AWS Lambda (Node.js 20.x), API Gateway (REST), Amazon S3, AWS Amplify, and SAM/CloudFormation.

## Critical Rules

Follow these rules when building BOA backends. They come from real failures observed across hundreds of AI agent builds.

1. **Always `AllowAdminCreateUserOnly: false`** for Cognito self-signup
2. **Always deploy a pre-signup Lambda** that auto-confirms users
3. **Always use REST API Gateway** (not HTTP API) — required for Cognito authorizers
4. **Always use Node.js for Lambda** — never Python (binary dependency failures)
5. **Never set `AWS_REGION` as a Lambda env var** — it is reserved; use `REGION_NAME`
6. **Never make S3 buckets public** — always use presigned URLs
7. **Always add `global: 'globalThis'` polyfill** to Vite config for Cognito SDK browser compatibility
8. **Never use `/<*>` as Amplify SPA redirect** — use regex excluding static assets
9. **DSQL requires IAM auth tokens** for connections — never hardcode credentials

## Stack

| Layer | Service |
|-------|---------|
| Database | Aurora DSQL (serverless PostgreSQL) |
| Auth | Amazon Cognito |
| Authorization | Cedar (policy-as-code) |
| Compute | Lambda (Node.js 20.x) |
| API | API Gateway (REST) |
| Storage | Amazon S3 |
| Hosting | AWS Amplify |
| IaC | SAM / CloudFormation |

## References

For full skill instructions, patterns, and templates, see:

- **Full skill:** `plugin/skills/boa/SKILL.md`
- **Pitfalls and fixes:** `plugin/docs/PITFALLS.md`
- **Architecture patterns:** `plugin/docs/ARCHITECTURE.md`
- **DSQL patterns:** `plugin/docs/DSQL-PATTERNS.md`
- **Auth patterns:** `plugin/docs/AUTH-PATTERNS.md`
- **API patterns:** `plugin/docs/API-PATTERNS.md`
- **Storage patterns:** `plugin/docs/STORAGE-PATTERNS.md`
- **SAM template:** `plugin/templates/backend.yaml`
- **Lambda handlers:** `plugin/lambda-templates/`
