---
outline: deep
---

# Frequently Asked Questions

## Is this free?

BOA itself is free and open source (Apache 2.0 license). The AWS services it deploys have their own pricing, but each includes a free tier that covers most prototypes and early-stage apps.

A typical productivity app with 1,000 users costs $0/month on BOA. The combined free tiers include: 100K DSQL DPUs, 10K Cognito MAUs, 1M Lambda requests, 1M API Gateway requests, and 5 GB S3 storage.

See the [pricing calculator](/pricing) for exact costs at your scale.

## Why not Supabase?

Both are valid choices. The differences:

- **Infrastructure ownership:** BOA deploys to your AWS account. You own and control everything. Supabase is a managed service where your data lives on their infrastructure.
- **Scales to zero:** Every BOA service is serverless and costs nothing when idle. Supabase requires a $25/month Pro plan once you exceed the free tier limits (0.5 GB database, 50 concurrent connections).
- **No re-architecture:** The same BOA stack that runs your prototype handles millions of users. AWS services scale automatically. With Supabase, you may need to upgrade compute tiers or migrate to a larger plan.
- **AWS ecosystem:** BOA backends integrate with any AWS service (SQS, SNS, Step Functions, EventBridge, etc.) since they are already in your AWS account.

## Why Aurora DSQL and not DynamoDB?

- **SQL you already know:** Most developers know SQL. DynamoDB requires learning a different data modeling paradigm (single-table design, access pattern-driven schemas) that AI agents frequently get wrong.
- **Relational model:** Most applications have relational data (users have posts, posts have comments, orders have items). PostgreSQL handles this naturally with joins and foreign keys.
- **PostgreSQL ecosystem:** Every ORM, migration tool, and query builder that works with PostgreSQL works with DSQL. DynamoDB has a much smaller ecosystem.
- **Serverless:** Unlike RDS PostgreSQL, DSQL is truly serverless — it scales to zero and you pay per operation.

## Why Node.js and not Python?

Lambda supports both, but BOA uses Node.js exclusively for a practical reason: **Python Lambda functions frequently break due to binary dependency issues.**

Libraries like `psycopg2` (PostgreSQL driver for Python) require platform-specific compiled binaries. When you install them on macOS and deploy to Lambda (Amazon Linux), the binaries are incompatible. This requires Lambda layers, Docker builds, or `psycopg2-binary` (which has its own issues). AI agents consistently fail to handle this correctly.

Node.js dependencies are pure JavaScript. They install the same way on every platform and deploy to Lambda without special handling.

## Can I use this without a coding agent?

Yes. Install the BOA CLI and use it directly from your terminal:

```bash
npm install -g boa-cli
boa init my-app
```

The CLI handles everything — prerequisite checks, stack deployment, migrations, and verification. The agent skill uses the same CLI under the hood, so you get the same results either way.

You also have direct access to the underlying artifacts:

- **SAM templates** in `plugin/templates/` define the infrastructure
- **Lambda handlers** in `plugin/lambda-templates/` are ready-to-use Node.js functions
- **Documentation** in `plugin/docs/` explains every pattern and pitfall

## Is this an official AWS service?

No. BOA is a community-driven open-source project from AWS. It is not an AWS service, it does not have an SLA, and it is not covered by AWS Support. It is a set of patterns, templates, and documentation that help you build backends on AWS services.
