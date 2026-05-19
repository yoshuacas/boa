# BOA Functions

## Overview

Add first-class support for custom server-side code in BOA.
Developers drop a file at `functions/<name>/index.mjs`, run
`boa deploy`, and the function is live at
`/functions/v1/<name>`. All functions share a single Lambda
(`FunctionsLambda`), one log group, and one IAM role. The
function receives a normalized `ctx` object with the
caller's role, userId, JWT, and helpers for talking to the
database and other BOA services.

Functions fill the gap between "the REST API handles CRUD"
and "I need custom server-side logic" (webhooks,
third-party integrations, scheduled reports, AI calls).
Today the only path is hand-editing CloudFormation, which
is exactly the complexity BOA exists to remove.

## Current CX / Concepts

### Default Stack

The default BOA stack has one Lambda (`ApiFunction`) that
runs `pgrest-lambda` for `/rest/v1/*` and `/auth/v1/*`
routes. There is no scaffold for custom server-side code.

### Custom Functions Today

`plugin/docs/FUNCTIONS.md` documents the manual path: add a
new `AWS::Lambda::Function` resource to the CloudFormation
template, wire its IAM role, event source, and environment,
then `boa deploy`. This requires CloudFormation expertise
and violates the "one opinionated path" principle.

### Event Format

The existing Lambda handler (`cli/templates/lambda/
index.mjs`) normalizes API Gateway, ALB, and Function URL
events to a v1.0 shape with
`event.requestContext.authorizer.{role, userId, email}`.
The Functions runtime reuses this same normalization and
JWT extraction logic.

### Config Format

`.boa/config.json` stores stack metadata, API URL, keys,
and extensions. Functions adds a `functions` array to track
deployed function names and visibility.

## Proposed CX / CX Specification

### File Shape

```
project/
├── functions/
│   ├── hello/
│   │   ├── index.mjs          # default export = handler
│   │   └── boa.json           # optional config
│   ├── stripe-webhook/
│   │   ├── index.mjs
│   │   └── boa.json
│   └── send-report/
│       └── index.mjs          # boa.json optional
├── .boa/config.json
└── migrations/, policies/     # unchanged
```

**`functions/<name>/index.mjs`**

```javascript
export default async function handler(req, ctx) {
  // req.method, req.path, req.query, req.headers, req.body
  // ctx.role     'anon' | 'authenticated' | 'service_role'
  // ctx.userId   user UUID or '' for anon
  // ctx.email    user email or ''
  // ctx.jwt      raw caller JWT or ''
  // ctx.db       authorized Postgres pool (caller's role)
  // ctx.boa      service-role client for trusted ops
  // ctx.logger   structured logger (CloudWatch)
  // ctx.env      function-specific env vars

  if (ctx.role === 'anon') {
    return { status: 401, body: { error: 'sign in required' } };
  }

  const { rows } = await ctx.db.query(
    'SELECT id, title FROM todos WHERE owner = $1',
    [ctx.userId]
  );
  return { status: 200, body: rows };
}
```

**`functions/<name>/boa.json`** (all fields optional)

```json
{
  "visibility": "public",
  "timeout": 30,
  "memory": 256,
  "env": { "STRIPE_API_BASE": "https://api.stripe.com" },
  "secrets": ["STRIPE_SECRET_KEY"]
}
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `visibility` | `"public"` or `"private"` | `"public"` | `public` = exposed at `/functions/v1/<name>`. `private` = only invocable by another function or `service_role` via direct Lambda invoke. |
| `timeout` | seconds, 1-30 | 30 | Per-function override. Shared Lambda runs at the max of all deployed functions. |
| `memory` | MB, 128-1024 | 256 | Same max-of-all rule. |
| `env` | object | `{}` | Plain env vars (non-secret). Merged into `ctx.env`. |
| `secrets` | string[] | `[]` | Names that must exist in SSM at `/<stack-name>/functions/<name>/<SECRET>`. Surfaced via `ctx.env`. |

### Function Naming Rules

Function names must match `[a-z][a-z0-9-]{0,62}`. Reserved
names are rejected: `v1`, `health`, `_internal`.

**Validation errors:**

```
Error: Invalid function name 'My_Func'.
  Function names must match [a-z][a-z0-9-]{0,62}.
