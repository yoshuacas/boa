# BOA End-to-End Testing Plan

## Problem

Artifact-only evals verify that the agent generates correct files (SAM templates, migrations, Cedar policies, function handlers). But correct files don't guarantee a working backend. We need tests that deploy real infrastructure and verify the entire system — not just API responses, but state changes across DSQL, S3, AppSync Events, and Cognito.

## Approach

Test with `@supabase/supabase-js` — the exact same client a developer uses. If the tests pass, a real app works. Not "the API returns 200" — the actual client-server contract is satisfied.

## Test Harness Structure

```
evals/
├── harness/
│   ├── e2e-test.mjs           # Main runner: deploy → seed → test → teardown
│   ├── tests/
│   │   ├── auth.test.mjs      # Signup, signin, token refresh
│   │   ├── crud.test.mjs      # Insert, select, update, delete + ownership
│   │   ├── functions.test.mjs # API function, webhook, scheduled
│   │   ├── storage.test.mjs   # Upload, download, list, delete + metadata sync
│   │   └── realtime.test.mjs  # Subscribe → write → receive event
│   ├── seed.mjs               # Insert test data (teams, players, games, stats)
│   └── helpers/
│       ├── config.mjs         # Read .boa/config.json
│       ├── wait.mjs           # Polling helpers (waitFor, sleep)
│       └── stripe.mjs         # Generate valid Stripe webhook signatures
└── package.json               # @supabase/supabase-js, @aws-sdk/client-lambda
```

## Runner Flow

```bash
# 1. Deploy fresh stack
bash $BOA_PLUGIN/scripts/bootstrap.sh --stack-name boa-e2e-test --region us-east-1

# 2. Deploy app (functions, policies, etc.)
bash $BOA_PLUGIN/scripts/deploy.sh

# 3. Run migrations (create tables)
bash $BOA_PLUGIN/scripts/migrate.sh

# 4. Seed test data
node evals/harness/seed.mjs

# 5. Run all tests
node --test evals/harness/tests/*.test.mjs

# 6. Teardown
bash $BOA_PLUGIN/scripts/teardown.sh
```

## Test Suite Detail

### 1. Auth Tests (auth.test.mjs)

| Test | What it verifies | How |
|------|-----------------|-----|
| Signup | Cognito user pool + pre-signup auto-confirm | `supabase.auth.signUp()` → user object with ID |
| Signin | Token generation | `supabase.auth.signInWithPassword()` → access_token |
| Token refresh | Refresh flow | `supabase.auth.refreshSession()` → new token |
| User info | Token-to-user resolution | `supabase.auth.getUser()` → matching email |
| Signout | Session invalidation | `supabase.auth.signOut()` → subsequent calls fail |

### 2. CRUD + Cedar Tests (crud.test.mjs)

| Test | What it verifies | How |
|------|-----------------|-----|
| Insert | REST API + DSQL write | `.from('games').insert(...)` → row with generated ID |
| Select own | Ownership policy | `.from('games').select('*')` → only my rows |
| Select other | Cedar blocks | Sign in as user B → `.from('games').select('*')` → empty |
| Service role | Bypass policy | Admin client → `.from('games').select('*')` → all rows |
| Update own | Owner can modify | `.update({...}).eq('id', X)` → updated row |
| Update other | Cedar blocks | User B → `.update({...}).eq('id', X)` → error/empty |
| Delete own | Owner can delete | `.delete().eq('id', X)` → row gone |
| Filters | PostgREST compat | `.select('*').eq('opponent', 'City FC')` → filtered |
| Ordering | PostgREST compat | `.select('*').order('game_date', {ascending: false})` |

### 3. Functions Tests (functions.test.mjs) ← IMPLEMENT FIRST

