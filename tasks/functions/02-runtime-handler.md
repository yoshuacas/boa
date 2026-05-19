# Task 02: Runtime Handler and Routing

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Create the FunctionsLambda entry point handler that reads the
bundled registry, routes requests by function name, enforces
visibility rules, and returns PostgREST-shaped error responses.

## Target Tests

From `functions-runtime-routing.test.mjs`:
- Public function via API Gateway -> handler invoked
- Private function via API Gateway with anon key -> 404
- Private function via API Gateway with service key -> 404
- Private function via direct invoke (_boaInternal) -> handler
  invoked
- Unknown function name -> 404 with PostgREST-shaped body
- Throwing handler -> 500, no secrets/JWT leaked
- Request normalization (req.method, path, query, headers, body)
- Direct invoke payload passed as req.body

## Implementation

### cli/lib/functions/runtime/handler.mjs

Create the Lambda entry point:

1. At module load, read `_registry.json` (bundled alongside
   in the zip) via `import` or `fs.readFileSync`.
2. Export `handler(event, context)`:
   - Determine invocation source:
     - If `event._boaInternal` exists: direct invoke. Read
       function name from `event._boaInternal.name`.
     - Otherwise: API Gateway. Extract function name from
       `event.path` after `/functions/v1/`.
   - Look up function in registry. If not found, return 404
     with PostgREST body.
   - If function is `private` and source is API Gateway (no
     `_boaInternal`), return 404.
   - Normalize the event into `req`:
     ```javascript
     const req = {
       method: event.httpMethod || event._boaInternal?.method || 'POST',
       path: event.path || '',
       query: event.queryStringParameters || {},
       headers: event.headers || {},
       body: parseBody(event),
     };
     ```
   - Build `ctx` via `buildCtx(event, registry, functionName)`
     (stub import for now -- ctx.mjs comes in Task 03).
   - Dynamically import the user's handler:
     `import(`./functions/${name}/index.mjs`)`.
   - Call `await fn.default(req, ctx)`.
   - Format the response:
     ```javascript
     return {
       statusCode: result.status || 200,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(result.body),
     };
     ```
   - Wrap in try/catch. On error:
     - Log full error + stack via `ctx.logger.error()`.
     - Return 500 with generic PostgREST body:
       ```json
       {
         "message": "Internal server error",
         "code": "PGRST500",
         "hint": null,
         "details": null
       }
       ```
     - Never include JWT, secrets, or stack trace in response.

### PostgREST error helper

Add a small helper in handler.mjs or a shared util:

```javascript
function pgrstError(status, message, code) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message, code, hint: null, details: null,
    }),
  };
}
```

Use `code: "PGRST116"` for 404s (matching PostgREST's "not
found" code) and `"PGRST500"` for 500s.

## Acceptance Criteria

- All `functions-runtime-routing.test.mjs` tests pass
- handler.mjs exports a named `handler` function
- Private functions are never callable via API Gateway path
- Error responses never contain JWT values or secret data
- Existing tests still pass

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If dynamic import of user functions fails in the test
  environment, adjust the import strategy (e.g., use a
  function loader that can be mocked in tests).