```

```
Error: Reserved function name 'v1'. Choose a different name.
```

### Routing and Visibility

```
Public:
  client -> API Gateway -> /functions/v1/<name>
         -> FunctionsLambda -> handler

Private:
  another function -> ctx.boa.functions.invoke('<name>', payload)
                   -> FunctionsLambda direct invoke (_boaInternal)
                   -> handler
```

| Visibility | API Gateway route | Who can call |
|------------|-------------------|--------------|
| `public` | `ANY /functions/v1/{name+}` | Anon key, service key, or user JWT |
| `private` | None | Service key only via `ctx.boa.functions.invoke()` or direct Lambda invoke |

A `private` function called through API Gateway returns 404
regardless of the caller's key. The route does not exist.

### Token Model

| Caller header | `ctx.role` | `ctx.userId` | `ctx.db` bound to | `ctx.boa` |
|---------------|------------|--------------|-------------------|-----------|
| No auth | `'anon'` | `''` | DSQL role `anon` | service-role client |
| `Authorization: Bearer <user JWT>` | `'authenticated'` | user UUID | DSQL role `authenticated` with claims set | service-role client |
| `apikey: <anon key>` | `'anon'` | `''` | DSQL role `anon` | service-role client |
| `apikey: <service role key>` | `'service_role'` | `''` | DSQL role `service_role` | service-role client |

**Rules:**

1. **Default to least privilege.** `ctx.db` is bound to the
   caller's role. Cedar policies and DSQL row-level grants
   apply uniformly.
2. **Service-role escape hatch is explicit.** `ctx.boa.db()`
   returns a service-role pool. Not the default.
3. **Caller's JWT propagates.** `ctx.boa.functions.invoke()`
   forwards the caller's JWT unless elevated with
   `ctx.boa.asService()`.

**Edge cases:**

- Both `Authorization` and `apikey` present: JWT wins for
  `userId`; service key still elevates role.
- Malformed JWT: falls back to anon, no throw.
- JWT with `role: service_role` but wrong signing key:
  rejected (same as pgrest-lambda path).

### Context Helpers

```javascript
// Default: caller's role
const { rows } = await ctx.db.query('SELECT * FROM todos');

// Explicit elevation: service role
const adminPool = await ctx.boa.db();
await adminPool.query('UPDATE billing SET ...');

// Call another function as the same user
const out = await ctx.boa.functions.invoke('send-report', { id: 1 });

// Call another function with full powers
const out = await ctx.boa.asService().functions.invoke('cleanup', {});

