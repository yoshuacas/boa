# Task 01: End-to-End Tests for BOA Functions

**Agent:** implementer
**Design:** docs/design/functions.md

## Objective

Create comprehensive unit test suites for the BOA Functions
feature covering the runtime (routing, context building,
boa-client), discovery, packaging, registry, CLI subcommands,
deploy integration, init scaffolding, and verify checks. All
tests should compile and fail with clear messages indicating
missing implementations.

## Test File Paths

Create the following test files under `cli/__tests__/`:

- `functions-discover.test.mjs`
- `functions-package.test.mjs`
- `functions-registry.test.mjs`
- `functions-runtime-routing.test.mjs`
- `functions-runtime-ctx.test.mjs`
- `functions-runtime-boa-client.test.mjs`
- `functions-cli-list.test.mjs`
- `functions-cli-invoke.test.mjs`
- `deploy-functions.test.mjs`
- `init-scaffolds-functions.test.mjs`
- `verify-functions.test.mjs`

Use Node.js built-in `node:test` and `node:assert`. Do not
add new test dependencies. The project uses `"type": "module"`.

## Test Cases

### functions-runtime-routing.test.mjs

Tests for `cli/lib/functions/runtime/handler.mjs`:

- Given an API Gateway event with path `/functions/v1/hello`
  and registry has `hello` as public, when handler is invoked,
  then the user's handler function is called and its response
  returned with correct statusCode and JSON body
- Given an API Gateway event with path `/functions/v1/hello`
  and registry has `hello` as private, when handler is invoked
  with anon key, then return 404 with PostgREST-shaped error
  body `{message, code: "PGRST116", hint: null, details: null}`
- Given an API Gateway event with path `/functions/v1/hello`
  and registry has `hello` as private, when handler is invoked
  with service role key, then still return 404 (private means
  no API Gateway access regardless of caller key)
- Given a direct invoke event with `_boaInternal: {name: "hello"}`
  and registry has `hello` as private, when handler is invoked,
  then the user's handler function is called successfully
- Given an API Gateway event with path `/functions/v1/unknown`
  and registry has no `unknown` entry, when handler is invoked,
  then return 404 with PostgREST-shaped error body
- Given the user's handler throws an error, when handler is
  invoked, then return 500 with generic PostgREST-shaped error
  body and the error is logged (stack trace not in response)
- Given the user's handler throws, when handler catches it,
  then the JWT and secret values are NOT included in the error
  response
- Given a public function via API Gateway, when handler
  dispatches, then `req` contains method, path, query, headers,
  and parsed body from the event
- Given a direct invoke event with `_boaInternal`, when handler
  dispatches, then the payload is passed to the user handler as
  `req.body`

### functions-runtime-ctx.test.mjs

Tests for `cli/lib/functions/runtime/ctx.mjs`:

Token table tests (one per row):

- Given no auth headers in event, when buildCtx is called,
  then `ctx.role` is `'anon'`, `ctx.userId` is `''`,
  `ctx.email` is `''`
- Given `Authorization: Bearer <valid user JWT>` with sub and
  email claims, when buildCtx is called, then `ctx.role` is
  `'authenticated'`, `ctx.userId` is the JWT sub, `ctx.email`
  is the JWT email
- Given `apikey: <anon key>` header only, when buildCtx is
  called, then `ctx.role` is `'anon'`, `ctx.userId` is `''`
- Given `apikey: <service role key>` header only, when buildCtx
  is called, then `ctx.role` is `'service_role'`, `ctx.userId`
  is `''`
- Given both `Authorization: Bearer <user JWT>` and
  `apikey: <service role key>`, when buildCtx is called, then
  `ctx.userId` comes from the JWT (JWT wins for identity),
  `ctx.role` is `'service_role'` (service key elevates)
- Given a malformed JWT in Authorization header, when buildCtx
  is called, then falls back to `ctx.role` = `'anon'` without
  throwing

Lazy pool tests:

- Given buildCtx returns ctx, when `ctx.db` is accessed for
  the first time, then a DSQL pool is created bound to the
  caller's role (assert DSQL signer invoked with expected role)
- Given buildCtx returns ctx, when `ctx.db` is never accessed,
  then no DSQL pool is created (lazy/cold-start friendly)

Security tests:

- Given a JWT with `role: service_role` but signed with wrong
  key, when buildCtx is called, then the JWT is rejected and
  role falls back to anon
- Given `ctx.role` is mutated mid-execution, when `ctx.db` was
  already accessed, then the pool's role binding does not change
  (role captured at pool creation)

Env/logger tests:

- Given a function entry in registry with env vars, when
  buildCtx is called, then `ctx.env` contains the merged env
  vars from the registry
