# Custom Functions

Drop a file at `functions/<name>/index.mjs`, run `boa deploy`,
and your function is live at `/functions/v1/<name>`. All
functions share a single Lambda (`FunctionsLambda`), one log
group, and one IAM role.

## Handler Signature

```javascript
export default async function handler(req, ctx) {
  // req.method    HTTP method (GET, POST, etc.)
  // req.path      Full request path
  // req.query     Parsed query parameters
  // req.headers   Request headers
  // req.body      Parsed body (JSON)

  return { status: 200, body: { message: 'ok' } };
}
```

The handler must be the default export of `index.mjs`. Return
an object with `status` (number) and `body` (serializable).

## boa.json Configuration

Each function may include a `boa.json` alongside `index.mjs`.
All fields are optional:

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
| `visibility` | `"public"` or `"private"` | `"public"` | Public functions are exposed at `/functions/v1/<name>`. Private functions are only invocable via direct Lambda invoke or `ctx.boa.functions.invoke()`. |
| `timeout` | seconds, 1-30 | 30 | Per-function override. The shared Lambda runs at the max of all deployed functions. |
| `memory` | MB, 128-1024 | 256 | Same max-of-all rule. |
| `env` | object | `{}` | Plain env vars (non-secret). Merged into `ctx.env`. |
| `secrets` | string[] | `[]` | Names that must exist in SSM at `/<stack-name>/functions/<name>/<SECRET>`. Surfaced via `ctx.env`. |

## Naming Rules

Function names must match `[a-z][a-z0-9-]{0,62}`.

Reserved names are rejected: `v1`, `health`, `_internal`.

```
Error: Invalid function name 'My_Func'.
  Function names must match [a-z][a-z0-9-]{0,62}.
```

```
Error: Reserved function name 'v1'. Choose a different name.
```

## Routing and Visibility

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

A `private` function called through API Gateway returns 404.
The route does not exist for that function name.

### Direct-invoke envelope

`ctx.boa.functions.invoke()` and `boa functions invoke
--service` send a Lambda payload that bypasses the API Gateway
path. The runtime detects the `_boaInternal` field and
dispatches by name:

```json
{
  "_boaInternal": { "name": "cleanup", "method": "POST" },
  "payload": { "userId": "u_123" },
  "headers": { "apikey": "<service-role-key>" }
}
```

The visibility gate is bypassed for direct invokes, so this is
the only way to reach `private` functions. Headers in the
envelope drive `ctx.role` and `ctx.userId` exactly as they
would for an HTTP request.

## Token Model

| Caller header | `ctx.role` | `ctx.userId` | `ctx.db` bound to |
|---------------|------------|--------------|-------------------|
| No auth | `'anon'` | `''` | DSQL role `anon` |
| `Authorization: Bearer <user JWT>` | `'authenticated'` | user UUID | DSQL role `authenticated` |
| `apikey: <anon key>` | `'anon'` | `''` | DSQL role `anon` |
| `apikey: <service role key>` | `'service_role'` | `''` | DSQL role `service_role` |

Rules:
- Both `Authorization` and `apikey` present: JWT wins for
  `userId`; service key still elevates role.
- Malformed JWT: falls back to anon, no throw.
- Expired JWT (`exp` in the past): rejected, falls back to anon.
- JWT with `role: service_role` but wrong signing key: rejected.
- Signature compare uses constant-time `timingSafeEqual`.

## Context Object (ctx)

| Property | Type | Description |
|----------|------|-------------|
| `ctx.role` | string | `'anon'`, `'authenticated'`, or `'service_role'` |
| `ctx.userId` | string | User UUID or `''` for anon |
| `ctx.email` | string | User email or `''` |
| `ctx.jwt` | string | Raw caller JWT or `''` |
| `ctx.db` | object | Lazy-built Postgres pool bound to the caller's role |
| `ctx.boa` | object | Service-role client for trusted operations |
| `ctx.logger` | object | Structured logger (CloudWatch) |
| `ctx.env` | object | Function-specific env vars from `boa.json` |

### Context Helpers

```javascript
// Default: caller's role (least privilege)
const { rows } = await ctx.db.query('SELECT * FROM todos');

// Explicit elevation: service role pool
const adminPool = await ctx.boa.db();
await adminPool.query('UPDATE billing SET ...');

// Call another function as the same user
const out = await ctx.boa.functions.invoke('send-report', { id: 1 });

// Call another function with full powers
const out = await ctx.boa.asService().functions.invoke('cleanup', {});

// Hit the REST API as the same user
const todos = await ctx.boa.rest.from('todos').select('*');

// Structured logs land in CloudWatch as JSON
ctx.logger.info('processing report', { reportId: 1 });
ctx.logger.error('send failed', { reportId: 1, code: 'TIMEOUT' });
```

The logger emits one JSON line per call (`level`, `function`,
`msg`, plus your data and `ts`). CloudWatch Insights can query
these fields directly. `console.log` still works but is not
structured; prefer `ctx.logger`.

**Key guidance:** Use `ctx.db` for caller-scoped access. Use
`ctx.boa.db()` only when elevation is explicitly needed.

`ctx.db` is lazy-built on first access (cold-start friendly).

## Secrets via SSM

Secrets listed in `boa.json` must exist in SSM before deploy:

```
/<stack-name>/functions/<name>/<SECRET>
```

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

## Error Response Shape

Functions return a PostgREST-shaped error body for consistency
with the rest of the BOA API:

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

## CLI Commands

| Command | Behavior |
|---------|----------|
| `boa functions list` | Lists discovered functions, visibility, deployed status |
| `boa functions invoke <name> [--service] [--data <json>]` | Invokes the deployed function. Anon by default, `--service` uses service key. |
| `boa functions logs <name> [--tail]` | Tails the log group filtered to the named function |
| `boa functions remove <name>` | Deletes the directory, prints reminder to redeploy |

## Troubleshooting

**"Function not found" on a function I just created:**
Run `boa deploy` first. Local functions are not live until
deployed.

**Private function returns 404:**
This is correct behavior. Private functions have no API
Gateway route. Invoke them with
`ctx.boa.functions.invoke()` or `boa functions invoke --service`.

**Missing SSM parameter blocks deploy:**
Store the secret before deploying:
```bash
aws ssm put-parameter \
  --name "/<stack>/functions/<name>/<SECRET>" \
  --value "..." --type String
```

**Pool error on first query:**
`ctx.db` is lazy -- pool errors surface on first query, not
on function invocation. Check DSQL endpoint and IAM
permissions.

**Large zip fails to upload:**
With 50+ functions the Lambda zip may exceed size limits.
Split into multiple projects or reduce function count.
