# BOA — Backend on AWS

Build serverless backends on AWS using Aurora DSQL (PostgreSQL), Cognito, Lambda, API Gateway, and S3.

## When to use this
When building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage.

## Critical rules
1. Always `AllowAdminCreateUserOnly: false` for Cognito self-signup
2. Always deploy pre-signup Lambda that auto-confirms users
3. Always use REST API Gateway (not HTTP API) for Cognito authorizers
4. Always use Node.js for Lambda — never Python (binary deps break)
5. Never set `AWS_REGION` as Lambda env var — reserved; use `REGION_NAME`
6. Never make S3 buckets public — always use presigned URLs
7. Always add `global: 'globalThis'` polyfill to Vite for Cognito SDK
8. Never use `/<*>` as Amplify SPA redirect
9. DSQL uses IAM auth tokens — never hardcode credentials

## Stack
- Database: Aurora DSQL (serverless PostgreSQL)
- Auth: Amazon Cognito
- Compute: Lambda (Node.js 20.x)
- API: API Gateway (REST)
- Storage: S3 (presigned URLs)
- Hosting: Amplify
- IaC: SAM/CloudFormation

## References
- Full skill: `skills/boa/SKILL.md`
- Pitfalls: `docs/PITFALLS.md`
- Architecture: `docs/ARCHITECTURE.md`
- SAM template: `templates/backend.yaml`
- Lambda handlers: `lambda-templates/`
