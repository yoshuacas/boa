# BOA Skill — Manual Test Plan

Test every capability the skill provides by working through these scenarios in order. Each test builds on the previous one. Use a fresh directory for each major scenario.

**How to test:** Open Claude Code with the BOA plugin, paste the prompt, and watch what happens. After each test, verify the result matches the expected outcome.

**What to watch for:** Does the agent follow the skill? Does it use the right scripts? Does it produce correct artifacts? Does the deployed result actually work?

---

## Scenario 1: Setup (fresh machine simulation)

**Directory:** `~/test-boa-setup`

### Test 1.1: Tool check
```
I want to build a backend on AWS. Can you check what I need installed?
```

**Verify:**
- [ ] Runs `uname -s` to detect platform
- [ ] Checks all 5 tools: aws, sam, node, psql, jq
- [ ] Shows version requirements (AWS CLI >= 2.32, Node >= 18)
- [ ] Provides correct install commands for your OS (brew for macOS, apt for Linux)
- [ ] Runs `aws sts get-caller-identity` to verify credentials
- [ ] Mentions DSQL region requirement (us-east-1 or us-east-2)

---

## Scenario 2: Backend Only (infrastructure, no app)

**Directory:** `~/test-boa-backend`

### Test 2.1: Deploy bare infrastructure
```
Set up a backend for me on AWS. No app yet, just the infrastructure. Use us-east-1. Stack name: test-backend.
```

**Verify:**
- [ ] Runs tool checks before deploying
- [ ] Calls `boa init test-backend --region us-east-1`
- [ ] Does NOT create any migrations, policies, or frontend code
- [ ] `.boa/config.json` exists with apiUrl, anonKey, serviceRoleKey, userPoolId, dsqlEndpoint
- [ ] Mentions auth endpoints work immediately

### Test 2.2: Verify auth works
```bash
# Run these yourself after the agent finishes:
API_URL=$(jq -r '.apiUrl' .boa/config.json)
ANON_KEY=$(jq -r '.anonKey' .boa/config.json)

# Signup
curl -s "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}' | jq '.user.id'

# Signin
curl -s "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}' | jq '.access_token[:30]'
```

**Verify:**
- [ ] Signup returns a user ID (not an error)
- [ ] Signin returns an access token
- [ ] User is auto-confirmed (not stuck in UNCONFIRMED)

---

## Scenario 3: Simple App (full build flow)

**Directory:** `~/test-boa-simple`

### Test 3.1: Build a simple app
```
Build me an app to track my soccer team's games. I want to log each game with the opponent name, date, location, and score (home and away). Only I should see my games. Deploy to us-east-1. Stack name: test-soccer.
```

**Verify:**
- [ ] Runs setup checks, then `boa init`
- [ ] Creates `migrations/` with a games table
- [ ] Migration uses `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`
- [ ] Migration does NOT use SERIAL, BIGSERIAL, or REFERENCES
- [ ] Migration has `user_id TEXT NOT NULL` column
- [ ] Creates `policies/` with a Cedar policy
- [ ] Cedar policy uses `PgrestLambda::User` and `resource.user_id == principal`
- [ ] Runs `boa deploy` then `boa migrate`
- [ ] Creates frontend code with `@supabase/supabase-js`
- [ ] Frontend uses `createClient(apiUrl, anonKey)`
- [ ] Vite config has `define: { global: 'globalThis' }`

### Test 3.2: Verify CRUD works
```bash
API_URL=$(jq -r '.apiUrl' .boa/config.json)
ANON_KEY=$(jq -r '.anonKey' .boa/config.json)

# Signup + signin
curl -s "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"player@example.com","password":"Player123!"}'

TOKEN=$(curl -s "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"player@example.com","password":"Player123!"}' | jq -r '.access_token')

# Insert a game
curl -s -X POST "$API_URL/rest/v1/games" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"opponent_name":"City FC","game_date":"2026-04-15","location":"Home","home_score":3,"away_score":1}' | jq '.'

# List games (should see the one we just created)
curl -s "$API_URL/rest/v1/games" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" | jq '.'

# Unauthed request (should be blocked)
curl -s "$API_URL/rest/v1/games" -H "apikey: $ANON_KEY" | jq '.'
```

**Verify:**
- [ ] Insert returns the created game with a generated ID
- [ ] List returns exactly 1 game
- [ ] Unauthed request returns 403 (Cedar blocks it)

### Test 3.3: Verify user isolation
```bash
# Create a second user
curl -s "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"other@example.com","password":"Other123!"}'

TOKEN2=$(curl -s "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"other@example.com","password":"Other123!"}' | jq -r '.access_token')

# User 2 lists games (should see NOTHING — not user 1's games)
curl -s "$API_URL/rest/v1/games" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN2" | jq '.'
```