// Hit the REST API as the same user
const todos = await ctx.boa.rest.from('todos').select('*');
```

`ctx.db` is lazy-built on first access (cold-start
friendly). `ctx.boa.db()` reuses the same DSQL signer/pool
pattern from `pgrest-lambda`.

### CLI Commands

| Command | Behavior |
|---------|----------|
| `boa init` | Creates `functions/` directory and a `functions/hello/` example. Deploys the stack including `FunctionsLambda`. |
| `boa deploy` | Discovers `functions/*/index.mjs`, validates, packages with runtime, uploads, updates Lambda. Computes shared timeout/memory as max across functions. |
| `boa functions list` | Lists discovered functions, visibility, deployed version. |
| `boa functions invoke <name> [--service] [--data <json>]` | Invokes the deployed Lambda. Anon by default, `--service` uses service key. |
| `boa functions logs <name> [--tail]` | Tails the Functions log group filtered to the named function. |
| `boa functions remove <name>` | Deletes the directory, redeploys without it. |
| `boa verify` | Additionally checks: registry parity, route reachability, SSM secret presence. |

**`boa functions list` output:**

```
Functions:

  hello           public    deployed
  stripe-webhook  private   deployed
  new-func        public    local only

Run 'boa deploy' to sync local changes.
```

**`boa functions invoke` errors:**

```
Error: Unknown function 'nonexistent'.
  Available: hello, stripe-webhook
```

```
Error: Invalid JSON in --data: Unexpected token...
```

**`boa functions remove` behavior:**

```
Removing function 'hello'...
  Deleted functions/hello/
  Run 'boa deploy' to update the deployed stack.
```

### Secrets via SSM

Secrets listed in `boa.json` must exist in SSM at
`/<stack-name>/functions/<name>/<SECRET>` before deploy.
`boa deploy` validates this and fails with a clear error:

```
Error: Missing SSM parameter for function 'stripe-webhook':
  /<stack>/functions/stripe-webhook/STRIPE_SECRET_KEY

  Store it with:
  aws ssm put-parameter \
    --name "/<stack>/functions/stripe-webhook/STRIPE_SECRET_KEY" \
    --value "sk_live_..." \
    --type String
```

Secrets are stored as `--type String` because CloudFormation
does not resolve `SecureString` for Lambda env vars.

### Error Response Shape

Functions return a PostgREST-shaped error body for
consistency with the rest of the BOA API:

```json
{
  "message": "Function 'nonexistent' not found",
  "code": "PGRST116",
  "hint": null,
  "details": null
}
```

Status codes:
- 404: unknown function name, or private function via API GW
- 500: unhandled throw in user code (stack trace goes to
  CloudWatch only, never leaked to response)
- User-defined: whatever the handler returns in `status`

### `boa init` Scaffold

`boa init` creates `functions/hello/index.mjs`:

```javascript
export default async function handler(req, ctx) {
  return {
    status: 200,
    body: {
      message: 'Hello from BOA Functions!',
      userId: ctx.userId,
      role: ctx.role,
    },
  };
}
```

And `functions/hello/boa.json`:

```json
{
  "visibility": "public"
}
```

## Technical Design

### Runtime Architecture (`cli/lib/functions/runtime/`)

The FunctionsLambda entry handler is
`cli/lib/functions/runtime/handler.mjs`. It:

1. Reads the bundled registry JSON (`_registry.json`) at
   module load.
2. On each invocation, determines the function name from the
   event:
   - API Gateway: extract from `event.path` after
     `/functions/v1/`.
   - Direct invoke: read `event._boaInternal.name`.
3. Checks visibility: if the function is `private` and the
   invocation came from API Gateway (no `_boaInternal`
   flag), return 404.
4. Normalizes the request into `req` (method, path, query,
   headers, body).
5. Builds the `ctx` object via `ctx.mjs` (role, userId,
   email, jwt, db, boa, logger, env).
6. Calls the user's handler: `await fn(req, ctx)`.
7. Formats the response into an API Gateway-compatible
   shape (statusCode, headers, body JSON-serialized).

**Error isolation:** If the user handler throws, the
runtime catches it, logs the full error + stack to
CloudWatch with the function name, and returns a 500 with
the generic PostgREST-shaped error body. The JWT and SSM
secret values are never included in error responses.

### Context Builder (`ctx.mjs`)

Extracts role/userId/email from the event using the same
JWT parsing logic as `cli/templates/lambda/index.mjs`
(normalizeEvent). The token table is enforced here:

```javascript
export function buildCtx(event, registry, functionName) {
  const { role, userId, email, jwt } = extractAuth(event);
  return {
    role,
    userId,
    email,
    jwt,
    get db() { return getCallerPool(role, jwt); },
    boa: buildBoaClient(jwt, role),
    logger: buildLogger(functionName),
    env: buildEnv(registry[functionName]),
  };
}
```

`ctx.db` is a getter (lazy). On first access it creates a
DSQL connection pool bound to the caller's role using the
same `DsqlSigner` pattern from pgrest-lambda.

### BOA Client (`boa-client.mjs`)

```javascript
export function buildBoaClient(jwt, role) {
  return {
    async db() { return getServiceRolePool(); },
    rest: buildRestProxy(jwt),
    functions: {
      async invoke(name, payload) {
        return directInvoke(name, payload, jwt);
      },
    },
    asService() {
      return buildBoaClient('', 'service_role');
    },
  };
}
```

`directInvoke` calls `aws-sdk Lambda.invoke()` with a
payload that includes `_boaInternal: true` and the target
function name. This bypasses API Gateway entirely for
private functions.

`buildRestProxy` constructs a minimal HTTP client pointing
at the stack's API URL with the caller's JWT in the
`Authorization` header.

### Structured Logger (`logger.mjs`)

```javascript
export function buildLogger(functionName) {
  return {
    info(msg, data) {
      console.log(JSON.stringify({
        level: 'info', function: functionName,
        msg, ...data, ts: Date.now(),
      }));
    },
    error(msg, data) { /* same shape, level: 'error' */ },
    warn(msg, data) { /* same shape, level: 'warn' */ },
  };
}
```

One log group, per-function log streams via the `function`
field. `boa functions logs <name>` filters on this field.

### Discovery (`discover.mjs`)

Walks `functions/` looking for directories containing
`index.mjs`. For each:

1. Validates the directory name against naming rules.
2. Checks `index.mjs` exists and has a default export.
3. Parses `boa.json` if present, applies defaults.
4. Validates `secrets` exist in SSM (during deploy, not
   during discovery-only calls like `list`).

Returns an array of function descriptors:

```javascript
[{
  name: 'hello',
  visibility: 'public',
  timeout: 30,
  memory: 256,
  env: {},
  secrets: [],
  path: '/abs/path/to/functions/hello',
}]
```

### Packaging (`package.mjs`)

1. Creates a temp directory.
2. Copies the runtime (`handler.mjs`, `ctx.mjs`,
   `boa-client.mjs`, `logger.mjs`) into it.
3. For each discovered function, copies its `index.mjs`
   (and any sibling files except `node_modules/`) into
   `functions/<name>/`.
4. Writes `_registry.json` with the routing manifest.
5. Zips the entire directory.

The zip structure:

```
handler.mjs          # Lambda entry point
ctx.mjs
boa-client.mjs
logger.mjs
_registry.json
functions/
  hello/
    index.mjs
  stripe-webhook/
    index.mjs
