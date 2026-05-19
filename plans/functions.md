# Plan: BOA Functions

## Problem

BOA today exposes one Lambda (`pgrest-lambda`) for `/rest/v1/*` and `/auth/v1/*`. Every other Supabase-shaped backend offers **Edge Functions / Functions** — a place to drop custom code (webhook handler, Stripe charge, AI completion, scheduled report) that runs alongside the database with the same auth context. BOA does not.

Today the only path is "hand-edit `cli/templates/backend.yaml`, add a new Lambda resource, an IAM role, an event source, package the source yourself." That is exactly the AWS complexity BOA exists to remove. `plugin/docs/FUNCTIONS.md` already admits this gap.

## Solution

**Functions are local code that BOA deploys to a single shared Lambda behind `/functions/v1/<name>`.** The developer drops a file at `functions/<name>/index.mjs`. `boa deploy` packages every function, deploys them in one Lambda, and wires the route. The skill teaches agents the file shape and the visibility flag. Either the **anon key** (caller's JWT) or the **service key** (full powers) can invoke a function. The function receives a normalized `ctx` with the caller's role, userId, JWT, and helpers for talking to the database and other BOA services.

The single Lambda packaging matches the BOA design principle of one opinionated path. It costs less, deploys faster, has one log group, and one IAM role. Per-function isolation is a future extension — not in scope.

## Surface Area

```
project/
├── functions/                          # NEW — developer-authored
│   ├── hello/
│   │   ├── index.mjs                   # default export = handler
│   │   └── boa.json                    # per-function config (visibility, etc.)
│   ├── stripe-webhook/
│   │   ├── index.mjs
│   │   └── boa.json
│   └── send-report/
│       └── index.mjs                   # boa.json optional; defaults apply
├── .boa/config.json                    # tracks deployed functions list
└── migrations/, policies/              # unchanged
```

**`functions/<name>/index.mjs`**

```javascript
// Default export is the handler.
// Receives a normalized request and a BOA context.
export default async function handler(req, ctx) {
  // req.method, req.path, req.query, req.headers, req.body (parsed JSON if applicable)
  // ctx.role     'anon' | 'authenticated' | 'service_role'
  // ctx.userId   user UUID or '' for anon
  // ctx.email    user email or ''
  // ctx.jwt      raw caller JWT, or '' if none
  // ctx.db       authorized Postgres pool (see "Tokens" below)
  // ctx.boa      service-role client for trusted ops
  // ctx.logger   structured logger writing to CloudWatch
  // ctx.env      function-specific env vars (BOA_* plus user-defined)

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
| `visibility` | `"public"` \| `"private"` | `"public"` | `public` = exposed at `/functions/v1/<name>`. `private` = only invocable by another function or `service_role`. |
| `timeout` | seconds, max 30 | 30 | Per-function override. Shared Lambda runs at the **max** of all deployed functions. |
| `memory` | MB | 256 | Same — shared Lambda runs at the max. |
| `env` | object | `{}` | Plain env vars (non-secret). Merged into `ctx.env`. |
| `secrets` | string[] | `[]` | Names that must exist in SSM at `/<stack-name>/functions/<name>/<SECRET>`. Surfaced to the function via `ctx.env`. |

`secrets` are **stored as `--type String` in SSM** because CloudFormation does not resolve `SecureString` for Lambda env vars (see `plugin/docs/FUNCTIONS.md`).

## Routing & Visibility

```
Public:
  client → API Gateway → /functions/v1/<name> → FunctionsLambda → handler

Private:
  another function → ctx.boa.functions.invoke('<name>', payload)
                   → FunctionsLambda direct invoke (no API Gateway)
                   → handler
```

| Visibility | API Gateway route | Auth required to call |
|------------|-------------------|-----------------------|
| `public`   | `ANY /functions/v1/<name>` | Anon key OR service key OR user JWT |
| `private`  | None | Service key only — through `ctx.boa.functions.invoke()` or direct Lambda invoke with the right IAM principal |

API Gateway sends the request to the same Lambda regardless of name. Routing happens in the Functions Lambda's entry handler, identical in spirit to how `pgrest-lambda` dispatches `/rest/v1/*` vs `/auth/v1/*`.

## Tokens & Authorization

This is the core of the feature. Two keys can invoke a function. Each produces a different `ctx`.

| Caller header | `ctx.role` | `ctx.userId` | `ctx.db` is bound to | `ctx.boa` |
|---------------|------------|--------------|----------------------|-----------|
| No auth | `'anon'` | `''` | DSQL role `anon` | service-role client (see "Service-role escape hatch") |
| `Authorization: Bearer <user JWT>` | `'authenticated'` | user UUID | DSQL role `authenticated` with `request.jwt.claims` set | service-role client |
| `apikey: <anon key>` | `'anon'` | `''` | DSQL role `anon` | service-role client |
| `apikey: <service role key>` | `'service_role'` | `''` | DSQL role `service_role` | service-role client (full powers) |

**Three rules govern the design:**

1. **Default to least privilege.** `ctx.db` is bound to the caller's role. If a user calls a function with their JWT, queries through `ctx.db` see exactly what they can see through the REST API. Cedar policies and DSQL row-level grants apply uniformly. No accidental privilege escalation.

2. **Service-role escape hatch is explicit.** A function can opt into full powers via `ctx.boa.db()` (service-role pool). This is the equivalent of "the function called itself with the service key." It is not the default. The skill teaches agents to reach for it only when the user explicitly needs server-side privileged work (Stripe webhook verification, cross-tenant cleanup).

3. **The caller's JWT is forwarded by default.** When a function calls another function or the REST API through `ctx.boa`, the caller's JWT propagates unless the function explicitly elevates with `ctx.boa.asService()`. This preserves the user's identity across the call chain — a public function calling a private function still respects the original user's row-level access.

**Concretely, the helpers:**

```javascript
// Default: caller's role
const userPool = ctx.db;
const { rows } = await userPool.query('SELECT * FROM todos');

// Explicit elevation: service role
const adminPool = await ctx.boa.db();   // service_role pool
await adminPool.query('UPDATE billing SET ...');

// Call another function as the same user
const out = await ctx.boa.functions.invoke('send-report', { id: 1 });

// Call another function with full powers
const out = await ctx.boa.asService().functions.invoke('cleanup', { tenant: 't_1' });

// Hit the REST API as the same user
const todos = await ctx.boa.rest.from('todos').select('*');
```

`ctx.boa.db()` re-uses the same DSQL signer/pool pattern from `pgrest-lambda` — no new infra, no new code in `cli/templates/lambda/`. The functions runtime imports it.

## Cloud Resources (CloudFormation deltas)

Added to `cli/templates/backend.yaml`:

| Resource | Purpose |
|----------|---------|
| `FunctionsLambda` | Single Node.js 20.x Lambda. Source: packaged `functions/` plus the `boa-functions` runtime (router + ctx builder). |
| `FunctionsLambdaRole` | Execution role. DSQL connect permission. SSM read for `/<stack>/functions/*`. CloudWatch Logs. Lambda invoke for itself (private function chaining). |
| `FunctionsLogGroup` | One log group, one retention policy. Per-function log streams come from the structured logger (`function=<name>` field). |
| `FunctionsApiResource` | API Gateway resource at `/functions/v1/{name+}`. Same authorizer config as `/rest/v1/*` so anon / user / service keys work identically. |
| `FunctionsLambdaPermission` | Allow API Gateway to invoke the Lambda. |

The resources are added unconditionally — Functions is part of the default stack, like REST and Auth. If `functions/` is empty, the Lambda exists with an empty registry and returns `404` for every name. No conditional CloudFormation. One opinionated path.

The deploy command writes the registry as bundled JSON, not as a CloudFormation parameter, so adding/removing a function does not need a stack update — just a Lambda code update. (Initial deploy still does a stack update; subsequent function add/remove only updates the Lambda code package.)

## CLI Changes

| Command | Behavior |
|---------|----------|
| `boa init` | Creates `functions/` directory and a `functions/hello/` example with `index.mjs` + `boa.json`. Deploys the stack including `FunctionsLambda`. |
| `boa deploy` | Discovers `functions/*/index.mjs`, validates each (default export is a function, `boa.json` parses, `secrets` exist in SSM), packages them with the runtime, uploads, updates the Lambda. Computes the shared `timeout`/`memory` as the max across functions. |
| `boa functions list` | Lists discovered functions, visibility, deployed version. |
| `boa functions invoke <name> [--service] [--data <json>]` | Local invocation against the deployed Lambda — anon by default, `--service` uses the service key. Wraps `aws lambda invoke` with the right payload shape. |
| `boa functions logs <name> [--tail]` | Tails the Functions log group filtered to the named function. |
| `boa functions remove <name>` | Deletes the directory, redeploys the Lambda without it. The route is gone after the next deploy. |
| `boa verify` | Checks that every `functions/<name>` matches what the deployed registry says, reports missing secrets, confirms route is reachable. |

`boa init`'s `functions/hello/index.mjs` is the agent's reference example — small, public, reads `ctx.userId`, returns JSON.

## Skill Changes (`plugin/skills/boa/`)

Add a new section to `SKILL.md` after API Gateway / REST API:

> ### Custom Functions
>
> When the developer needs custom server-side logic that REST and Cedar
> policies cannot express (webhooks, third-party API calls with secret
> credentials, scheduled jobs, AI calls, complex multi-table workflows),
> create a function:
>
> 1. Write `functions/<name>/index.mjs` with `export default async (req, ctx) => {...}`.
> 2. (Optional) Write `functions/<name>/boa.json` to set `visibility`, `secrets`, env.
> 3. Run `boa deploy`. The route appears at `/functions/v1/<name>` for public functions.
>
> **Decide before writing:**
> - Is this work the database can do (SQL view, generated column, trigger)? Stay in the database.
> - Is this work `pgrest-lambda` already covers (CRUD, filter, embed)? Use the REST API.
> - Is this third-party / scheduled / privileged? **Now** write a function.
>
> **Never write a function for CRUD.** REST + policies handle that.

Replace `plugin/docs/FUNCTIONS.md` (currently a placeholder explaining functions don't exist) with full reference docs:

- Anatomy of a function (`req`, `ctx`, return shape)
- Visibility (`public` vs `private`) with one example each
- Token model (the table from "Tokens & Authorization")
- Calling other functions and the REST API from inside a function
- Secrets via SSM
- The decision tree (database vs REST vs function)
- Common mistakes (the existing SSM-SecureString and Api-cycle pitfalls stay)

Update `plugin/CLAUDE.md` quick reference to add `/functions/v1/*` to the architecture and a "Custom Functions" row to the Key Files table.

Update `plugin/skills/boa/evals/evals.json` with at least three function-shaped scenarios:
- "Add a Stripe webhook handler" — exercises private visibility + secrets
- "Add a function that returns my todos with extra metadata" — exercises caller JWT + `ctx.db`
- "Add a function only the admin can invoke" — exercises service-role-only visibility

## Repository Documentation Changes

| File | Change |
|------|--------|
| `plugin/docs/FUNCTIONS.md` | Replace placeholder with full reference (above) |
| `plugin/docs/ARCHITECTURE.md` | Add Functions row to the architecture diagram and stack table |
| `plugin/docs/PITFALLS.md` | Add "function called itself in a loop", "forgot to elevate to service role for privileged work", "exposed a private function publicly by mistake" |
| `plugin/CLAUDE.md` | Architecture diagram + Key Files entry |
| `plugin/AGENTS.md` | Same updates as `CLAUDE.md` (cross-compat with Codex / Copilot) |
| `docs/PRODUCT.md` | One-line addition: "Functions: custom server-side code, deployed in one command" under capabilities |
| `docs/GLOSSARY.md` | Add `Function`, `FunctionsLambda`, `function visibility`, `service key`, `caller JWT propagation` |
| `website/docs/` | New page `functions.html` with the same reference content for human readers |
| `cli/README.md` | Document `boa functions list/invoke/logs/remove` |

## Files That Change

```
NEW:
  plans/functions.md                                   ← this file
  cli/lib/functions/
    discover.mjs           # walk functions/, validate index.mjs and boa.json
    package.mjs            # bundle into the FunctionsLambda zip
    registry.mjs           # build the routing manifest
    runtime/
      handler.mjs          # FunctionsLambda entry: parse event, route by name
      ctx.mjs              # build the ctx object (role, db pool, boa client)
      boa-client.mjs       # ctx.boa: rest, functions.invoke, asService, db()
      logger.mjs           # structured logger
  cli/commands/functions.mjs     # boa functions list/invoke/logs/remove
  cli/templates/functions/hello/index.mjs
  cli/templates/functions/hello/boa.json
  plugin/lambda-templates/functions/   # the runtime, deployed alongside user code

MODIFIED:
  cli/templates/backend.yaml          # add FunctionsLambda + role + route
  cli/commands/init.mjs               # scaffold functions/ on boa init
  cli/commands/deploy.mjs             # discover + package + upload functions
  cli/commands/verify.mjs             # check Functions route + registry parity
  cli/bin/boa                         # register `functions` subcommand
  plugin/skills/boa/SKILL.md          # new Functions section
  plugin/skills/boa/evals/evals.json  # +3 function scenarios
  plugin/docs/FUNCTIONS.md            # full reference (replace placeholder)
  plugin/docs/ARCHITECTURE.md         # diagram + stack table row
  plugin/docs/PITFALLS.md             # function-specific failures
  plugin/CLAUDE.md                    # architecture + key files
  plugin/AGENTS.md                    # same
  docs/PRODUCT.md                     # capability mention
  docs/GLOSSARY.md                    # new terms
  website/docs/                       # functions.html
  cli/README.md                       # CLI reference
```

## Testing

The feature is not done until every layer below is covered. Unit tests live in `cli/__tests__/` and use the existing Node test runner pattern (no new framework). Integration tests live alongside their command. Live deploy tests are added to the existing manual and E2E plans. Skill-level tests are evals run by the agent.

### Unit tests (added to `cli/__tests__/`)

| File | What it asserts |
|------|-----------------|
| `functions-discover.test.mjs` | Walks `functions/` correctly. Rejects names that violate the naming rule. Rejects directories without `index.mjs`. Parses `boa.json` and applies defaults. Reports a clear error when a `secret` listed in `boa.json` does not exist in SSM. |
| `functions-package.test.mjs` | Produces a deterministic zip. Bundles every discovered function plus the runtime. Computes shared `timeout`/`memory` as the max across functions. Embeds the registry JSON. Excludes `node_modules` from per-function dirs. |
| `functions-registry.test.mjs` | Routing manifest contains every public function with its visibility, timeout, memory. Private functions are present in the registry but absent from the API Gateway path map. Reserved names are rejected. |
| `functions-runtime-routing.test.mjs` | `FunctionsLambda` entry handler dispatches by name. Public function via API Gateway → handler invoked. Private function via API Gateway → 404. Private function via direct invoke (Lambda event with `_boaInternal: true`) → handler invoked. Unknown name → 404 with the PostgREST-shaped error body. |
| `functions-runtime-ctx.test.mjs` | **The full token table is enforced here.** One test per row: <ul><li>No auth header → `ctx.role === 'anon'`, `ctx.userId === ''`</li><li>`Authorization: Bearer <user JWT>` → `ctx.role === 'authenticated'`, `ctx.userId === sub`, `ctx.email` populated</li><li>`apikey: <anon key>` → `ctx.role === 'anon'`</li><li>`apikey: <service role key>` → `ctx.role === 'service_role'`</li><li>Both headers present, JWT wins for `userId`, service key still elevates role</li><li>Malformed JWT → falls back to anon, no throw</li></ul> Each test also asserts the DSQL signer is invoked with the role expected for that row. |
| `functions-runtime-boa-client.test.mjs` | `ctx.boa.functions.invoke('<name>', payload)` forwards the caller JWT by default. `ctx.boa.asService().functions.invoke(...)` mints a service-role token. `ctx.boa.rest.from(...)` round-trips through `pgrest-lambda` with the caller's role. `ctx.boa.db()` returns a service-role pool independent of `ctx.db`. |
| `functions-cli-list.test.mjs` | `boa functions list` reads from the deployed registry, formats correctly, exits non-zero if the local `functions/` and the deployed registry diverge. |
| `functions-cli-invoke.test.mjs` | `boa functions invoke <name>` defaults to anon. `--service` injects the service key. `--data` is parsed as JSON and rejected on parse error. |
| `deploy-functions.test.mjs` | `boa deploy` with `functions/` present discovers, packages, uploads, and updates the Lambda. Stack is updated only when the registry's stack-relevant fields (timeouts, memory max) change. With empty `functions/` the Lambda is still deployed and returns 404. |
| `init-scaffolds-functions.test.mjs` | `boa init` creates `functions/hello/index.mjs` and `functions/hello/boa.json` with the documented shape. The example handler returns `ctx.userId` and exits with `status: 200`. |
| `verify-functions.test.mjs` | `boa verify` reports a clean state when local matches deployed. Reports drift when a local function is missing remotely (or vice versa). Reports missing SSM secrets. Probes `/functions/v1/hello` and asserts a 200/401 (depending on visibility) is reachable. |

### Negative / security tests (in `functions-runtime-ctx.test.mjs` + `functions-runtime-routing.test.mjs`)

- A `private` function called through API Gateway with **any** key (anon, user, service) returns 404. The route does not exist; this asserts CloudFormation correctness, not just runtime.
- A function that mutates `ctx.role` mid-execution does not affect `ctx.db` (the role is captured at pool creation).
- A function that throws does not leak the JWT or SSM secret values into the error response. Stack traces go to CloudWatch only.
- Invocation with a JWT whose `role` claim is `service_role` but signed with the wrong key is rejected (the existing `pgrest-lambda` JWT verifier path is exercised through the same module).

### Integration test (live deploy, added to `plans/e2e-testing-plan.md`)

A full happy path against a real BOA stack:

1. `boa init e2e-functions-test`
2. Add three functions: `public-hello` (public), `private-cleanup` (private), `service-only` (public but checks `ctx.role === 'service_role'` and 403s otherwise).
3. `boa deploy`
4. `curl /functions/v1/public-hello` with anon → 200
5. `curl /functions/v1/public-hello` with user JWT → 200, body contains `userId`
6. `curl /functions/v1/private-cleanup` with service key → 404 (private is direct-invoke only)
7. `aws lambda invoke ... --payload '{"_boaInternal":true,"name":"private-cleanup",...}'` → 200
8. `curl /functions/v1/service-only` with anon → 403; with service key → 200
9. `boa functions invoke public-hello --data '{"id":1}'` → 200
10. `boa functions logs public-hello --tail` shows the structured log line
11. `boa functions remove public-hello` → next deploy removes the route; curl returns 404
12. `boa teardown` cleans up

### Manual test entries (added to `plans/manual-test-plan.md`)

- "Functions: scaffold, deploy, invoke" — happy path
- "Functions: visibility enforcement" — private not reachable via API Gateway
- "Functions: token propagation" — function calls REST API as caller, sees only caller's rows
- "Functions: service-role escape hatch" — function explicitly elevates and reads cross-tenant data
- "Functions: secrets via SSM" — secret reaches `ctx.env`, missing secret fails deploy with a clear error

### Skill-level evals (added to `plugin/skills/boa/evals/evals.json`)

These are the tests that matter for launch — an agent driving the skill must succeed at all three before Functions ships. Per the saved testing approach, evals run a real Claude Code session against the skill, not a manual command sequence.

| Scenario | Pass criteria |
|----------|---------------|
| "Add a Stripe webhook handler that verifies the signature and stores the event" | Agent creates `functions/stripe-webhook/` with `visibility: "private"`, lists `STRIPE_WEBHOOK_SECRET` in `boa.json`, writes the function, runs `boa deploy`, and reports the invocation path. Does **not** expose the webhook publicly. |
| "Add an endpoint that returns my todos with a computed score" | Agent creates a `public` function that uses `ctx.db` (caller-scoped), not `ctx.boa.db()`. Does **not** elevate to service role. |
| "Add a daily cleanup job only the admin can run" | Agent creates a `private` function. Tells the developer how to invoke it (Lambda direct-invoke or `boa functions invoke --service`). Does **not** expose it through API Gateway. |

### Launch gate

Functions does not ship until:
- Every `cli/__tests__/` file above passes in CI
- The E2E integration test runs green on a clean account
- All three evals pass with the production skill in a fresh Claude Code session
- `plans/manual-test-plan.md` entries are checked off on the pre-launch run

## Implementation Order

1. **Runtime first, with tests.** Build `cli/lib/functions/runtime/` (handler, ctx, boa-client, logger) **with `functions-runtime-ctx.test.mjs`, `functions-runtime-routing.test.mjs`, and `functions-runtime-boa-client.test.mjs` written alongside.** Token-table coverage must be green before moving on. No CloudFormation yet.
2. **Discovery and packaging, with tests.** `discover.mjs`, `package.mjs`, `registry.mjs` plus `functions-discover.test.mjs`, `functions-package.test.mjs`, `functions-registry.test.mjs`. `boa deploy --dry-run` produces a valid zip locally.
3. **CloudFormation.** Add `FunctionsLambda`, role, log group, API Gateway resource to `backend.yaml`. Deploy to a test stack with zero functions → respond `404` cleanly. `deploy-functions.test.mjs` covers the deploy path.
4. **Scaffold and example, with tests.** `boa init` writes `functions/hello/`; `init-scaffolds-functions.test.mjs` enforces shape. End-to-end: `boa init`, `curl /functions/v1/hello` returns 200.
5. **CLI subcommands, with tests.** `list`, `invoke`, `logs`, `remove` plus `functions-cli-list.test.mjs` and `functions-cli-invoke.test.mjs`.
6. **Verify, with tests.** Extend `boa verify` to confirm registry parity, route reachability, and SSM secret presence. `verify-functions.test.mjs` covers it.
7. **E2E + manual + evals.** Add the integration test to `plans/e2e-testing-plan.md`, manual entries to `plans/manual-test-plan.md`, and the three eval scenarios to `evals.json`. Run all three before claiming done.
8. **Skill and docs.** Update `SKILL.md`, `FUNCTIONS.md`, `PITFALLS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, website page. Docs go last so they describe what was actually built (per the saved "never document what you haven't deployed" rule).

## Out of Scope

- **Per-function Lambdas.** All functions share one Lambda. If a real workload needs per-function isolation (custom timeout >30s, custom memory, distinct IAM, separate concurrency), that is a future extension (`boa extend isolated-functions`).
- **Function URLs.** API Gateway is the only ingress. Function URLs would skip the WAF and the authorizer.
- **Scheduled functions.** Will be a follow-up plan that adds an EventBridge rule + private function pattern.
- **Streaming responses.** Lambda response streaming is not exposed. Functions return a buffered JSON response. Streaming belongs in the ALB extension path.
- **Languages other than Node.js 20.x.** Per the existing critical rule (Node.js for Lambda, never Python).

## Open Questions

- **`ctx.db` lifecycle:** lazy-built on first access (cold-start friendly) or pre-built per invocation (predictable latency)? Default to lazy.
- **Private function authorization:** allow `service_role` JWT through API Gateway (for ops scripts), or strictly Lambda-direct-invoke only? Default to Lambda-direct-invoke only — more secure, simpler mental model, ops scripts use `aws lambda invoke` or `boa functions invoke --service`.
- **Function naming rules:** kebab-case, `[a-z][a-z0-9-]{0,62}`, reject reserved names (`v1`, `health`, `_internal`). Confirm during implementation.
