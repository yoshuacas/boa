---
name: boa-studio
description: Deploy and configure BOA Studio — the admin UI for BOA backends. Handles local dev setup, cloud deployment to AWS Amplify, auth configuration (token or Cognito), and first-run setup. Use when a developer wants to run, deploy, or configure BOA Studio.
license: Apache-2.0
compatibility: Requires Node.js 18+, AWS CLI (>= 2.32). Cloud deployment also requires an existing BOA backend (.boa/config.json).
allowed-tools: "Bash(aws *) Bash(npm *) Bash(node *) Bash(sam *) Bash(openssl *) Read Glob Write Edit"
metadata:
  author: boa-studio
  version: "0.1"
---

# BOA Studio — Deploy Skill

You are helping a developer get BOA Studio running. Be direct and conversational.
Ask one question at a time. Never run a destructive command without confirming first.

## What is BOA Studio?

BOA Studio is a local-first admin UI for BOA backends — database browser, SQL editor,
Cedar policy editor, auth management, function monitoring, and storage browser.
It runs locally against your AWS credentials, or can be deployed to Amplify for team access.

---

## Entry Point

Start by asking a single question:

> "Are you setting up BOA Studio for **local development**, or deploying it to **the cloud** for your team?"

Then follow the matching flow below.

---

## Flow A: Local Development

Local mode uses your ambient AWS credentials. No auth, no tokens, no infrastructure.

### Step 1 — Prerequisites

Check Node.js is installed and >= 18:

```bash
node --version
```

If missing or < 18, ask the developer to install it from https://nodejs.org before continuing.

Check AWS credentials are working:

```bash
aws sts get-caller-identity
```

If this fails, tell the developer: "Your AWS session has expired or credentials aren't configured.
Run `aws sso login` or set up credentials with `aws configure`, then try again."

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Find the BOA config

BOA Studio reads `.boa/config.json` from the project directory. Check for it:

```bash
ls .boa/config.json 2>/dev/null && echo "found" || echo "not found"
```

**If found:** confirm the stack name and region with the developer.

**If not found:** ask where their BOA project is. Common locations:
- Same directory (the studio is inside the BOA project)
- A sibling directory (`../my-app/.boa/config.json`)
- Home directory (`~/.boa/config.json`)

Tell them to set `BOA_CONFIG_PATH` in a `.env.local` file if it's not in a standard location:

```
BOA_CONFIG_PATH=/path/to/your-project/.boa/config.json
```

### Step 4 — Start the dev server

```bash
npm run dev
```

Tell the developer: "BOA Studio is running at http://localhost:3000 — open it in your browser."

### Step 5 — Confirm it's working

Ask: "Does the overview page load and show your stack name?"

- **Yes** → Done. Explain briefly: "You're in local mode — all changes go directly to your AWS resources using your local credentials. No login required."
- **No** → Diagnose:
  - "No BOA config found" → revisit Step 3
  - AWS errors → credentials issue, revisit Step 1
  - Port conflict → suggest `npm run dev -- -p 3001`

---

## Flow B: Cloud Deployment (AWS Amplify)

BOA Studio is a public repo. Teams point Amplify at the official repo — no fork needed.
The SAM template provisions the backend infrastructure; Amplify connects via the console.

### Step 1 — Prerequisites

Check AWS CLI and SAM CLI:

```bash
aws sts get-caller-identity
sam --version
```

If AWS fails, stop and fix credentials before continuing (same as Flow A, Step 1).
If SAM is missing: `pip3 install aws-sam-cli`.

Ask: "Which region is your BOA backend deployed in?"

Store this as `REGION` for use in later commands.

### Step 2 — Find the BOA config

```bash
cat .boa/config.json
```

If not found, ask the developer for the path. Extract:
- `stackName` — used as the SSM parameter prefix and resource name suffix
- Confirm the region matches what they said

### Step 3 — Choose auth mode and generate secrets

Ask: "How should Studio authenticate your team?

**A) Access token** — one shared password, simplest setup. Good for solo developers or small trusted teams.
**B) Cognito** — individual accounts per team member, invitation emails, can disable specific users. Better for larger teams.

Which do you prefer?"

Generate secrets based on their choice:

**Token mode:**
```bash
echo "Access token:    $(openssl rand -hex 24)"
echo "Session secret:  $(openssl rand -hex 32)"
```
- **Access token** — the password team members type at the login page. Save in your password manager.
- **Session secret** — signs cookies, never shared with users. Store alongside the access token.

**Cognito mode:**
```bash
echo "Session secret: $(openssl rand -hex 32)"
```
The Cognito user pool is created by the SAM template — no manual setup needed.

Confirm they've saved the secrets, then continue.

### Step 4 — Write the BOA config to SSM

The SAM template needs to know where your BOA stack config lives in SSM. Write it first:

```bash
aws ssm put-parameter \
  --name "/<STACK_NAME>/studio-config" \
  --value "$(cat <PATH_TO_BOA_CONFIG>)" \
  --type String \
  --overwrite \
  --region <REGION>
```

### Step 5 — Deploy infrastructure with SAM

Run from the `boa-studio` repo root (clone it first if not already present):

```bash
sam deploy \
  --template infra/template.yaml \
  --stack-name boa-studio-infra \
  --region <REGION> \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --parameter-overrides \
    "BoaStackName=<STACK_NAME>" \
    "AuthMode=<token or cognito>" \
    "SessionSecret=<from Step 3>" \
    "GitHubRepo=https://github.com/shafkevi/boa-studio" \
    "GitHubToken=<GitHub personal access token with repo scope>"
```

