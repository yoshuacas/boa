# Task 04: BOA Client (boa-client.mjs)

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Create the `ctx.boa` helper object providing service-role
database access, function-to-function invocation, REST API
proxy, and the `asService()` elevation method.

## Target Tests

From `functions-runtime-boa-client.test.mjs`:
- ctx.boa.functions.invoke() forwards caller JWT
- ctx.boa.asService().functions.invoke() uses service token
- ctx.boa.rest.from().select() includes caller JWT in header
- ctx.boa.db() returns service-role pool independent of ctx.db
- ctx.boa.db() called multiple times reuses same pool

## Implementation

### cli/lib/functions/runtime/boa-client.mjs

```javascript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({
  region: process.env.REGION_NAME,
});

export function buildBoaClient(jwt, role) {
  let _servicePool = null;

  return {
    async db() {
      if (!_servicePool) {
        _servicePool = getServiceRolePool();
      }
      return _servicePool;
    },
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

### directInvoke(name, payload, jwt)

Calls `Lambda.invoke()` targeting the FunctionsLambda itself
(self-invoke). The payload includes:
```javascript
{
  _boaInternal: { name },
  body: payload,
  headers: { authorization: `Bearer ${jwt}` },
}
```

When `jwt` is empty (service elevation via `asService()`),
use the service role key in the `apikey` header instead.

Function name from env: `AWS_LAMBDA_FUNCTION_NAME` (self).

### buildRestProxy(jwt)

Minimal HTTP client targeting the stack's API URL
(from env `API_URL`). Provides a chainable interface:

```javascript
function buildRestProxy(jwt) {
  return {
    from(table) {
      return {
        async select(columns = '*') {
          const url = `${process.env.API_URL}/rest/v1/${table}?select=${columns}`;
          const res = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${jwt}`,
              'apikey': process.env.ANON_KEY,
            },
          });
          return res.json();
        },
      };
    },
  };
}
```

This is a minimal implementation for the initial release.
Full PostgREST query builder methods (insert, update,
delete, filters) can be added later.

### getServiceRolePool()

Creates a DSQL connection pool using `DsqlSigner` with the
service_role credentials. Same pattern as `getCallerPool`
in ctx.mjs but always uses service_role regardless of
caller.

## Acceptance Criteria

- All `functions-runtime-boa-client.test.mjs` tests pass
- directInvoke correctly self-invokes the Lambda
- asService() returns a fresh client without caller JWT
- Service pool is singleton (reused across calls)
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If `@aws-sdk/client-lambda` is not already available in
  the project's dependencies, add it to the appropriate
  package.json. The design assumes Lambda SDK is available
  in the runtime environment.
