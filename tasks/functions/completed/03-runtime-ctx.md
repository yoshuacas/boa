# Task 03: Context Builder (ctx.mjs)

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Create the context builder that extracts auth from the event,
builds the lazy `ctx.db` pool, and assembles the full `ctx`
object with role, userId, email, jwt, env, and logger.

## Target Tests

From `functions-runtime-ctx.test.mjs`:
- No auth headers -> role anon, userId '', email ''
- Bearer JWT -> authenticated with sub and email
- apikey anon -> anon
- apikey service role -> service_role
- Both headers -> JWT wins for userId, service key elevates
- Malformed JWT -> fallback to anon, no throw
- JWT with wrong signing key -> rejected, fallback to anon
- ctx.db lazy: pool created on first access only
- ctx.db not accessed -> no pool created
- Mutating ctx.role does not change ctx.db binding
- ctx.env contains merged env from registry
- ctx.logger produces structured JSON with function name

## Implementation

### cli/lib/functions/runtime/ctx.mjs

```javascript
export function buildCtx(event, registry, functionName) {
  const { role, userId, email, jwt } = extractAuth(event);

  let _pool = null;
  return {
    role,
    userId,
    email,
    jwt,
    get db() {
      if (!_pool) _pool = getCallerPool(role, jwt);
      return _pool;
    },
    boa: buildBoaClient(jwt, role),
    logger: buildLogger(functionName),
    env: buildEnv(registry[functionName]),
  };
}
```

### extractAuth(event)

Reuses the JWT parsing logic from
`cli/templates/lambda/index.mjs` (normalizeEvent). Extract
into a shared utility or reimplement:

1. Check `event.headers.authorization` for `Bearer <token>`.
2. Check `event.headers.apikey` against known keys
   (from env: `ANON_KEY`, `SERVICE_ROLE_KEY`).
3. If JWT present, verify signature with `JWT_SECRET`.
   - Valid: `role = 'authenticated'`, userId = sub, email
     from claims.
   - Invalid/malformed: fall back to anon, do not throw.
4. If apikey is service_role key: set role to
   `'service_role'`.
5. Priority when both present: JWT provides userId/email;
   service key elevates role.
6. Default (nothing): role = 'anon', userId = '', email = ''.

### getCallerPool(role, jwt)

Creates a DSQL connection pool using the same `DsqlSigner`
pattern from pgrest-lambda. The pool is bound to the
caller's role at creation time. Role captured at this point
is immutable for this pool instance.

Use env vars: `DSQL_ENDPOINT`, `REGION_NAME`.

### buildEnv(functionEntry)

Merges `functionEntry.env` (from boa.json) with resolved
secrets (from SSM, pre-loaded as env vars by Lambda).
Returns a plain object.

### buildLogger(functionName)

Import from `./logger.mjs` (created in this task):

```javascript
export function buildLogger(functionName) {
  const base = { function: functionName };
  return {
    info(msg, data = {}) {
      console.log(JSON.stringify({
        level: 'info', ...base, msg, ...data, ts: Date.now(),
      }));
    },
    warn(msg, data = {}) {
      console.log(JSON.stringify({
        level: 'warn', ...base, msg, ...data, ts: Date.now(),
      }));
    },
    error(msg, data = {}) {
      console.error(JSON.stringify({
        level: 'error', ...base, msg, ...data, ts: Date.now(),
      }));
    },
  };
}
```

### cli/lib/functions/runtime/logger.mjs

Standalone file exporting `buildLogger` as shown above.

## Acceptance Criteria

- All `functions-runtime-ctx.test.mjs` tests pass
- ctx.db is truly lazy (no pool created until accessed)
- Malformed/invalid JWTs never throw -- graceful fallback
- Logger output is valid JSON with function name field
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the existing `normalizeEvent` in
  `cli/templates/lambda/index.mjs` has different auth
  extraction logic than described here, align with the
  existing behavior and note the difference.