For token mode, also add `"AccessToken=<from Step 3>"` to the parameter overrides.

The template creates:
- IAM role for Amplify (`boa-studio-amplify-role-<STACK_NAME>`)
- Cognito user pool + app client (Cognito mode only)
- Amplify app + branch connected to the GitHub repo

**How env vars reach the Lambda runtime:** Amplify branch env vars are only available during the build phase by default — they don't reach the SSR Lambda at runtime. The `amplify.yml` in the repo handles this by running `env | grep -e STUDIO_ >> .env.production` before `npm run build`, which bakes the values into the Next.js server bundle. This is the documented AWS pattern. No manual action needed — it's already wired up.

When complete, note the stack outputs — you'll need them for Step 5.

**Cognito mode only — add the first admin user:**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <CognitoUserPoolId from outputs> \
  --username <EMAIL> \
  --user-attributes Name=email,Value=<EMAIL> Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region <REGION>
```

Cognito sends an invitation email with a temporary password.

### Step 6 — Trigger the first build

The SAM template disables auto-build on the Amplify branch so that the first build never runs before env vars are in place. Trigger it explicitly once the stack deploy is complete:

```bash
aws amplify start-job \
  --app-id <AmplifyAppId from outputs> \
  --branch-name <BRANCH> \
  --job-type RELEASE \
  --region <REGION>
```

Tell the developer: "Build started. Studio will be live at `<AmplifyDefaultDomain from outputs>` in ~3-5 minutes."

From this point on, every `git push` to the branch triggers a new deploy automatically.

### Step 7 — Verify the deployment

Once the Amplify deploy succeeds, ask the developer to open the Studio URL.

**Token mode:** Ask them to log in with the access token from Step 5A and confirm the overview page loads.

**Cognito mode:** Ask them to log in with the temp password from the invitation email, set a permanent password, and confirm the overview page loads.

If login fails:
- "Invalid password" with token mode → check `STUDIO_ACCESS_TOKEN` env var in Amplify matches exactly what was generated
- "Invalid password" with Cognito → confirm `USER_PASSWORD_AUTH` is enabled on the app client:
  ```bash
  aws cognito-idp describe-user-pool-client \
    --user-pool-id <POOL_ID> \
    --client-id <CLIENT_ID> \
    --region <REGION> \
    --query 'UserPoolClient.ExplicitAuthFlows'
  ```
- Blank page or 500 error → check Amplify build logs, likely a missing env var

Tell the developer: "BOA Studio is live. The overview page shows your stack — you can browse your database, run SQL, edit Cedar policies, and manage your backend from here."

---

## Adding Team Members (Cognito mode only)

After initial setup, additional users are managed through the Studio itself.

Navigate to **Admin** in the sidebar → **Add user** → enter their email.
Cognito sends them an invitation email automatically.

Or via CLI:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username <EMAIL> \
  --user-attributes Name=email,Value=<EMAIL> Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region <REGION>
```

---

## Rotating Secrets

**Important:** Because env vars are baked into the Next.js server bundle at build time (via `.env.production`), any secret change requires a redeploy to take effect. Update the Amplify branch env var, then trigger a new build.

**To revoke all active sessions** (token or Cognito mode):

```bash
NEW_SECRET=$(openssl rand -hex 32)
aws amplify update-branch \
  --app-id <APP_ID> \
  --branch-name <BRANCH> \
  --environment-variables "STUDIO_SESSION_SECRET=${NEW_SECRET},<...other vars...>" \
  --region <REGION>
aws amplify start-job --app-id <APP_ID> --branch-name <BRANCH> --job-type RELEASE --region <REGION>
```

All existing sessions expire once the new build is live.

**To change the access token** (token mode):

Update `STUDIO_ACCESS_TOKEN` on the branch and redeploy. Distribute the new token to your team.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "STUDIO_COGNITO_CLIENT_ID is not configured" or similar at runtime | Amplify branch env vars don't reach the Lambda runtime by default. Verify `amplify.yml` has `env \| grep -e STUDIO_ >> .env.production` before `npm run build`. If missing, add it and redeploy. |
| "No BOA config found" | Verify the SSM parameter exists: `aws ssm get-parameter --name /your-stack/studio-config`. Check `STUDIO_SSM_CONFIG_PATH` is set on the Amplify branch and the branch was redeployed after setting it. |
| Database queries fail | Verify the Amplify role has `dsql:DbConnectAdmin`. |
| Policy deploy fails | Verify the role has `lambda:GetFunction` and `lambda:UpdateFunctionCode`. |
| Login redirects loop | Check `NEXT_PUBLIC_STUDIO_MODE=cloud` is set on the Amplify app. Verify `STUDIO_SESSION_SECRET` is set on the branch and the app has been redeployed. |
| Cognito "USER_PASSWORD_AUTH not enabled" | Edit the app client in Cognito console → Auth flows → enable USER_PASSWORD_AUTH. |
| Amplify build fails | Check Node version in Amplify settings is >= 18. Check `amplify.yml` is present in repo root. |
| Env var change not taking effect | Branch env vars are baked into the bundle at build time. Always trigger a new build after changing a `STUDIO_*` env var. |
