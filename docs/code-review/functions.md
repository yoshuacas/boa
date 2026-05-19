# Code Review: functions

## Correctness

### handler.mjs uses buildStubCtx instead of the real buildCtx

**File:** `cli/lib/functions/runtime/handler.mjs` (line 89)

The handler always creates a `buildStubCtx(functionName)` which
returns hardcoded `role: 'anon'`, `userId: ''`, no `db`, and no
`boa` client. The real `buildCtx` from `ctx.mjs` (which does JWT
extraction, lazy pool creation, and builds the boa client) is
never imported or called. This means in production the user
handler will always see `ctx.role === 'anon'` regardless of what
credentials are passed.

The test file `functions-runtime-routing.test.mjs` exercises the
handler but never asserts on `ctx.role` or `ctx.userId` values
passed to user handlers, so this bug is invisible to the test
suite.

**Proposed test:**

> Given a public function and an API Gateway event with a valid
> Bearer JWT containing `sub: 'user-123'` and `role: 'authenticated'`
> When the handler dispatches to the user function
> Then `ctx.role` is `'authenticated'` and `ctx.userId` is `'user-123'`

**Test location:** `cli/__tests__/functions-runtime-routing.test.mjs`
**Function:** `test_handler_passes_real_ctx_with_jwt_role`

---

### packageFunctions crashes with -Infinity when descriptors is empty

**File:** `cli/lib/functions/package.mjs` (lines 117-118)

When `descriptors` is an empty array, `Math.max(...[].map(...))` returns
`-Infinity`. The deploy test `empty functions/ directory still deploys
Lambda with empty registry` calls `deployFunctions` which calls
`packageFunctions([])`, and the returned `maxTimeout` and `maxMemory`
are `-Infinity`. This could cascade into nonsensical comparisons in
`deployFunctions` when checking `deployedConfig.maxTimeout !== maxTimeout`.

**Proposed test:**

> Given an empty descriptors array
> When packageFunctions is called
> Then maxTimeout is a sensible default (e.g., 30) and maxMemory
> is a sensible default (e.g., 256), not -Infinity

**Test location:** `cli/__tests__/functions-package.test.mjs`
**Function:** `test_empty_descriptors_returns_sane_defaults`

---

### packageArtifacts duplicates discovery logic instead of using discover()

**File:** `cli/lib/deploy.mjs` (lines 584-611)

`packageArtifacts` manually walks `functions/`, checks for `index.mjs`,
parses `boa.json`, and builds descriptors -- duplicating the logic in
`discover.mjs`. Critically, it skips all validation: no name pattern
check, no reserved name check, no timeout/memory bounds check. A
function named `My_Func` or `v1` would be silently packaged and
deployed through this path.

**Proposed test:**

> Given a functions/ directory containing a directory named `v1`
> with an index.mjs
> When packageArtifacts is called (non-test mode)
> Then it rejects with a reserved name error

**Test location:** `cli/__tests__/deploy-functions.test.mjs`
**Function:** `test_packageArtifacts_rejects_reserved_names`

---

### invokeFn sends API Gateway shaped event to private functions

**File:** `cli/commands/functions.mjs` (lines 71-79)

The `invokeFn` CLI command always constructs an API Gateway-shaped
payload with `httpMethod: 'POST'` and `path: /functions/v1/<name>`.
For private functions, the handler checks
`fnConfig.visibility === 'private' && !isDirectInvoke` -- since
there's no `_boaInternal` field, the handler will return 404.

The design says `boa functions invoke --service` should work for
private functions, but the current implementation will always get
404 for private functions because it sends an HTTP event shape
rather than a direct-invoke shape.

**Proposed test:**

> Given a private function 'cleanup' in the deployed registry
> When `boa functions invoke cleanup --service` is called
> Then the invoke payload includes `_boaInternal: { name: 'cleanup' }`
> so the handler dispatches it correctly

**Test location:** `cli/__tests__/functions-cli-invoke.test.mjs`
**Function:** `test_invoke_private_function_uses_direct_invoke_shape`

---

### logsFn constructs filter-pattern with unescaped user input