```

### Registry (`registry.mjs`)

Builds the routing manifest from discovered functions:

```json
{
  "hello": {
    "visibility": "public",
    "timeout": 30,
    "memory": 256
  },
  "stripe-webhook": {
    "visibility": "private",
    "timeout": 30,
    "memory": 256
  }
}
```

The registry is bundled in the Lambda zip as
`_registry.json`. Adding/removing a function only requires
a Lambda code update, not a CloudFormation stack update
(unless the max timeout or memory changes).

### CloudFormation Deltas (`backend.yaml`)

Added to `cli/templates/backend.yaml`:

**`FunctionsLambdaRole`** - IAM execution role:
- DSQL connect (same cluster as ApiFunction)
- SSM read for `/<stack>/functions/*`
- CloudWatch Logs (`AWSLambdaBasicExecutionRole`)
- Lambda invoke on itself (for private function chaining)

**`FunctionsLambda`** - Single Lambda:
- Type: `AWS::Lambda::Function`
- Runtime: nodejs20.x
- Handler: handler.handler
- Timeout: 30 (updated by deploy to max of all functions)
- MemorySize: 256 (same max rule)
- Code: S3 (separate zip from ApiFunction, via
  `FunctionsLambdaS3Key` parameter)
- Environment: DSQL_ENDPOINT, REGION_NAME, STACK_NAME,
  JWT_SECRET, API_URL (for ctx.boa.rest)

**`FunctionsLogGroup`** - CloudWatch log group:
- Type: `AWS::Logs::LogGroup`
- Retention: 30 days
- LogGroupName: `!Sub '/aws/lambda/${ProjectName}-functions'`

**API Gateway resources** (three resources, following the
same pattern as the existing `ApiProxyPlusResource` +
`ApiProxyPlusMethod`):

- `FunctionsApiResource`: `AWS::ApiGateway::Resource`
  - ParentId: `!GetAtt Api.RootResourceId`
  - PathPart: `functions`
- `FunctionsApiV1Resource`: `AWS::ApiGateway::Resource`
  - ParentId: `!Ref FunctionsApiResource`
  - PathPart: `v1`
- `FunctionsApiNameResource`: `AWS::ApiGateway::Resource`
  - ParentId: `!Ref FunctionsApiV1Resource`
  - PathPart: `{name+}`
- `FunctionsApiMethod`: `AWS::ApiGateway::Method`
  - ResourceId: `!Ref FunctionsApiNameResource`
  - HttpMethod: ANY
  - AuthorizationType: NONE (JWT validation inside Lambda)
  - Integration: AWS_PROXY to FunctionsLambda

The `ApiDeployment` resource's `DependsOn` list must
include `FunctionsApiMethod` (alongside
`ApiRootMethod` and `ApiProxyPlusMethod`) so
CloudFormation does not race the stage.

**Important:** The existing `{proxy+}` on `Api` catches
all paths including `/functions/v1/*`. API Gateway
resolves the most specific resource first, so an
explicit `/functions/v1/{name+}` resource takes
precedence over the root `{proxy+}`. No change to the
existing proxy resources is needed.

**`FunctionsLambdaPermission`** - Allow API Gateway to
invoke FunctionsLambda:
- Type: `AWS::Lambda::Permission`
- SourceArn pattern:
  `arn:aws:execute-api:.../${Api}/*/*/*`

**`FunctionsLambdaS3Key`** - New CloudFormation parameter
(Type: String) for the functions zip S3 key. Parallels
the existing `LambdaS3Key` parameter.

These resources are added unconditionally. If `functions/`
is empty, the Lambda exists with an empty registry and
returns 404 for every name.

### Deploy Flow Changes (`deploy.mjs`)

The deploy task tree gains a new step after "Prepare
runtime" (ApiFunction packaging). Follows the same
content-addressed upload pattern: hash the zip, check if
already in S3, skip upload if unchanged.

1. Discover functions (`cli/lib/functions/discover.mjs`)
2. If secrets are declared, validate they exist in SSM
3. Package functions + runtime into a zip
4. Hash the zip -> `functions/${hash}.zip` key
5. Upload to S3 artifacts bucket (skip if key exists)
6. Pass the S3 key as `FunctionsLambdaS3Key` in the
   CloudFormation parameters object (alongside existing
   `LambdaS3Key`, `LambdaS3Bucket`, `ProjectName`)
7. If max timeout/memory changed vs. deployed config,
   a full stack update is triggered; otherwise a
   code-only `update-function-code` suffices

The `packageArtifacts()` return shape gains a
`functionsKey` field:
```javascript
return { bucket, lambdaKey, functionsKey, templateUrl, accountId };
```

### Init Flow Changes (`init.mjs`)

After scaffolding `migrations/` and `policies/`:

1. Create `functions/` directory
2. Copy `functions/hello/index.mjs` from template
3. Copy `functions/hello/boa.json` from template

### Verify Flow Changes (`verify.mjs`)

New checks appended after existing checks:

1. **Functions registry parity** - compare local
   `functions/` with deployed `_registry.json` (fetched
   via `get-function-configuration` or a dedicated
   `boa functions list --deployed` path).
2. **SSM secrets present** - for each function with
   secrets, verify the SSM parameters exist.
3. **Route reachability** - `curl /functions/v1/hello`
   and expect 200 or 401 (not 500 or timeout).

## Code Architecture / File Changes

### New Files

```
cli/lib/functions/
  discover.mjs           # walk functions/, validate
  package.mjs            # bundle into zip
  registry.mjs           # build routing manifest
  runtime/
    handler.mjs          # FunctionsLambda entry point
    ctx.mjs              # build ctx object
    boa-client.mjs       # ctx.boa helpers
    logger.mjs           # structured logger

cli/commands/functions.mjs     # list/invoke/logs/remove

cli/templates/functions/
  hello/
    index.mjs            # scaffold example
    boa.json             # scaffold config

cli/__tests__/
  functions-discover.test.mjs
  functions-package.test.mjs
  functions-registry.test.mjs
  functions-runtime-routing.test.mjs
  functions-runtime-ctx.test.mjs
  functions-runtime-boa-client.test.mjs
  functions-cli-list.test.mjs
  functions-cli-invoke.test.mjs
  deploy-functions.test.mjs
  init-scaffolds-functions.test.mjs
  verify-functions.test.mjs
```

### Modified Files

| File | Change |
|------|--------|
| `cli/templates/backend.yaml` | Add FunctionsLambda, role, log group, API resource, permission, parameter |
| `cli/commands/init.mjs` | Scaffold `functions/hello/` |
| `cli/commands/deploy.mjs` | Discover + package + upload functions |
| `cli/commands/verify.mjs` | Functions parity, secrets, route checks |
| `cli/bin/boa.mjs` | Register `functions` subcommand |
| `cli/lib/deploy.mjs` | Functions packaging step in task tree |
| `plugin/skills/boa/SKILL.md` | New "Custom Functions" section |
| `plugin/skills/boa/evals/evals.json` | +3 function scenarios |
| `plugin/docs/FUNCTIONS.md` | Full reference (replace placeholder) |
| `plugin/docs/ARCHITECTURE.md` | Functions row in stack table |
| `plugin/docs/PITFALLS.md` | Function-specific failures |
| `plugin/CLAUDE.md` | Architecture + Key Files entry |
| `plugin/AGENTS.md` | Same updates |
| `docs/PRODUCT.md` | Capability mention |
| `docs/GLOSSARY.md` | New terms |
| `website/docs/functions.html` | Human-readable reference |
| `cli/README.md` | Document `boa functions` subcommands |

## Testing Strategy

### Unit Tests (`cli/__tests__/`)

| File | What it asserts |
|------|-----------------|
| `functions-discover.test.mjs` | Walks `functions/` correctly. Rejects invalid names. Rejects directories without `index.mjs`. Parses `boa.json` and applies defaults. Reports clear error when secret is missing in SSM. |
| `functions-package.test.mjs` | Produces deterministic zip. Bundles every function plus runtime. Computes shared timeout/memory as max. Embeds registry JSON. Excludes `node_modules` from per-function dirs. |
| `functions-registry.test.mjs` | Registry contains every function with visibility/timeout/memory. Private functions present in registry but absent from API Gateway path map. Reserved names rejected. |
| `functions-runtime-routing.test.mjs` | Entry handler dispatches by name. Public function via API GW -> handler invoked. Private function via API GW -> 404. Private function via direct invoke (`_boaInternal`) -> handler invoked. Unknown name -> 404 with PostgREST-shaped body. |
| `functions-runtime-ctx.test.mjs` | Full token table enforced. One test per row: no auth -> anon; Bearer JWT -> authenticated with userId; apikey anon -> anon; apikey service -> service_role; both headers -> JWT wins for userId, service key elevates; malformed JWT -> anon. Each test asserts DSQL signer invoked with expected role. |
| `functions-runtime-boa-client.test.mjs` | `ctx.boa.functions.invoke()` forwards caller JWT. `ctx.boa.asService().functions.invoke()` mints service token. `ctx.boa.rest.from()` round-trips with caller role. `ctx.boa.db()` returns service-role pool independent of `ctx.db`. |
| `functions-cli-list.test.mjs` | Reads deployed registry, formats correctly, exits non-zero if local diverges from deployed. |
| `functions-cli-invoke.test.mjs` | Defaults to anon. `--service` injects service key. `--data` parsed as JSON, rejected on parse error. |
| `deploy-functions.test.mjs` | `boa deploy` with `functions/` discovers, packages, uploads, updates Lambda. Stack updated only when timeout/memory max changes. Empty `functions/` still deploys Lambda returning 404. |
| `init-scaffolds-functions.test.mjs` | `boa init` creates `functions/hello/index.mjs` and `boa.json` with documented shape. Example handler returns `ctx.userId` with status 200. |
| `verify-functions.test.mjs` | Clean state when local matches deployed. Reports drift when local function missing remotely (or vice versa). Reports missing SSM secrets. Probes `/functions/v1/hello` and asserts reachable. |

### Negative / Security Tests

In `functions-runtime-ctx.test.mjs` and
`functions-runtime-routing.test.mjs`:

- Private function via API Gateway with any key -> 404.
- Mutating `ctx.role` mid-execution does not affect
  `ctx.db` (role captured at pool creation).
- Throwing handler does not leak JWT or secrets in error
  response. Stack traces go to CloudWatch only.
- JWT with `role: service_role` but wrong signing key ->
  rejected.

### Integration Test (live deploy)

Added to `plans/e2e-testing-plan.md`:

1. `boa init e2e-functions-test`
2. Add three functions: `public-hello` (public),
   `private-cleanup` (private), `service-only` (public,
   checks `ctx.role === 'service_role'`).
3. `boa deploy`
4. `curl /functions/v1/public-hello` with anon -> 200
5. `curl /functions/v1/public-hello` with user JWT ->
   200, body contains userId
6. `curl /functions/v1/private-cleanup` with service key
   -> 404
7. Direct Lambda invoke with `_boaInternal` -> 200
8. `curl /functions/v1/service-only` anon -> 403; service
   key -> 200
9. `boa functions invoke public-hello --data '{"id":1}'`
   -> 200
10. `boa functions logs public-hello --tail` shows
    structured log
11. `boa functions remove public-hello` + deploy -> 404
12. `boa teardown` cleanup

### Manual Test Entries

Added to `plans/manual-test-plan.md`:

- "Functions: scaffold, deploy, invoke" -- happy path
- "Functions: visibility enforcement" -- private not
  reachable via API Gateway
- "Functions: token propagation" -- function calls REST
  API as caller, sees only caller's rows
- "Functions: service-role escape hatch" -- function
  elevates, reads cross-tenant data
- "Functions: secrets via SSM" -- secret reaches ctx.env,
  missing secret fails deploy with clear error

### Skill-Level Evals

Added to `plugin/skills/boa/evals/evals.json`:

| Scenario | Pass criteria |
|----------|---------------|
| "Add a Stripe webhook handler that verifies the signature and stores the event" | Agent creates `functions/stripe-webhook/` with `visibility: "private"`, lists `STRIPE_WEBHOOK_SECRET` in secrets, runs `boa deploy`. Does not expose publicly. |
| "Add an endpoint that returns my todos with a computed score" | Agent creates a public function using `ctx.db` (caller-scoped), not `ctx.boa.db()`. Does not elevate. |
| "Add a daily cleanup job only the admin can run" | Agent creates a private function. Explains how to invoke (direct invoke or `boa functions invoke --service`). Does not expose via API Gateway. |

### Launch Gate

Functions does not ship until:
- Every `cli/__tests__/` file passes
- The E2E integration test runs green on a clean account
- All three evals pass with the production skill in a
  fresh Claude Code session
- Manual test entries are checked off

## Implementation Order

1. **Runtime + tests.** Build
   `cli/lib/functions/runtime/` (handler, ctx, boa-client,
   logger) with `functions-runtime-ctx.test.mjs`,
   `functions-runtime-routing.test.mjs`, and
   `functions-runtime-boa-client.test.mjs`. Token-table
   coverage green before moving on.

2. **Discovery + packaging + tests.** `discover.mjs`,
   `package.mjs`, `registry.mjs` plus their test files.
   `boa deploy --dry-run` produces a valid zip locally.

3. **CloudFormation.** Add FunctionsLambda, role, log
   group, API Gateway resource to `backend.yaml`. Deploy
   to test stack with zero functions -> 404 cleanly.
   `deploy-functions.test.mjs` covers the deploy path.

4. **Scaffold + example + tests.** `boa init` writes
   `functions/hello/`; test enforces shape. End-to-end:
   `boa init`, `curl /functions/v1/hello` returns 200.

5. **CLI subcommands + tests.** `list`, `invoke`, `logs`,
   `remove` plus `functions-cli-list.test.mjs` and
   `functions-cli-invoke.test.mjs`.

6. **Verify + tests.** Extend `boa verify` for registry
   parity, route reachability, SSM secrets.
   `verify-functions.test.mjs` covers it.

7. **E2E + manual + evals.** Add integration test to
   e2e plan, manual entries, and three eval scenarios.
   Run all before claiming done.

8. **Skill + docs.** Update `SKILL.md`, `FUNCTIONS.md`,
   `PITFALLS.md`, `ARCHITECTURE.md`, `CLAUDE.md`,
   `AGENTS.md`, website page. Docs go last so they
   describe what was actually built.

## Open Questions

1. **`ctx.db` lifecycle:** Lazy-built on first access
   (cold-start friendly) or pre-built per invocation
   (predictable latency)? Defaulting to lazy.

2. **Private function authorization:** Allow
   `service_role` JWT through API Gateway for ops
   scripts, or strictly Lambda-direct-invoke only?
   Defaulting to Lambda-direct-invoke only -- more
   secure, simpler mental model.

3. **Function naming rules:** `[a-z][a-z0-9-]{0,62}`,
   reject `v1`, `health`, `_internal`. Confirm during
   implementation.

4. **Shared Lambda cold start:** With many functions
   bundled, the zip grows. If the total zip exceeds 50 MB
   (Lambda limit for direct upload), switch to S3-based
   deployment (already the pattern for ApiFunction). No
   action needed until a project hits 50+ functions.

5. **Per-function `node_modules`:** Functions that need
   third-party packages (e.g., `stripe`) will need their
   own `node_modules`. The packaging step should include
   per-function `node_modules` when present but skip them
   during discovery validation. This is a Phase 2
   concern if the initial implementation excludes it.
