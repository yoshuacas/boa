---
outline: deep
---

# The BOA Backend

Every service in the BOA backend is serverless. No servers to manage, no capacity planning, pay only for what you use.

## Aurora DSQL — Database

**What it is:** Aurora DSQL is a serverless, PostgreSQL-compatible database from AWS. It gives you a fully managed PostgreSQL database that automatically scales up and down based on demand, including scaling to zero when idle.

**Why PostgreSQL:** SQL is the language most developers already know. Relational databases with proper schemas, joins, and constraints are the right fit for most applications. The PostgreSQL ecosystem — ORMs, migration tools, query builders — all work with DSQL.

**Why serverless:** Traditional databases (RDS, self-hosted PostgreSQL) require you to pick an instance size, manage storage, handle backups, and pay even when idle. DSQL handles all of that. You pay per database operation (DPU), and idle databases cost nothing.

**Key details:**
- PostgreSQL wire-compatible (use any PostgreSQL driver)
- Connections use IAM auth tokens (no hardcoded passwords)
- Multi-AZ replication with strong consistency
- Free tier: 100K DPUs + 1 GB storage

## Amazon Cognito — Auth

**What it handles:** Sign up, sign in, password reset, email verification, MFA, social sign in (Google, Apple, etc.), and access token issuance. Cognito manages the entire auth flow so you do not build it yourself.

**Why Cognito:** It integrates directly with API Gateway as an authorizer — no custom auth middleware needed. End users authenticate with Cognito, get an access token, and API Gateway validates it automatically on every request.

**Pricing:** The first 10,000 monthly active end users (MAU) are free. After that, pricing starts at $0.0055 per MAU. For comparison, most auth services charge $0.01+ per MAU or require a paid plan.

**Key details:**
- Pre-signup Lambda trigger auto-confirms users (no manual confirmation step)
- `AllowAdminCreateUserOnly` must be set to `false` for self-signup
- Vite frontends need `global: 'globalThis'` polyfill for the Cognito SDK

## AWS Lambda — Compute

**What it is:** Lambda runs your backend code (API handlers, business logic, triggers) without servers. You upload a function, AWS runs it when called, and you pay per invocation.

**Why Node.js:** Lambda supports multiple runtimes, but BOA uses Node.js 20.x exclusively. Python Lambda functions frequently fail due to binary dependency issues (psycopg2, numpy, etc. require platform-specific compiled libraries). Node.js dependencies are pure JavaScript and deploy reliably every time.

**Key details:**
- 256 MB memory, 100ms average duration per invocation
- 1 million free requests per month
- 400,000 GB-seconds of compute free per month
- Never set `AWS_REGION` as an environment variable — it is reserved by Lambda. Use `REGION_NAME` instead.

## API Gateway (REST) — API Layer

**What it is:** API Gateway gives you a managed REST API with routing, request validation, throttling, and authorization. It sits in front of your Lambda functions and handles incoming HTTP requests.

**Why REST API (not HTTP API):** API Gateway offers two types: REST API and HTTP API. BOA uses REST API because it supports Cognito User Pool authorizers natively. HTTP API only supports JWT authorizers, which require additional configuration and do not integrate as cleanly with Cognito. REST API also supports request validation, usage plans, and API keys.

**Key details:**
- 1 million requests free per month (first 12 months)
- Cognito authorizer validates JWTs on every protected request
- CORS configuration handled in the SAM template
- Supports path parameters, query strings, and request bodies

## Amazon S3 — File Storage

**What it is:** S3 stores files — images, documents, uploads, exports. It is object storage with virtually unlimited capacity.

**Why presigned URLs:** BOA never makes S3 buckets public. Instead, your Lambda functions generate presigned URLs — temporary, signed links that allow a specific upload or download for a limited time. This keeps your bucket private while letting authenticated end users upload and download files directly.

**Key details:**
- 5 GB free storage (first 12 months)
- 20,000 GET requests + 2,000 PUT requests free per month
- Presigned URLs expire after a configurable time (default 15 minutes)
- Files are organized by user ID to enforce ownership

## AWS Amplify — Frontend Hosting

**What it is:** Amplify Hosting deploys your frontend (React, Vue, Next.js, plain HTML) with CI/CD from a Git repository. Push to your branch and Amplify builds and deploys automatically.

**Why Amplify:** It handles frontend hosting so you do not need to configure CloudFront, S3 static hosting, or a build pipeline yourself. Custom domains, HTTPS, and cache invalidation are included.

**Key details:**
- Free tier includes build minutes and hosting bandwidth
- Supports SPA (single-page app) routing
- Never use `/<*>` as the SPA redirect rule — use a regex that excludes static assets
- Custom domain setup with automatic SSL certificate
