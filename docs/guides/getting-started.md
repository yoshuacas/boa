# Getting Started

Deploy a backend to your AWS account in one command. At the end of this guide, you'll have a live database, authentication, REST API, and file storage — all callable from your frontend with `@supabase/supabase-js`.

**Time:** ~5 minutes with tools installed, ~10 minutes from scratch.

## What you'll build

```
Your frontend (React, Next.js, Vue, etc.)
    │
    ▼
@supabase/supabase-js  ──  same client you'd use with Supabase
    │
    ▼
API Gateway  ──  BOA Authorizer (validates tokens)
    │
    ▼
Lambda  ──  pgrest-lambda (auto-generates REST API from your tables)
    │
    ├──▶ PostgreSQL  ──  your database
    ├──▶ S3  ──  private file storage
    └──▶ Cognito  ──  sign up and sign in
```

It costs nothing when idle and handles traffic increases automatically. You own every resource in your AWS account.

## Check prerequisites

```bash
boa check
```

This verifies your tools, AWS credentials, and region in one shot.

If the BOA CLI isn't installed yet:

```bash
git clone https://github.com/yoshuacas/boa.git ~/boa
cd ~/boa/cli && npm link && cd ~
```

<details>
<summary><strong>If tools are missing (expand for install commands)</strong></summary>

**macOS (one command):**

```bash
brew install awscli aws-sam-cli node jq libpq && brew link --force libpq
```

**Linux (Ubuntu/Debian):**

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
  && unzip -qo /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install

# SAM CLI, Node.js, psql, jq
pip3 install aws-sam-cli
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql-client jq
```

</details>

<details>
<summary><strong>If AWS credentials are missing</strong></summary>

If you already have the AWS CLI configured, you're good — `boa check` will confirm it. If not, see the [AWS CLI quickstart guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html) for setup options (SSO, IAM Identity Center, or access keys).

The fastest path for most developers:

```bash
aws sso login
```

This opens your browser to sign in. Credentials last 12 hours.

If you don't have an AWS account, [create one free](https://aws.amazon.com/free/). The free tier covers everything BOA uses for development.

</details>

After installing anything, re-run `boa check` to confirm.

## Deploy your backend

```bash
mkdir my-app && cd my-app
boa init my-app --region us-east-1
```

This takes 3–5 minutes. BOA creates your database, authentication, the REST API, file storage, and a SAM template to manage it all.

**If this fails:** The most common causes are an expired AWS session (`aws sso login` to fix), SAM CLI not installed, or using a region that doesn't support DSQL (stick to `us-east-1` or `us-east-2`).

## What just happened

BOA created a `.boa/config.json` file in your project with everything you need to connect:

```json
{
  "apiUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
  "anonKey": "eyJhbGciOiJIUzI...",
  "serviceRoleKey": "eyJhbGciOiJIUzI...",
  "region": "us-east-1",
  "stackName": "my-app"
}
```

| What was created | What it does |
|------------------|-------------|
| PostgreSQL database | Your database (empty, ready for tables) |
| Authentication | Sign up and sign in (works immediately) |
| Functions | pgrest-lambda — turns your tables into REST endpoints |
| API endpoint | Public HTTPS endpoint with authorization |
| File storage | Private storage with presigned URL access |
| SAM template | `template.yaml` — your entire backend as code |

## Verify it works

```bash
boa verify
```

This checks every component and reports its status. You should see all green.

## Sign up your first user

Auth works immediately — no tables or configuration needed.

```javascript
import { createClient } from '@supabase/supabase-js'

// Values from .boa/config.json
const supabase = createClient(
  'https://abc123.execute-api.us-east-1.amazonaws.com/prod',
  'eyJhbGciOiJIUzI...'  // anonKey
)

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'TestPass123!'
})

// Sign in
const { data: session } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'TestPass123!'
})

console.log('Signed in:', session.user.email)
```

Customers can sign in the moment they sign up -- no email verification step.

## Create your first table

Write a migration file:

```sql
-- migrations/001_create_todos.sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Deploy:

```bash
boa deploy
```

Now query your table from the frontend:

```javascript
// Insert a todo
await supabase.from('todos').insert({
  title: 'Build something great',
  user_id: session.user.id
})

// Fetch your todos
const { data: todos } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', session.user.id)
  .order('created_at', { ascending: false })

console.log(todos)
```

## What to do next

You have a working backend. **[Create more tables and relationships](/docs/database/tables)** to build out your app's data model.
