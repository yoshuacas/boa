---
name: boa
description: Build serverless backends on AWS with Aurora DSQL, Cognito, Lambda, API Gateway, and S3. Use when building a backend, deploying to AWS, setting up auth, creating APIs, or adding storage. Covers the same capabilities as Supabase but fully serverless on AWS.
license: Apache-2.0
compatibility: Requires AWS CLI configured with credentials, Node.js 18+, SAM CLI
allowed-tools: "Bash(sam *) Bash(aws *) Bash(node *) Bash(npm *) Read Grep Glob Write Edit"
metadata:
  author: aws
  version: "0.1"
---

# BOA — Backend on AWS

Build a complete serverless backend on AWS. This skill is extremely opinionated.
There is one way to do things — the way that works.

## Architecture

```
Client App (React/Next.js/Vue)
    │
    ▼
API Gateway (REST) ─── Cognito Authorizer (JWT validation)
    │
    ▼
Lambda (Node.js 20.x) ─── Business logic
    │
    ├──▶ Aurora DSQL ─── PostgreSQL database (serverless, scales to zero)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ Cognito ─── User management (signup, signin, MFA)
```

Everything is serverless. No servers to manage. Scales to zero. Scales to millions.

## Critical Rules

These come from hundreds of real AI-built backends. Every rule prevents a real failure.

1. **Cognito self-signup**: Always set `AllowAdminCreateUserOnly: false`
2. **Pre-signup trigger**: Always deploy a Lambda that auto-confirms users
3. **API Gateway type**: Always use REST (not HTTP API) — required for Cognito authorizers
4. **Lambda runtime**: Always Node.js 20.x — never Python (binary dependency failures in Lambda)
5. **Reserved env vars**: Never set `AWS_REGION` as Lambda env var — use `REGION_NAME`
6. **S3 security**: Never make buckets public — always use presigned URLs
7. **Vite polyfill**: Always add `global: 'globalThis'` in Vite config for Cognito SDK
8. **Amplify redirects**: Never use `/<*>` as SPA redirect — use regex excluding static assets
9. **DSQL auth**: Always use IAM authentication tokens — never hardcode credentials

## Step 1: Prerequisites

Before starting, verify:

```bash
aws sts get-caller-identity    # AWS credentials configured
sam --version                   # SAM CLI installed (>= 1.100)
node --version                  # Node.js >= 18
```

If SAM is not installed: `brew install aws-sam-cli` (macOS) or see https://docs.aws.amazon.com/sam/

## Step 2: Deploy the Backend

Use the BOA SAM template. It creates everything in one deployment.

```bash
# From the project root
STACK_NAME="my-app"
REGION="us-east-1"

sam build --template-file $(dirname ${CLAUDE_SKILL_DIR})/templates/backend.yaml

sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides ProjectName="$STACK_NAME"
```

This creates: DSQL cluster, Cognito user pool, Lambda function, REST API, S3 bucket.

After deploy, extract the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
```

Save the outputs — you need `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `BucketName`, `DsqlEndpoint`.

Write them to `.boa/config.json` in the project root:

```json
{
  "stackName": "my-app",
  "region": "us-east-1",
  "apiUrl": "<ApiUrl output>",
  "userPoolId": "<UserPoolId output>",
  "userPoolClientId": "<UserPoolClientId output>",
  "bucketName": "<BucketName output>",
  "dsqlEndpoint": "<DsqlEndpoint output>"
}
```

## Step 3: Create the Database Schema

Connect to DSQL and create tables. DSQL uses IAM auth tokens:

```bash
# Generate auth token
TOKEN=$(aws dsql generate-db-connect-admin-auth-token \
  --hostname <DsqlEndpoint> \
  --region "$REGION")

# Connect with psql
PGPASSWORD="$TOKEN" psql \
  "host=<DsqlEndpoint> port=5432 dbname=postgres user=admin sslmode=require"
```

