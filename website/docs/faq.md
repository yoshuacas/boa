# FAQ

Common questions about BOA, what it costs, and how it compares.

## What does it cost?

BOA is free and open source. It costs nothing to use — no fees, no tiers, no paid plans.

You pay only for the AWS services your backend uses, and each one has a generous free tier. A typical app with 1,000 customers costs **$0/month** on AWS:

| Service | Free tier |
|---------|-----------|
| Database (Aurora DSQL) | 100K DPUs/month |
| Authentication (Cognito) | 10,000 MAU |
| Functions (Lambda) | 1M requests/month |
| API endpoint (API Gateway) | 1M requests/month |
| File storage (S3) | 5 GB storage |

Most apps stay within free tier through early growth. When you do exceed it, costs scale linearly -- there is no cliff where you jump to a $25/month or $100/month paid plan.

Use the [pricing calculator](/pricing) to estimate costs at your specific scale.

## How does it compare to Supabase?

Both are solid choices. Pick based on what matters to you:

- **Client code is identical.** BOA uses `@supabase/supabase-js` as its client library. Switching between them requires changing one URL and one key.
- **Ownership.** BOA deploys to your AWS account. You own and control everything. With Supabase, your data lives on their servers.
- **Cost model.** BOA scales to true zero -- every service is serverless and costs nothing when idle. Supabase requires a $25/month Pro plan once you exceed free tier limits (0.5 GB database, 50 concurrent connections).
- **Scaling path.** The same BOA backend that runs your prototype handles millions of customers. With Supabase, scaling may require upgrading compute tiers or migrating plans.
- **AWS ecosystem.** Since BOA runs in your AWS account, you can integrate with any AWS service (SQS, SNS, Step Functions, EventBridge, etc.) directly.
- **Convenience.** Supabase gives you a dashboard, realtime subscriptions, and edge functions out of the box. BOA requires more setup but gives you full control.

## Why PostgreSQL (DSQL) instead of DynamoDB?

- **SQL you already know.** Most developers know SQL. DynamoDB requires learning single-table design and access-pattern-driven schemas -- a paradigm AI agents frequently get wrong.
- **Relational data fits most apps.** Users have posts, posts have comments, orders have items. PostgreSQL handles this naturally with joins and foreign keys. DynamoDB requires denormalization that is hard to evolve.
- **PostgreSQL ecosystem.** Every ORM, migration tool, and query builder that works with PostgreSQL works with DSQL. DynamoDB's ecosystem is much smaller.
- **Still serverless.** Unlike RDS PostgreSQL, DSQL is truly serverless -- it scales to zero and you pay per operation. You get PostgreSQL without managing instances.

## Why Node.js instead of Python?

Python Lambda functions frequently break due to binary dependency issues.

Libraries like `psycopg2` (the PostgreSQL driver for Python) require platform-specific compiled binaries. Install on macOS, deploy to Lambda (Amazon Linux), and the binaries are incompatible. The workarounds -- Lambda layers, Docker builds, `psycopg2-binary` -- each have their own failure modes. AI agents consistently get this wrong.

Node.js dependencies are pure JavaScript. They install identically on every platform and deploy to Lambda without special handling. This is a pragmatic choice, not a language preference.

## Can I use BOA without a coding agent?

Yes. Install the CLI and use it from your terminal:

```bash
git clone https://github.com/yoshuacas/boa.git ~/boa
cd ~/boa/cli && npm link && cd ~
aws sso login        # authenticate with AWS
boa init my-app      # deploy the full backend
```

The CLI handles prerequisite checks, deployment, migrations, and verification. The agent skill calls the same CLI under the hood, so you get identical results either way.

## What is pgrest-lambda?

[pgrest-lambda](https://github.com/yoshuacas/pgrest-lambda) is an npm package that runs PostgREST-compatible REST endpoints and GoTrue-compatible auth endpoints on AWS Lambda. It is the engine behind BOA's API layer.

What this gives you:

- **Every database table becomes a REST endpoint automatically.** Create a `todos` table, and `/rest/v1/todos` is immediately available with full CRUD, filtering, sorting, and pagination.
- **Auth endpoints match the Supabase auth API.** Sign up, sign in, and token refresh at `/auth/v1/*` work with `@supabase/supabase-js` out of the box.
- **Lambda handlers are thin wrappers.** The actual handlers are ~20 lines that delegate to pgrest-lambda. All the logic lives in the package.

This is what makes BOA Supabase-compatible at the API level while running entirely on AWS.

## Can I add AWS services BOA doesn't include?

Yes. It is your AWS account. Add anything you want.

BOA deploys a specific set of services because they cover the most common backend needs. But there is nothing stopping you from adding SQS queues, Step Functions, EventBridge rules, DynamoDB tables for specific use cases, or any other AWS service alongside your BOA backend.

The SAM template is standard CloudFormation. You can extend it directly, or manage additional resources in a separate template.

## What happens if I outgrow BOA?

You stop using the CLI. That is it.

BOA deploys standard AWS services using standard SAM/CloudFormation templates. There is no proprietary runtime, no custom abstraction layer, no vendor lock-in. Your database is PostgreSQL. Your auth is Cognito. Your compute is Lambda. Your API is API Gateway.

If you reach a point where you need a different architecture -- containers, custom VPCs, a dedicated database instance -- you can evolve the CloudFormation stack directly, migrate specific services, or continue using parts of BOA while replacing others. Nothing is locked in.

## Is this an official AWS service?

No. BOA is an open-source project built by AWS developers. It is not an AWS service, does not have an SLA, and is not covered by AWS Support.

It uses AWS services (DSQL, Cognito, Lambda, API Gateway, S3, Amplify) and encodes best practices for combining them into a backend. But BOA itself is a community project under the Apache 2.0 license.
