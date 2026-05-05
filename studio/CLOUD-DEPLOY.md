# Deploying BOA Studio to AWS Amplify

BOA Studio runs locally out of the box. This guide covers deploying it to AWS
Amplify so your team can access it from a browser without local setup.

## Prerequisites

- An existing BOA stack already deployed (`boa init` has been run)
- AWS CLI configured with permissions to create Amplify apps and IAM roles
- The BOA stack config stored in SSM (see step 2)

---

## Step 1 — Write stack config to SSM

BOA Studio reads its stack configuration from SSM Parameter Store in cloud mode.
Copy your `.boa/config.json` content into an SSM parameter:

```bash
aws ssm put-parameter \
  --name "/your-stack-name/studio-config" \
  --value "$(cat .boa/config.json)" \
  --type SecureString \
  --region us-east-1
```

Note the parameter path — you'll need it in step 4.

---

## Step 2 — Create an IAM role for Amplify

Create a role that Amplify can assume, and attach the Studio policy.

```bash
# Create the trust policy
cat > /tmp/amplify-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "amplify.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create the role
aws iam create-role \
  --role-name boa-studio-amplify-role \
  --assume-role-policy-document file:///tmp/amplify-trust.json

# Attach the Studio permissions (from iam-policy.json in this repo)
aws iam put-role-policy \
  --role-name boa-studio-amplify-role \
  --policy-name boa-studio-permissions \
  --policy-document file://iam-policy.json
```

---

## Step 3 — Create the Amplify app

In the AWS Console, go to **Amplify → New app → Host web app**, connect your
Git repository, and select the branch to deploy.

Amplify will detect `amplify.yml` automatically.

Under **Service role**, select the `boa-studio-amplify-role` you created above.

---

## Step 4 — Set environment variables

In the Amplify Console, go to **App settings → Environment variables** and add the
variables for your chosen auth strategy.

**Always required:**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_STUDIO_MODE` | `cloud` |
| `STUDIO_SSM_CONFIG_PATH` | `/your-stack-name/studio-config` |
| `STUDIO_SESSION_SECRET` | `$(openssl rand -hex 32)` |

---

**Option A — Token auth (default, single shared password):**

| Variable | Value |
|---|---|
| `STUDIO_AUTH` | `token` |
| `STUDIO_ACCESS_TOKEN` | `$(openssl rand -hex 24)` |

Users type the access token at the `/login` page. Share it with your team via
a password manager. Rotate `STUDIO_ACCESS_TOKEN` to revoke all access.

---

**Option B — Cognito auth (per-user accounts):**

First, create a dedicated Cognito User Pool for Studio:

```bash
# Create the pool
POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name boa-studio-admins \
  --auto-verified-attributes email \
  --region us-east-1 \
  --query 'UserPool.Id' --output text)

# Create an app client with USER_PASSWORD_AUTH enabled
CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name boa-studio \
  --explicit-auth-flows USER_PASSWORD_AUTH \
  --no-generate-secret \
  --region us-east-1 \
  --query 'UserPoolClient.ClientId' --output text)

echo "Pool: $POOL_ID  Client: $CLIENT_ID"

# Create the first admin user
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username admin@example.com \
  --temporary-password 'TempPass123!' \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true \
  --region us-east-1

aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID \
  --username admin@example.com \
  --password 'YourPermanentPassword123!' \
  --permanent \
  --region us-east-1
```

Then set these Amplify env vars:

| Variable | Value |
|---|---|
| `STUDIO_AUTH` | `cognito` |
| `STUDIO_COGNITO_USER_POOL_ID` | `$POOL_ID` from above |
| `STUDIO_COGNITO_CLIENT_ID` | `$CLIENT_ID` from above |
| `STUDIO_COGNITO_REGION` | `us-east-1` |

Add/remove team members via the Cognito console or `aws cognito-idp admin-create-user`.

---

## Step 5 — Deploy

Trigger a deployment in Amplify. Once live, navigate to the Amplify URL and
sign in with the `STUDIO_ACCESS_TOKEN` you set above.

---

## Security notes

- `STUDIO_ACCESS_TOKEN` is a shared secret. Rotate it by updating the Amplify
  env var and redeploying — active sessions expire after 7 days automatically.
- The IAM role grants Lambda and DSQL access. Scope the `Resource` ARNs in
  `iam-policy.json` to your specific stack if you want tighter controls.
- Session cookies are `httpOnly`, `secure` (in production), and `SameSite=Lax`.

---

## Local mode

Nothing changes for local development. `NEXT_PUBLIC_STUDIO_MODE` defaults to
`local` when not set, which skips auth entirely and reads config from disk.