Create your schema using standard PostgreSQL SQL. See [DSQL-PATTERNS.md](../../docs/DSQL-PATTERNS.md) for per-app-type schemas and migration patterns.

Example (todo app):

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_todos_user ON todos(user_id);
```

## Step 4: Lambda Function Code

Copy the Lambda handler from the BOA templates:

```bash
cp -r $(dirname ${CLAUDE_SKILL_DIR})/lambda-templates/ backend/
cd backend && npm install
```

The `crud-api.mjs` handler provides:
- CRUD operations on any PostgreSQL table
- JWT token extraction from Cognito authorizer
- Connection pooling via DSQL IAM auth tokens
- CORS headers
- Error handling with proper HTTP status codes

Customize routes in `crud-api.mjs` for your app's domain model.

## Step 5: Frontend Configuration

Configure the frontend to use Cognito for auth and the API Gateway endpoint:

```javascript
// src/config.js
export const config = {
  apiUrl: '<ApiUrl from stack outputs>',
  auth: {
    region: '<REGION>',
    userPoolId: '<UserPoolId>',
    userPoolWebClientId: '<UserPoolClientId>',
  },
};
```

For Vite projects, add to `vite.config.js`:

```javascript
export default defineConfig({
  define: {
    global: 'globalThis',  // REQUIRED for Cognito SDK
  },
  // ... rest of config
});
```

## Step 6: Verify Deployment

Run these checks after every deployment:

1. **Cognito self-signup enabled:**
   ```bash
   aws cognito-idp describe-user-pool \
     --user-pool-id <UserPoolId> \
     --query 'UserPool.Policies.PasswordPolicy'
   ```

2. **API returns 401 (not 500):**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" <ApiUrl>/items
   # Should be 401 (Unauthorized), not 500 (broken)
   ```

3. **Create a test user:**
   ```bash
   aws cognito-idp sign-up \
     --client-id <UserPoolClientId> \
     --username testuser@example.com \
     --password 'TestPass123!'
   ```

4. **Frontend loads:**
   Open the Amplify URL and verify the page renders (not blank white screen).

## Dashboard

When you want to visualize or manage your backend:

1. Check if `.boa/dashboard/index.html` exists in the project
2. If not, fetch the dashboard pages from the BOA repository:
   ```bash
   mkdir -p .boa/dashboard
   for file in index.html database.html auth.html functions.html api.html storage.html; do
     curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/$file" -o ".boa/dashboard/$file"
   done
   mkdir -p .boa/dashboard/css .boa/dashboard/js
   curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/css/dashboard.css" -o ".boa/dashboard/css/dashboard.css"
   curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/js/aws-cli-bridge.js" -o ".boa/dashboard/js/aws-cli-bridge.js"
   curl -sL "https://raw.githubusercontent.com/aws/boa/main/dashboard/js/dashboard-core.js" -o ".boa/dashboard/js/dashboard-core.js"
   ```
3. The dashboard reads `.boa/config.json` for stack details
4. Open `.boa/dashboard/index.html` in the browser

## Deep References

Load these when you need detailed patterns for a specific concern:

- [PITFALLS.md](../../docs/PITFALLS.md) — Every known failure with severity and fix
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — DSQL schema patterns per app type
- [DSQL-PATTERNS.md](../../docs/DSQL-PATTERNS.md) — SQL patterns, migrations, RLS, IAM auth
- [AUTH-PATTERNS.md](../../docs/AUTH-PATTERNS.md) — Cognito flows, token handling, MFA
- [API-PATTERNS.md](../../docs/API-PATTERNS.md) — API Gateway + Lambda patterns
- [STORAGE-PATTERNS.md](../../docs/STORAGE-PATTERNS.md) — S3 presigned URLs, file management

## Teardown

To remove a BOA backend completely:

```bash
# Empty S3 bucket first (CloudFormation can't delete non-empty buckets)
aws s3 rm s3://<BucketName> --recursive

# Delete the stack
sam delete --stack-name "$STACK_NAME" --region "$REGION" --no-prompts
```