**File:** `cli/commands/functions.mjs` (lines 93-94)

The function name is interpolated directly into a shell command:
```javascript
const filterPattern = `{ $.function = "${name}" }`;
const cmd = `aws logs tail "${logGroup}" --filter-pattern '${filterPattern}' ...`;
```

If a function name contains a single quote (not possible with
current naming rules, but defense-in-depth), or if the naming
validation is bypassed, this is a shell injection vector.
While current naming rules (`[a-z][a-z0-9-]{0,62}`) prevent
exploitation, there's no explicit validation in `logsFn` itself.

**Proposed test:**

> Given a function name that passes naming validation
> When logsFn is called
> Then the constructed shell command properly quotes the function
> name (no injection possible)

**Test location:** `cli/__tests__/functions-cli-invoke.test.mjs`
**Function:** `test_logs_command_escapes_function_name`

---

### discover.mjs validates `_internal` by pattern not by reserved list

**File:** `cli/lib/functions/discover.mjs` (lines 18-23 vs 24-27)

The test `rejects reserved name _internal` passes, but only because
`_internal` fails the `NAME_PATTERN` regex (`^[a-z][a-z0-9-]{0,62}$`)
since it starts with `_`. If `_internal` is meant to be a reserved
name (it's in the `RESERVED_NAMES` array), the test doesn't actually
exercise the reserved-name check -- it hits the invalid-name check
first. The error message will say "Invalid function name" rather
than "Reserved function name".

This is a minor correctness issue with the test expectation: the
test asserts `err.message.includes('_internal')` which passes for
both error types, hiding which validation path actually triggered.

**Proposed test:**

> Given a function named `_internal`
> When discover is called
> Then the error message specifically says "Invalid function name"
> (not "Reserved function name") because `_` fails the pattern first

**Test location:** `cli/__tests__/functions-discover.test.mjs`
**Function:** `test_internal_rejected_by_pattern_not_reserved_list`

---

### Timing-insensitive JWT signature comparison

**File:** `cli/lib/functions/runtime/ctx.mjs` (line 12)

The JWT signature verification uses a simple string comparison
(`expected !== sigB64`) which is not constant-time. This makes
the verification theoretically vulnerable to timing attacks. In
practice, Lambda's network latency likely masks this, but it's
a deviation from cryptographic best practice.

**Proposed test:**

> Given two JWTs with signatures differing at the first byte vs
> the last byte
> When verifyHs256 is called
> Then both reject (functional correctness; timing cannot be
> tested in unit tests but should be noted for audit)

**Test location:** `cli/__tests__/functions-runtime-ctx.test.mjs`
**Function:** `test_jwt_verification_rejects_tampered_signatures`

Note: This is speculative in terms of real-world exploitability
on Lambda, but the fix (using `crypto.timingSafeEqual`) is
trivial and eliminates the concern.

## Sustainability

### Duplicated function discovery logic in deploy.mjs

**File:** `cli/lib/deploy.mjs` (lines 584-611)

The `packageArtifacts` function reimplements function discovery
inline rather than calling the existing `discover()` function.
This creates a maintenance burden: any change to discovery logic
(new validation rules, new config fields, different defaults)
must be synchronized in two places.

The `discover` import is already at the top of the file (line 10)
and is used in `deployFunctions`. The duplication in
`packageArtifacts` appears to be a workaround for test mode but
should call `discover()` in both paths.

**Proposed test (coupling boundary):**

> Given a function with memory: 2048 (above max)
> When packageArtifacts is called in non-test mode
> Then it rejects with a validation error (proving it uses
> discover's validation)

**Test location:** `cli/__tests__/deploy-functions.test.mjs`
**Function:** `test_packageArtifacts_validates_via_discover`

---

### handler.mjs imports ctx.mjs but never uses it

**File:** `cli/lib/functions/runtime/handler.mjs`

The handler defines its own `buildStubCtx` but the real `ctx.mjs`
is in the same directory. When this is fixed (see Correctness
finding above), the import structure will be clean, but currently
the co-located `ctx.mjs` appears to be dead code in the runtime
from the handler's perspective.

---

### parseArgs in functions.mjs is fragile for future flags

**File:** `cli/commands/functions.mjs` (lines 122-144)

The custom argument parser has a generic `--<flag>` handler that
always consumes the next argument as a value. A boolean-only flag
added later (e.g., `--verbose`) would accidentally consume the
next positional argument as its value. The `--service` and
`--tail` flags are special-cased, but the generic path is a
footgun for future development.

## Idiomatic Usage

### Custom ZIP implementation instead of using archiver or yazl

**File:** `cli/lib/functions/package.mjs` (lines 26-91)

The implementation includes a hand-rolled ZIP builder. While this
avoids a dependency, the ZIP format is complex (e.g., ZIP64 for
files > 4GB, proper timestamp handling, symlink support). The
current implementation sets all timestamps to zero, which is good
for determinism but means the zip entries have invalid dates.

For a CLI tool that already depends on `@aws-sdk/client-lambda`,
`cli-table3`, `listr2`, etc., using `yazl` (4KB, zero deps,
deterministic mode) would be more idiomatic and handle edge cases
the custom implementation may miss.

However, the choice is defensible for reproducibility and to avoid
npm supply chain risk. No action needed unless zip edge cases
appear in practice.

---

### Module-level side effects in handler.mjs

**File:** `cli/lib/functions/runtime/handler.mjs` (lines 7-14)

The registry is loaded synchronously at module load via
`readFileSync`. In Lambda, this runs once per cold start and is
cached -- idiomatic for Lambda. No issue here; the pattern
matches AWS Lambda best practices.

---

### Singleton Lambda SDK client in boa-client.mjs

**File:** `cli/lib/functions/runtime/boa-client.mjs` (lines 1-13)

The `_lambdaClient` module-level singleton is a standard Lambda
pattern for SDK client reuse across warm invocations. Idiomatic.

## Test Quality

### Missing: handler.mjs never tested with real buildCtx integration

The `functions-runtime-routing.test.mjs` tests pass a mock
`handlers` map, which means `buildStubCtx` is always used. No
test verifies that the actual `ctx` object (with JWT parsing,
lazy pool, boa client) reaches the user handler. This is the
most critical gap in the test suite.

**Proposed test:**

> Given a public function and an API GW event with
> `Authorization: Bearer <valid-jwt>` where the JWT has
> `sub: 'user-456'` and `role: 'authenticated'`
> When the runtime handler dispatches to the user function
> Then the user function receives ctx with role='authenticated',
> userId='user-456', a functioning ctx.db getter, and ctx.boa

**Test location:** `cli/__tests__/functions-runtime-routing.test.mjs`
**Function:** `test_handler_integrates_real_ctx_builder`

---

### Missing: deploy-functions.test.mjs assertion is always-true

**File:** `cli/__tests__/deploy-functions.test.mjs` (lines 130-136)

```javascript
assert.ok(
  s3Uploads.length > 0 || true,
  'should still deploy (even empty registry)'
);
```

The `|| true` makes this assertion always pass regardless of
`s3Uploads.length`. This test provides zero signal about the
empty-functions behavior.

**Proposed test:**

> Given an empty functions/ directory
> When deployFunctions is called
> Then it should either upload a zip with an empty registry
> OR skip the upload entirely (pick one and assert firmly)

**Test location:** `cli/__tests__/deploy-functions.test.mjs`
**Function:** `test_empty_functions_still_uploads_empty_registry`

---

### Missing: boa-client.mjs directInvoke uses wrong payload field

**File:** `cli/lib/functions/runtime/boa-client.mjs` (line 29)

The `directInvoke` function sends `{ _boaInternal: { name }, body: payload, headers: ... }` but `handler.mjs`'s `parseBody`
reads `event.payload` (line 25: `if (event._boaInternal) return event.payload || {}`). The field name mismatch means the
payload from `ctx.boa.functions.invoke('other', { id: 1 })` will
always arrive as an empty object `{}` in the target function.

**Proposed test:**

> Given function A calls `ctx.boa.functions.invoke('B', { id: 42 })`
> When function B's handler receives `req`
> Then `req.body` is `{ id: 42 }` (not `{}`)

**Test location:** `cli/__tests__/functions-runtime-boa-client.test.mjs`
**Function:** `test_direct_invoke_payload_reaches_target_handler`

---

### Missing: verify checks do not test visibility config drift

**Proposed test:**

> Given a function 'hello' locally has visibility: 'private' but
> deployed registry shows visibility: 'public'
> When verifyFunctions is called
> Then it reports configuration drift (visibility mismatch)

**Test location:** `cli/__tests__/verify-functions.test.mjs`
**Function:** `test_verify_reports_visibility_drift`

---

### Missing: discover.mjs rejects invalid visibility value

No test covers what happens when `boa.json` has
`"visibility": "internal"` (typo or invalid value). The code
accepts any string silently.

**Proposed test:**

> Given a function with `boa.json` containing
> `"visibility": "internal"`
> When discover is called
> Then it rejects with an error specifying valid values are
> "public" or "private"

**Test location:** `cli/__tests__/functions-discover.test.mjs`
**Function:** `test_discover_rejects_invalid_visibility`

---

### Missing: JWT expiration is not checked

**File:** `cli/lib/functions/runtime/ctx.mjs`

The `verifyHs256` function checks the signature but does not
validate `exp` (expiration). An expired JWT with a valid
signature will be accepted as `authenticated`.

**Proposed test:**

> Given a JWT with valid signature but `exp` in the past
> When buildCtx extracts auth
> Then ctx.role falls back to 'anon' (expired token rejected)

**Test location:** `cli/__tests__/functions-runtime-ctx.test.mjs`
**Function:** `test_expired_jwt_falls_back_to_anon`

## Test Harness Gaps

### Missing: integration between handler.mjs and ctx.mjs

**Needed by:** `test_handler_passes_real_ctx_with_jwt_role`,
`test_handler_integrates_real_ctx_builder`
**Description:** The routing tests pass `{ registry, handlers }`
as deps but there is no way to inject ctx-builder options
(jwtSecret, anonKey, serviceRoleKey) into the handler. The
handler currently hardcodes `buildStubCtx`. To test the full
integration, the handler needs to accept a `ctxOpts` parameter
in its `deps` argument, or the tests need to mock the module
import of `ctx.mjs`.

---

### Missing: test helper for building valid JWTs

**Needed by:** `test_handler_passes_real_ctx_with_jwt_role`,
any future integration test that sends JWTs through the handler
**Description:** The `functions-runtime-ctx.test.mjs` file
defines a local `makeJwtSync` helper, but it's not shared with
other test files. Extract it into a shared test helper (e.g.,
`cli/__tests__/helpers/jwt.mjs`) so the routing tests can also
construct valid JWTs.

---

### Missing: end-to-end roundtrip for boa.functions.invoke

**Needed by:** `test_direct_invoke_payload_reaches_target_handler`
**Description:** Currently `functions-runtime-boa-client.test.mjs`
mocks `lambdaInvoke` and asserts on the outbound payload, but
never feeds that payload back through `handler()` to verify the
full roundtrip. A test helper that wires `buildBoaClient`'s
`lambdaInvoke` mock to call `handler()` with the invoke payload
would catch the `body` vs `payload` field mismatch.

## Documentation

### plugin/docs/FUNCTIONS.md references ctx.db.query but pool is a stub

The documentation shows:
```javascript
const { rows } = await ctx.db.query('SELECT * FROM todos');
```

But the actual `getCallerPool` in `ctx.mjs` (line 87-91) returns
a stub object with a no-op `query()` that returns nothing. This
is clearly placeholder code, but the documentation implies it
works. The docs should note this is pending DSQL pool
implementation, or the pool should be implemented.

### AGENTS.md should reference the boa.json config schema

`plugin/AGENTS.md` points to `docs/FUNCTIONS.md` for handler/ctx/
routing/secrets, but doesn't mention the `boa.json` config
options (visibility, timeout, memory, env, secrets). Agents
looking for config reference may miss it.

### No .kiro/skills/ or .kiro/steering/ files found

No `.kiro/` directory exists in the repo, so no updates needed.
