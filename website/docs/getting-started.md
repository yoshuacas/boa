---
outline: deep
---

# Getting Started with BOA

Build your first serverless backend on AWS in under 10 minutes.

## Prerequisites

### 1. AWS account

If you don't have one, [create a free account](https://aws.amazon.com/free/). You need an email, password, and payment method. The free tier covers everything BOA uses for development.

### 2. Install tools

**macOS** (one command):

```bash
brew install awscli aws-sam-cli node jq libpq && brew link --force libpq
```

**Linux (Ubuntu/Debian)**:

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
  && unzip -qo /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install

# SAM CLI, Node.js, psql, jq
pip3 install aws-sam-cli
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-client jq
```

### 3. Sign in to AWS

```bash
aws login
```

This opens your browser. Sign in with your AWS account, and credentials are stored locally for 12 hours. No access keys needed.

### 4. Verify

```bash
aws sts get-caller-identity   # Should show your account ID
sam --version                 # Should be 1.x or higher
node --version                # Should be 18.x or higher
psql --version                # Should be 14.x or higher
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

If any tools are missing, BOA will detect them and walk you through installation before proceeding.

Once setup is complete, BOA will guide your agent to:

1. Deploy the full serverless stack (DSQL, Cognito, Lambda, API Gateway, S3) with one command
2. Write migration files for your app's data model and apply them
3. Connect your frontend using `@supabase/supabase-js` — every table is automatically available as a REST endpoint
4. Configure S3 for file attachments (if requested)
5. Verify everything works

## What Gets Created

After your agent deploys, you will have:

| Resource | What it is |
|----------|------------|
| **Aurora DSQL cluster** | A serverless PostgreSQL database with your app's tables |
| **Cognito user pool** | User sign-up and sign-in with email/password |
| **Lambda functions** | Thin handlers powered by pgrest-lambda — auto-generates REST API for all tables |
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
# Read anonKey from .boa/config.json
ANON_KEY=$(jq -r '.anonKey' .boa/config.json)
API_URL=$(jq -r '.apiUrl' .boa/config.json)

# Sign in and get a token
TOKEN=$(curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPass123!"}' \
  | jq -r '.access_token')

# Call your API
curl -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  "$API_URL/rest/v1/todos"
```

You should get an empty array `[]` (no todos yet).

## Next Steps

- **Open the dashboard** — Run `open .boa/dashboard/index.html` to see your backend visually
- **Add features** — Tell your agent to add new endpoints, tables, or file upload support
- **Read the architecture docs** — See `plugin/docs/ARCHITECTURE.md` for schema patterns per app type
- **Learn about migrations** — See [migrations](/docs/migrations) to understand how schema changes work
- **Check the pricing** — See [pricing](/pricing) to understand costs as you scale
