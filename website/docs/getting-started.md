---
outline: deep
---

# Getting Started with BOA

Build your first serverless backend on AWS in under 10 minutes.

## Prerequisites

Before you start, make sure you have:

- **AWS account** — [Create one here](https://aws.amazon.com/) if you don't have one
- **AWS CLI configured** — Run `aws configure` with your access key and secret key. Region should be `us-east-1` (Aurora DSQL is available there).
- **Node.js 18+** — [Download from nodejs.org](https://nodejs.org/)
- **SAM CLI** — [Install the AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

Verify your setup:

```bash
aws sts get-caller-identity   # Should show your account ID
node --version                # Should be 18.x or higher
sam --version                 # Should be 1.x or higher
```

## Install BOA in Your Coding Agent

### Claude Code (recommended)

```bash
claude plugin install boa
```

### Other agents

See the [install page](/install) for Kiro, VS Code Copilot, and Codex instructions.

## Build Your First Backend

Open your coding agent and tell it:

```
Build a todo app with user accounts
```

BOA will guide your agent to:

1. Write migration files for a `todos` table and a `users` table, then apply them
2. Set up a Cognito user pool with self-signup and email verification
3. Deploy a pre-signup Lambda trigger that auto-confirms users
4. Create Lambda functions for CRUD operations on todos
5. Wire up API Gateway (REST) with Cognito authorization
6. Configure S3 for file attachments (if requested)
7. Generate a SAM template and deploy everything

## What Gets Created

After your agent deploys, you will have:

| Resource | What it is |
|----------|------------|
| **Aurora DSQL cluster** | A serverless PostgreSQL database with your app's tables |
| **Cognito user pool** | User sign-up and sign-in with email/password |
| **Lambda functions** | Node.js handlers for each API endpoint |
| **API Gateway (REST)** | Public API with Cognito-based authorization |
| **S3 bucket** | Private file storage with presigned URL access |
| **SAM template** | Infrastructure-as-code in `template.yaml` |
| **Migration files** | Numbered SQL files in `migrations/` that define your schema |

All resources are created in your AWS account. You own them.

## Verify It Works

### Test sign-up

```bash
aws cognito-idp sign-up \
  --client-id YOUR_CLIENT_ID \
  --username testuser@example.com \
  --password TestPass123!
```

The pre-signup trigger auto-confirms the user, so they can sign in immediately.

### Test API call

```bash
# Get an auth token
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --query 'AuthenticationResult.IdToken' --output text)

# Call your API
curl -H "Authorization: $TOKEN" https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/todos
```

You should get an empty array `[]` (no todos yet).

## Next Steps

- **Open the dashboard** — Run `open .boa/dashboard/index.html` to see your backend visually
- **Add features** — Tell your agent to add new endpoints, tables, or file upload support
- **Read the architecture docs** — See `plugin/docs/ARCHITECTURE.md` for schema patterns per app type
- **Learn about migrations** — See [migrations](/docs/migrations) to understand how schema changes work
- **Check the pricing** — See [pricing](/pricing) to understand costs as you scale