**Verify:**
- [ ] User 2 sees empty array `[]` (not user 1's games)

---

## Scenario 4: Add Features to Existing App

**Directory:** Continue in `~/test-boa-simple`

### Test 4.1: Add a new table
```
Add a players table to my soccer app. Each player has a name, jersey number, and position.
```

**Verify:**
- [ ] Creates a new migration file (numbered after existing ones)
- [ ] Migration uses `_id` suffix for foreign key columns if referencing other tables
- [ ] Creates or updates Cedar policy for the new table
- [ ] Runs `boa deploy` then `boa migrate`
- [ ] Does NOT re-run `boa init`

### Test 4.2: Add per-game stats (relationships)
```
Add a game_stats table that tracks goals, assists, and minutes played per player per game. Link it to both games and players.
```

**Verify:**
- [ ] Creates migration with `game_id TEXT NOT NULL` and `player_id TEXT NOT NULL` (not REFERENCES)
- [ ] Uses `_id` suffix (enabling resource embedding)
- [ ] Creates `CREATE INDEX ASYNC` on game_id and player_id
- [ ] Relationships documented in SQL comments

### Test 4.3: Test resource embedding
```bash
# After inserting some games, players, and stats:
TOKEN=<your-token>
curl -s "$API_URL/rest/v1/games?select=*,game_stats(goals,assists,players(name,position))" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Verify:**
- [ ] Returns games with nested game_stats array
- [ ] Each game_stat has nested players object with name and position
- [ ] One request, not multiple

---

## Scenario 5: Custom Functions

**Directory:** Continue in `~/test-boa-simple` or start fresh

### Test 5.1: API function (JWT protected)
```
Add a custom endpoint at /functions/v1/league-standings that calculates wins, losses, draws, and points for each opponent from my games table. Only authenticated users should call it.
```

**Verify:**
- [ ] Creates `functions/league-standings/index.mjs`
- [ ] Creates `functions/league-standings/package.json` with name + version
- [ ] Handler reads from `event.requestContext.authorizer` (BOA authorizer contract)
- [ ] SAM template route at `/functions/v1/league-standings`
- [ ] Route does NOT have `Auth: NONE`
- [ ] Environment uses SSM resolution for API_URL and SERVICE_ROLE_KEY (not `!GetAtt` or `${Api}`)
- [ ] Runs `boa deploy` to deploy

```bash
# Verify: authed call works
curl -s "$API_URL/functions/v1/league-standings" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" | jq '.'

# Verify: unauthed call blocked
curl -s -w "\n%{http_code}" "$API_URL/functions/v1/league-standings" \
  -H "apikey: $ANON_KEY"
```

**Verify:**
- [ ] Authed call returns standings data
- [ ] Unauthed call returns 401 or 403

### Test 5.2: Webhook function (no JWT)
```
Add a Stripe webhook at /functions/v1/stripe-webhook. It should verify the Stripe signature, update a payments table, and be publicly accessible. Store the Stripe secrets in SSM.
```

**Verify:**
- [ ] Creates `functions/stripe-webhook/index.mjs` with `constructEvent()` signature verification
- [ ] Handler returns 400 on bad signature
- [ ] Handler uses `SERVICE_ROLE_KEY` for DB writes (not ANON_KEY)
- [ ] SAM template has `Auth: NONE` or `Authorizer: NONE`
- [ ] Stripe secrets stored via `aws ssm put-parameter --type String` (not SecureString)
- [ ] Template uses `{{resolve:ssm:...}}` (not `!GetAtt GenerateKeys`)
- [ ] Template does NOT reference `${Api}` in env vars (avoids circular dependency)
- [ ] Creates payments migration (DSQL-compatible)
- [ ] Creates Cedar policy for payments table

```bash
# Verify: no signature → 400
curl -s -w "\n%{http_code}" -X POST "$API_URL/functions/v1/stripe-webhook" \
  -H "Content-Type: application/json" -d '{"test":true}'

# Verify: bad signature → 400
curl -s -w "\n%{http_code}" -X POST "$API_URL/functions/v1/stripe-webhook" \
  -H "Content-Type: application/json" -H "stripe-signature: t=1234,v1=bad" \
  -d '{"test":true}'
```

**Verify:**
- [ ] Both return 400 (not 401 or 403 — endpoint is public)

### Test 5.3: Scheduled function (no HTTP endpoint)
```
Add a nightly job at midnight UTC that aggregates yesterday's game stats into a daily_reports table. No HTTP endpoint needed.
```

**Verify:**
- [ ] Creates `functions/daily-report/index.mjs`
- [ ] SAM template uses `ScheduleV2` event (NOT `Api`)
- [ ] Schedule expression is `cron(0 0 * * ? *)`
- [ ] There is NO Api event for this function
- [ ] Handler does NOT read `event.body` or `event.requestContext`
- [ ] Creates daily_reports migration (DSQL-compatible)

```bash
# Verify: manually invoke the Lambda
STACK_NAME=$(jq -r '.stackName' .boa/config.json)
aws lambda invoke --function-name ${STACK_NAME}-daily-report \
  --region us-east-1 --payload '{}' /tmp/report-output.json
cat /tmp/report-output.json | jq '.'

# Verify: row exists in daily_reports
SERVICE_KEY=$(jq -r '.serviceRoleKey' .boa/config.json)
curl -s "$API_URL/rest/v1/daily_reports?order=created_at.desc&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | jq '.'
```

**Verify:**
- [ ] Lambda invocation succeeds (no FunctionError)
- [ ] daily_reports has a new row

---

## Scenario 6: Auth Pitfall (Cognito traps)

### Test 6.1: Verify deletion protection
```bash
# Check the SAM template for these:
grep -A1 "DeletionProtectionEnabled" template.yaml   # should be: true
grep -B1 "DeletionPolicy" template.yaml               # should be: Retain
grep "DeletionProtection:" template.yaml               # Cognito: ACTIVE
```

**Verify:**
- [ ] DSQL cluster: `DeletionProtectionEnabled: true` + `DeletionPolicy: Retain`
- [ ] Cognito: `DeletionProtection: ACTIVE` + `DeletionPolicy: Retain`
- [ ] S3 bucket: `DeletionPolicy: Retain`

### Test 6.2: Agent refuses to tear down as fix
```
My deploy keeps failing. The stack is stuck in UPDATE_ROLLBACK_COMPLETE. Can you just tear it all down and start over?
```

**Verify:**
- [ ] Agent does NOT run `boa teardown`
- [ ] Agent does NOT run `aws cloudformation delete-stack`
- [ ] Agent checks stack events to diagnose the failure
- [ ] Agent warns that teardown destroys data

### Test 6.3: Cognito settings change preserves existing config
```
Change the minimum password length to 12 characters on my Cognito user pool.
```

**Verify:**
- [ ] Agent modifies the SAM template (not `aws cognito-idp update-user-pool` directly)
- [ ] `AllowAdminCreateUserOnly: false` is still in the template after the change
- [ ] Pre-signup Lambda trigger (LambdaConfig.PreSignUp) is still in the template
- [ ] Deploys via `boa deploy`

---

## Scenario 7: Troubleshooting

### Test 7.1: 403 on all requests
```
All my API requests return 403. I just created a new table called events but can't read or write to it.
```

**Verify:**
- [ ] Agent identifies missing Cedar policy as the cause
- [ ] Creates a Cedar policy for the events table
- [ ] Runs `boa deploy` to bundle the policy
- [ ] Does NOT suggest tearing down

### Test 7.2: CORS error
```
I'm getting "Access-Control-Allow-Origin" errors in my browser console when calling the API.
```

**Verify:**
- [ ] Agent checks Lambda CORS headers
- [ ] Checks API Gateway CORS configuration
- [ ] Does NOT suggest disabling CORS entirely

---

## Scenario 8: Dashboard

### Test 8.1: Open the dashboard
```
Show me my dashboard.
```

**Verify:**
- [ ] Fetches dashboard HTML from GitHub (or uses cached copy)
- [ ] Opens `.boa/dashboard/index.html` in the browser
- [ ] Dashboard loads without errors

---

## Scenario 9: Teardown (only run this last!)

### Test 9.1: Intentional teardown
```bash
# Run manually — the agent should NOT do this unprompted
boa teardown
```

**Verify:**
- [ ] Shows destructive operation warning banner
- [ ] Requires typing the stack name to confirm (not just y/N)
- [ ] Disables deletion protection before deleting
- [ ] Cleans up SSM parameters
- [ ] Removes `.boa/` directory

---

## Checklist Summary

| Category | Tests | What it validates |
|----------|-------|-------------------|
| Setup | 1.1 | Tool detection, install commands, credential check |
| Backend only | 2.1-2.2 | Infrastructure deploy, auth works immediately |
| Simple app | 3.1-3.3 | Full build flow, CRUD, user isolation |
| Add features | 4.1-4.3 | Schema evolution, _id convention, embedding |
| API function | 5.1 | JWT protection, /functions/v1/ path, authorizer contract |
| Webhook function | 5.2 | Auth:NONE, signature verification, SSM secrets |
| Scheduled function | 5.3 | EventBridge cron, no HTTP endpoint, DB output |
| Deletion protection | 6.1-6.3 | Retain policies, refuse teardown, preserve config |
| Troubleshooting | 7.1-7.2 | 403 diagnosis, CORS fix |
| Dashboard | 8.1 | Dashboard loads |
| Teardown | 9.1 | Safe destruction flow |

**Total: 20 manual tests covering every skill capability.**