- Given a function name, when buildCtx is called, then
  `ctx.logger` produces structured JSON logs with the function
  name field

### functions-runtime-boa-client.test.mjs

Tests for `cli/lib/functions/runtime/boa-client.mjs`:

- Given a caller JWT, when `ctx.boa.functions.invoke('other',
  payload)` is called, then the Lambda invoke payload includes
  `_boaInternal: true`, the target name, and the caller's JWT
  is forwarded
- Given `ctx.boa.asService()`, when
  `.functions.invoke('other', payload)` is called, then the
  invoke uses a service-role token instead of the caller's JWT
- Given a caller JWT, when `ctx.boa.rest.from('todos').select('*')`
  is called, then the HTTP request to the API URL includes
  the caller's JWT in the Authorization header
- Given `ctx.boa.db()` is called, when a query is executed,
  then it uses a service-role DSQL pool independent of
  `ctx.db`'s caller-scoped pool
- Given `ctx.boa.db()` is called multiple times, when pools
  are returned, then the same pool instance is reused

### functions-discover.test.mjs

Tests for `cli/lib/functions/discover.mjs`:

- Given `functions/hello/index.mjs` exists, when discover is
  called, then returns a descriptor with name `hello`,
  visibility `public` (default), timeout 30, memory 256
- Given `functions/hello/boa.json` with
  `{"visibility": "private", "timeout": 10, "memory": 512}`,
  when discover is called, then the descriptor reflects those
  overrides
- Given a directory `functions/My_Func/index.mjs`, when
  discover is called, then it rejects with error:
  `Invalid function name 'My_Func'. Function names must match [a-z][a-z0-9-]{0,62}.`
- Given a directory `functions/v1/index.mjs`, when discover is
  called, then it rejects with error:
  `Reserved function name 'v1'. Choose a different name.`
- Given a directory `functions/health/index.mjs`, when discover
  is called, then it rejects with reserved name error
- Given a directory `functions/_internal/index.mjs`, when
  discover is called, then it rejects with reserved name error
- Given `functions/broken/` exists but has no `index.mjs`,
  when discover is called, then it rejects with a clear error
  about missing entry point
- Given `functions/hello/boa.json` declares
  `"secrets": ["STRIPE_KEY"]` and SSM parameter does not exist,
  when discover is called with `validateSecrets: true`, then it
  rejects with error showing the expected SSM path
  `/<stack>/functions/hello/STRIPE_KEY` and the aws ssm
  put-parameter hint
- Given an empty `functions/` directory (no subdirectories),
  when discover is called, then it returns an empty array
- Given `functions/hello/boa.json` has `"timeout": 0` (below
  minimum), when discover is called, then it rejects with a
  validation error
- Given `functions/hello/boa.json` has `"memory": 2048` (above
  maximum), when discover is called, then it rejects with a
  validation error

### functions-package.test.mjs

Tests for `cli/lib/functions/package.mjs`:

- Given two discovered functions, when package is called, then
  the resulting zip contains `handler.mjs`, `ctx.mjs`,
  `boa-client.mjs`, `logger.mjs`, `_registry.json`,
  `functions/hello/index.mjs`, `functions/other/index.mjs`
- Given a function directory with `node_modules/`, when package
  is called, then `node_modules/` is excluded from the zip
- Given two functions with timeouts 10 and 25, when package
  computes shared config, then max timeout is 25
- Given two functions with memory 128 and 512, when package
  computes shared config, then max memory is 512
- Given the same set of functions unchanged, when package is
  called twice, then the zip hash is deterministic (same both
  times)
- Given a function with sibling files (e.g., `utils.mjs`
  alongside `index.mjs`), when package is called, then sibling
  files are included in the zip under the function's directory

### functions-registry.test.mjs

Tests for `cli/lib/functions/registry.mjs`:

- Given discovered functions `[{name: 'hello', visibility:
  'public', timeout: 30, memory: 256}, {name: 'cleanup',
  visibility: 'private', timeout: 10, memory: 128}]`, when
  buildRegistry is called, then the output JSON contains both
  entries with their visibility, timeout, and memory
- Given a function with a reserved name passes validation,
  when buildRegistry is called, then it also rejects the
  reserved name (defense in depth)
- Given private functions in the registry, when buildRegistry
  output is inspected, then they are present in the JSON
  (routing enforcement is in the runtime, not the registry)
- Given an empty function list, when buildRegistry is called,
  then it returns an empty JSON object `{}`

### functions-cli-list.test.mjs

Tests for `cli/commands/functions.mjs` (list subcommand):

