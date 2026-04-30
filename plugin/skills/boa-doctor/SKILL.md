---
name: boa-doctor
description: Diagnose and fix BOA backend issues — deploy failures, 403 errors, CORS problems, auth not working, database connection timeouts, migration failures. Use this skill whenever a developer reports an error, sees unexpected behavior, or something broke after a deploy. Triggers on error messages, HTTP status codes, stack traces, and phrases like "not working", "broken", "failing", "can't sign in", "getting 403".
license: Apache-2.0
allowed-tools: "Bash(aws *) Bash(psql *) Bash(curl *) Bash(jq *) Bash(cat *) Bash(grep *) Read Grep Glob"
---

# BOA Doctor — Diagnose & Fix

When something isn't working, follow these diagnostic flows. Each starts with the symptom the developer reports and walks through the most likely causes in order of frequency.

## Before You Start

Read `.boa/config.json` to get the stack details:

```bash
cat .boa/config.json
```

This gives you the stack name, region, API URL, user pool ID, client ID, bucket name, and DSQL endpoint. You need these for every diagnostic.

## Flow 1: API Returns 403

**Symptom:** "All my API requests return 403" or "I can't access my data"

This is the most common issue. Walk through these causes in order:

**1. No Cedar policy exists for the table.**
Every table needs a Cedar policy or all requests return 403. Check:

```bash
ls policies/
```

If the table has no corresponding policy file, that's the problem. Write a Cedar policy — see [POLICIES.md](../../docs/POLICIES.md) for patterns.

**2. Policies not deployed after last change.**
Cedar policies are bundled into the Lambda at deploy time. If you wrote policies but didn't redeploy:

```bash
boa deploy
```

**3. User is not authenticated.**
Check the request includes both `apikey` header AND `Authorization: Bearer <token>` header. Anon key alone only grants access if the Cedar policy permits anonymous access.

**4. Ownership mismatch.**
If the Cedar policy uses `resource.user_id == principal`, the row's `user_id` must match the authenticated user's ID. Check:

```bash
# Get a token and inspect it
curl -s "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"<user-email>","password":"<password>"}' | jq '.user.id'
```

Compare this user ID with the `user_id` column values in the table.

**5. Authorizer context keys.**
pgrest-lambda attaches flat keys to every event. Custom code should read `event.requestContext.authorizer.role`, `event.requestContext.authorizer.userId`, and `event.requestContext.authorizer.email`. Reading anything else returns `undefined`.

## Flow 2: API Returns 500

**Symptom:** "My API returns 500" or "Internal Server Error"

**1. Check Lambda logs.**

```bash
STACK_NAME=$(jq -r '.stackName' .boa/config.json)
REGION=$(jq -r '.region' .boa/config.json)
aws logs tail /aws/lambda/${STACK_NAME}-ApiHandler --since 5m --region $REGION
```

The error message in the logs tells you what failed.

**2. Database connection error.** Look for "connection refused" or "timeout" in logs.
- Verify the DSQL endpoint is correct in the Lambda environment
- Check that the IAM auth token generation is working (not hardcoded credentials)
- Connection exhaustion: if you see "too many connections", the Lambda handler is creating new connections per invocation instead of reusing them at module scope

**3. Missing environment variable.** Look for "undefined" errors. Common culprit: `AWS_REGION` set as a Lambda env var — this is reserved by Lambda. Use `REGION_NAME` instead. Check:

```bash
aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs' --output table
```

**4. Package not installed.** Look for "Cannot find module" errors. The Lambda function directory needs a `package.json` with all dependencies installed. `boa deploy` runs this install automatically; if you edited files under `cli/templates/lambda/` manually, run `npm ci` there before redeploying.

## Flow 3: Deploy Failed

**Symptom:** `boa deploy` exits with a CloudFormation error, or the stack is in `ROLLBACK_COMPLETE`.

**1. Check the stack status and events.**

```bash
STACK_NAME=$(jq -r '.stackName' .boa/config.json)
REGION=$(jq -r '.region' .boa/config.json)
aws cloudformation describe-stack-events --stack-name $STACK_NAME --region $REGION \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

**2. Common deploy failures:**
- "Resource already exists" → a previous stack with the same name wasn't fully cleaned up. Run teardown first, then redeploy.
- "Role already exists" → IAM role naming collision. Change the stack name.
- "Template format error" → malformed YAML in the CloudFormation template. Validate with `aws cloudformation validate-template --template-body file://cli/templates/backend.yaml`.
- Lambda package too large (>50MB zipped) → check for accidental `node_modules` bloat.