| Test | What it verifies | How |
|------|-----------------|-----|
| API function (authed) | JWT required + correct result | `supabase.functions.invoke('league-standings')` → standings array with correct point calculations |
| API function (unauthed) | Authorizer blocks | Fetch without token → 401 |
| API function (result correctness) | SQL logic | Verify wins + draws + losses = played, points = 3*wins + draws |
| Webhook (valid sig) | Auth:NONE + DB side effect | POST with valid Stripe sig → 200, verify new row in payments table |
| Webhook (bad sig) | Signature rejection + no side effect | POST with bad sig → 400, verify payments table unchanged |
| Webhook (no sig) | Missing header | POST with no stripe-signature header → 400 |
| Scheduled (manual invoke) | Lambda runs + DB output | `lambda.invoke()` → verify new row in daily_reports |
| Scheduled (result correctness) | Aggregation logic | Verify total_goals matches sum of goals in game_stats |

### 4. Storage Tests (storage.test.mjs)

| Test | What it verifies | How |
|------|-----------------|-----|
| Upload | Presigned URL → S3 | `.storage.from('avatars').upload('test.jpg', file)` → path returned |
| Metadata sync | S3 event → DSQL | Wait 2s → `.storage.from('avatars').list()` → file appears |
| Download | Presigned GET URL | `.storage.from('avatars').download('test.jpg')` → file content matches |
| Signed URL | Time-limited URL | `.createSignedUrl('test.jpg', 60)` → URL works, returns file |
| Delete | S3 + metadata removed | `.remove(['test.jpg'])` → list no longer shows file |
| Owner isolation | Cedar on storage | User B → `.storage.from('avatars').download('test.jpg')` → error |
| Public bucket | No auth needed | Upload to public bucket → `.getPublicUrl()` → accessible |

### 5. Realtime Tests (realtime.test.mjs)

| Test | What it verifies | How |
|------|-----------------|-----|
| Subscribe + INSERT | Event published on write | Subscribe to table → insert row → event received within 5s |
| Subscribe + UPDATE | Event on update | Subscribe → update row → event with old + new |
| Subscribe + DELETE | Event on delete | Subscribe → delete row → event with old row |
| Wildcard subscribe | `*` event filter | Subscribe to all events on table → insert, update, delete all received |
| Broadcast | Client-to-client | Client A sends broadcast → Client B receives |
| Cross-user isolation | Cedar on events | User B subscribes → User A inserts → verify event respects policy |

## Seed Data

The seed script creates a known dataset that the tests can assert against:

```javascript
// seed.mjs
// 2 test users (user A, user B)
// 4 teams (Eagles, Hawks, Falcons, Owls)
// 8 games (each team plays each other once)
// 32 game_stats rows (4 players per game)
// 1 team_member per user with role 'admin'
```

This gives the API function test predictable standings to verify against.

## Test Helpers

### config.mjs
Reads `.boa/config.json` and exports `apiUrl`, `anonKey`, `serviceRoleKey`, `stackName`, `region`.

### wait.mjs
```javascript
// Poll until condition is true or timeout
async function waitFor(fn, timeoutMs = 5000, intervalMs = 200)

// Simple delay
async function sleep(ms)
```

### stripe.mjs
```javascript
// Generate a valid Stripe webhook signature for testing
function signStripePayload(payload, secret)
```

## Implementation Priority

1. **Functions tests** ← now (validates the patterns we just built)
2. **Auth + CRUD tests** ← next (validates the core backend)
3. **Storage tests** ← after storage-lambda is built
4. **Realtime tests** ← after events-lambda is built

## Running

```bash
# Full suite (deploy + test + teardown)
node evals/harness/e2e-test.mjs --full

# Tests only (assumes already deployed)
node --test evals/harness/tests/functions.test.mjs

# Single test file
node --test evals/harness/tests/auth.test.mjs
```

## CI Integration (future)

GitHub Actions workflow that runs on PR:
1. Deploy to a temporary stack (`boa-e2e-pr-{number}`)
2. Run test suite
3. Teardown regardless of pass/fail
4. Report results as PR comment

Cost: ~$0.10 per run (free tier covers most services, Lambda/DSQL/API GW charges are minimal for test workloads).