- Given deployed registry has `hello` (public) and local
  `functions/` has `hello` and `new-func`, when `boa functions
  list` is called, then output shows `hello` as `deployed`,
  `new-func` as `local only`
- Given local and deployed registries match, when list is
  called, then exit code is 0
- Given local has a function not in deployed registry, when
  list is called, then exit code is non-zero and output
  includes `Run 'boa deploy' to sync local changes.`

### functions-cli-invoke.test.mjs

Tests for `cli/commands/functions.mjs` (invoke subcommand):

- Given function `hello` exists in deployed registry, when
  `boa functions invoke hello` is called, then Lambda is
  invoked with anon credentials by default
- Given `--service` flag, when invoke is called, then Lambda
  is invoked with service role key
- Given `--data '{"id": 1}'`, when invoke is called, then the
  payload is parsed and included in the invoke
- Given `--data 'invalid json{'`, when invoke is called, then
  it exits with error:
  `Error: Invalid JSON in --data: Unexpected token...`
- Given function name `nonexistent` not in registry, when
  invoke is called, then it exits with error:
  `Error: Unknown function 'nonexistent'. Available: hello, ...`

### deploy-functions.test.mjs

Tests for functions integration in `cli/commands/deploy.mjs`
and `cli/lib/deploy.mjs`:

- Given `functions/hello/index.mjs` exists, when `boa deploy`
  runs, then discover + package + upload occurs and
  `FunctionsLambdaS3Key` is passed to CloudFormation parameters
- Given the functions zip hash matches what's already in S3,
  when deploy runs, then upload is skipped (content-addressed)
- Given max timeout/memory changed vs. deployed config, when
  deploy runs, then a full CloudFormation stack update is
  triggered
- Given max timeout/memory unchanged and only function code
  changed, when deploy runs, then only
  `update-function-code` is called (no stack update)
- Given an empty `functions/` directory, when deploy runs,
  then Lambda is still deployed with an empty registry
  (returns 404 for all names)
- Given `packageArtifacts()` completes, when its return value
  is inspected, then it includes `functionsKey` alongside
  `bucket`, `lambdaKey`, `templateUrl`, `accountId`

### init-scaffolds-functions.test.mjs

Tests for functions scaffolding in `cli/commands/init.mjs`:

- Given `boa init` is run in a fresh directory, when init
  completes, then `functions/hello/index.mjs` exists with
  a default export handler returning status 200 and body with
  message, userId, role
- Given `boa init` is run, when init completes, then
  `functions/hello/boa.json` exists with
  `{"visibility": "public"}`
- Given `functions/` already exists, when `boa init` is run,
  then existing functions are not overwritten

### verify-functions.test.mjs

Tests for functions checks in `cli/commands/verify.mjs`:

- Given local `functions/` matches deployed registry, when
  `boa verify` runs, then functions checks pass
- Given local has function `new-func` not in deployed
  registry, when verify runs, then it reports drift:
  local function not deployed
- Given deployed registry has function `old-func` not in local
  `functions/`, when verify runs, then it reports drift:
  deployed function missing locally
- Given function `webhook` declares secret `STRIPE_KEY` and
  SSM parameter exists, when verify runs, then secret check
  passes
- Given function `webhook` declares secret `STRIPE_KEY` and
  SSM parameter does NOT exist, when verify runs, then it
  reports missing secret with path and remediation hint
- Given `/functions/v1/hello` responds with 200 or 401, when
  verify probes route reachability, then it passes
- Given `/functions/v1/hello` responds with 500 or times out,
  when verify probes route reachability, then it reports
  unreachable function

## Setup Notes

- Mock AWS SDK calls (`Lambda.invoke`, SSM `getParameter`,
  S3 `putObject`, CloudFormation operations) to avoid real
  AWS calls in unit tests.
- For runtime tests, create in-memory registry objects and
  mock user handler functions.
- For deploy tests, mock the filesystem for `functions/`
  discovery and mock all AWS API calls.
- For ctx tests, mock the DSQL signer and connection pool
  to verify role binding without a real database.
- Use `node:test`'s `mock` module for mocking imports.
- Test files should import from relative paths matching the
  planned module locations (e.g.,
  `../../lib/functions/discover.mjs`).

## Acceptance Criteria

- All test files compile without syntax errors
- All tests fail with clear messages indicating the module
  or function is missing (e.g., `Cannot find module...` or
  assertion failures on undefined values)
- No test should produce cryptic stack traces or hang

## Conflict Criteria

- If any test that is expected to fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps: investigate the code path, verify the assertion
  targets the right behavior, and attempt to rewrite the test
  to isolate the intended path. Only escalate if you cannot
  construct a well-formed test that targets the desired
  behavior.