**3. Stack stuck in ROLLBACK_COMPLETE.** You must delete it before redeploying:

```bash
aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION
aws cloudformation wait stack-delete-complete --stack-name $STACK_NAME --region $REGION
```

## Flow 4: Auth Not Working

**Symptom:** "Users can't sign up" or "sign in fails" or "token is invalid"

**1. `better_auth` schema missing.** Sign-up returns HTTP 500 with "relation \"user\" does not exist" in the Lambda logs. Run `boa deploy` to re-apply the idempotent schema bootstrap.

**2. Wrong grant type.** Sign-in must use `grant_type=password`. Refresh must use `grant_type=refresh_token`.

**3. Token expired.** Access tokens expire after 1 hour. The client must use the refresh token to get new access tokens. Check that `@supabase/supabase-js` auto-refresh is working.

**4. Client calling the wrong URL.** `.boa/config.json.apiUrl` is the correct base URL. Common mistake: omitting the `/prod` stage segment or a trailing-slash mismatch.

**5. BETTER_AUTH_SECRET not resolvable.** If the Lambda logs show SSM resolution errors, verify the parameter exists:

```bash
aws ssm get-parameter --name /${STACK_NAME}/better-auth-secret --region $REGION
```

## Flow 5: CORS Errors

**Symptom:** "Access-Control-Allow-Origin" error in browser console

**1. Lambda not returning CORS headers.** Every Lambda response must include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: apikey, authorization, content-type
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
```

**2. OPTIONS preflight not configured.** pgrest-lambda emits CORS headers based on the `ALLOWED_ORIGINS` env var. Check the `ALLOWED_ORIGINS` value on the Lambda (`aws lambda get-function-configuration`) and make sure the caller's Origin header is in the list.

**3. Mismatch between API URL and frontend origin.** If you're using a custom domain, make sure the `Access-Control-Allow-Origin` header matches the frontend's domain exactly, or use `*` during development.

## Flow 6: Migration Failed

**Symptom:** "boa migrate failed" or "SQL error"

**1. DSQL constraint violation.** The most common SQL errors in DSQL:
- `REFERENCES` → DSQL doesn't support foreign keys. Remove them; document relationships in comments.
- `SERIAL` / `BIGSERIAL` → Use `TEXT DEFAULT gen_random_uuid()::text` instead.
- `CREATE INDEX` without `ASYNC` → DSQL requires `CREATE INDEX ASYNC`.
- `CREATE TRIGGER` / `CREATE FUNCTION` → DSQL doesn't support these.

**2. Table already exists.** Use `CREATE TABLE IF NOT EXISTS` in all migrations.

**3. Connection auth failed.** IAM token may have expired (valid 15 minutes). The `boa migrate` command generates a fresh token each run, but if running psql manually, generate a new token.

For complete DSQL constraints, see [DSQL-PATTERNS.md](../../docs/DSQL-PATTERNS.md).

## Flow 7: Frontend Issues

**Symptom:** "Blank page" or "assets not loading" or "fetch fails silently"

**1. Amplify SPA redirect catching static assets.** If CSS/JS/images return HTML, the redirect rule `/<*>` is too broad. Replace with a regex that excludes static assets (see [PITFALLS.md](../../docs/PITFALLS.md)).

**2. Wrong API URL in frontend config.** Verify the API URL in your frontend matches `.boa/config.json`. Common mistake: trailing slash mismatch or missing `/prod` stage.

**3. CORS allowlist missing.** If the request reaches the Lambda but the browser blocks the response, check the `ALLOWED_ORIGINS` env var on the function and make sure the caller's `Origin` header is in the list.

## Quick Reference: Error → Most Likely Cause

| Error | First Thing to Check |
|-------|---------------------|
| 403 on all requests | Missing Cedar policy for the table |
| 500 Internal Server Error | Lambda logs (`aws logs tail`) |
| `relation "user" does not exist` | Run `boa deploy` to apply the `better_auth` schema |
| CORS error in browser | Origin missing from `ALLOWED_ORIGINS` |
| "Cannot find module" | Lambda package missing dependencies — run `boa deploy` |
| "too many connections" | Connection pool not at module scope |
| ROLLBACK_COMPLETE | Delete stack, then redeploy |
| Migration SQL error | DSQL constraint (no FK, no SERIAL, ASYNC indexes) |
| Blank page on Amplify | SPA redirect rule too broad |
