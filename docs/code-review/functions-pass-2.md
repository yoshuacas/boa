# Code Review: Functions (Pass 2)

Re-review after fix commits 228147a (failing tests) and 8e681ec
(production fixes). Verifying all 11 original findings are
genuinely resolved and checking for new issues.

## Verdict

All 11 original findings are fixed correctly. No new bugs
introduced by the fixes. Test assertions are appropriately
strict -- reverting any fix would cause test failures.

## Finding-by-Finding Verification

### 1. handler.mjs uses buildStubCtx instead of real buildCtx

**Status: Fixed.**

`handler.mjs` now imports `buildCtx` from `./ctx.mjs` (line 4)
and calls it at line 72 with a `ctxOpts` dependency-injection
point (`deps.ctxOpts`). `buildStubCtx` is removed entirely.

Test `handler passes real ctx with JWT role and userId from
Bearer token` (routing test line 198) constructs a valid JWT,
passes it through the handler via `ctxOpts: { jwtSecret }`, and
asserts `ctx.role === 'authenticated'` and
`ctx.userId === 'user-123'`. If `buildCtx` were replaced with a
stub, this test would fail because the stub wouldn't parse the
JWT.

**Regression safety:** Strong. The test creates a real HS256 JWT
and asserts on the extracted claims.

---

### 2. packageFunctions crashes with -Infinity when empty

**Status: Fixed.**

`package.mjs` lines 117-122 use a ternary:
`descriptors.length > 0 ? Math.max(...) : 30` (and 256 for
memory).

Test `empty descriptors returns sane defaults not -Infinity`
asserts `maxTimeout === 30` and `maxMemory === 256`. Removing
the ternary guard would produce -Infinity and fail.

**Regression safety:** Strong.

---

### 3. packageArtifacts duplicates discovery logic

**Status: Fixed.**

`deploy.mjs` line 587 now calls `discover(functionsDir)` instead
of reimplementing the walk. The duplicated inline walk is gone.

Test `packageArtifacts rejects invalid function name via discover
validation` passes a directory with name `My_Func` and asserts
the error message includes "Invalid function name" -- proving
discover's validation runs. Previously the duplicated code would
have silently accepted it.

**Regression safety:** Strong.

---

### 4. invokeFn sends wrong shape for private functions

**Status: Fixed.**

`cli/commands/functions.mjs` lines 78-91: when
`fnConfig.visibility === 'private'`, the payload is now:
```javascript
{ _boaInternal: { name }, payload: body, headers: { apikey } }
```

Test `--service on a private function sends direct-invoke shape
with _boaInternal` asserts `payload._boaInternal` is
`{ name: 'cleanup' }`.

**Regression safety:** Strong. The assertion checks the exact
structure.

---

### 5. logsFn shell injection via unescaped function name

**Status: Fixed.**

`logsFn` now calls `shellEscape(name)` (imported from
`aws.mjs`) to wrap the function name in single quotes with
proper escaping. The `_exec` injection point allows testing
without spawning a shell.

Test `logsFn shell-escapes the function name in filter-pattern`
asserts the command string contains `'hello-world'` (single-
quoted). `shellEscape` wraps in single quotes and escapes
embedded quotes via `'\\''`.

**Regression safety:** Adequate. The test checks for
single-quote wrapping on a clean input. A test with an embedded
single-quote in the name would be stronger, but naming
validation prevents such names from reaching this code in
practice.

---

### 6. discover.mjs validates _internal by pattern not reserved list

**Status: Fixed.**

`discover.mjs` lines 18-23: the `RESERVED_NAMES.includes(name)`
check now comes before the `NAME_PATTERN.test(name)` check. So
`_internal` hits the "Reserved function name" error, not the
"Invalid function name" error.

Test `rejects _internal by reserved name check (not pattern
check)` asserts the exact message: `"Reserved function name
'_internal'"`. If the order were reversed, the error would say
"Invalid function name" and the test would fail.

**Regression safety:** Strong. The assertion is specific to the
reserved-name error path.

---

### 7. Timing-insensitive JWT signature comparison

**Status: Fixed.**

`ctx.mjs` line 1 imports `timingSafeEqual` from `node:crypto`.
Lines 13-16 convert both expected and actual signatures to
Buffers, check length equality, then call `timingSafeEqual`.

Tests `JWT with signature differing at first byte is rejected`
and `JWT with signature differing at last byte is rejected`
verify functional correctness. Timing safety cannot be unit-
tested but the use of `crypto.timingSafeEqual` is correct by
construction.

**Regression safety:** Adequate (functional correctness covered;
timing safety is a code-level property).

---

### 8. deploy-functions test assertion always-true (|| true)

**Status: Fixed.**

`deploy-functions.test.mjs` line 140-143: the assertion is now:
```javascript
assert.ok(s3Uploads.length > 0, 'should still upload zip...')
```

The `|| true` is removed. If `deployFunctions` stopped uploading
for empty registries, this test would fail.

**Regression safety:** Strong.

---

### 9. boa-client.mjs directInvoke field mismatch (body vs payload)

**Status: Fixed.**

`boa-client.mjs` line 28: the invoke payload now sends
`payload` (not `body`):
```javascript
{ _boaInternal: { name }, payload, headers: ... }
```

This matches `handler.mjs` line 26:
`if (event._boaInternal) return event.payload || {}`.

Test `directInvoke payload arrives intact through handler
parseBody` performs a full roundtrip: builds a `boaClient`,
calls `client.functions.invoke('target', { id: 42 })`, the mock
`lambdaInvoke` feeds the payload directly into `handler()`, and
the target function receives `req.body` which is asserted as
`{ id: 42 }`. If the field name mismatched, `req.body` would be
`{}` and the test would fail.

**Regression safety:** Very strong. This is an end-to-end
roundtrip test.

---

### 10. parseArgs boolean flag consumes next positional

**Status: Fixed.**

`cli/commands/functions.mjs` lines 136-157: `parseArgs` now uses
a `VALUE_FLAGS` allow-list (`Set(['data'])`). Only flags in this
set consume the next argument as a value. All other flags
(including future unknown flags) are treated as booleans.

Tests:
- `boolean flag --service does not consume next positional`:
  `parseArgs(['--service', 'hello'])` -> flags.service=true,
  positional=['hello']
- `unknown flag without value does not consume next positional`:
  `parseArgs(['--verbose', 'hello'])` -> flags.verbose=true,
  positional=['hello']

**Regression safety:** Strong. Both tests would fail if the old
generic-consume behavior returned.

---

### 11. JWT expiration not checked

**Status: Fixed.**

`ctx.mjs` lines 39-42: after successful signature verification,
the code checks `claims.exp` against the current time. Expired
tokens leave the user as `anon`.

Test `expired JWT falls back to anon` creates a JWT with
`exp` set one hour in the past, and asserts
`ctx.role === 'anon'` and `ctx.userId === ''`.

**Regression safety:** Strong.

---

### Bonus: Invalid visibility validation (from fix commit)

`discover.mjs` lines 46-49 now reject visibility values that
aren't 'public' or 'private'. Test `rejects invalid visibility
value` passes `"internal"` and asserts the error mentions
"visibility".

## New Issues

None found. The fixes are clean, targeted, and don't introduce
new concerns:

- No new dependencies added.
- Dependency injection (`ctxOpts`, `_exec`, `VALUE_FLAGS`) is
  done cleanly without over-engineering.
- The `shellEscape` function is well-implemented (single-quote
  wrapping with `'\''` escaping) and already used consistently
  throughout `aws.mjs`.
- The `timingSafeEqual` usage correctly handles the
  variable-length comparison by converting to Buffers and
  checking length equality first.
- The `discover()` call in `packageArtifacts` now means both
  code paths (deploy and package) share identical validation,
  eliminating the drift risk.

## Minor Observations (Not Bugs)

1. **Test gap: private function invoke without --service.**
   `invokeFn` sends direct-invoke shape for all private function
   invocations (regardless of `service` flag), but only the
   `--service` case is tested. The non-service case would still
   work correctly but isn't explicitly covered. Low risk since
   the branching condition is `fnConfig.visibility === 'private'`
   not `service === true`.

2. **Logger output in tests.** The error-throwing handler tests
   produce structured JSON log output to stdout during test runs
   (visible in test output). This is cosmetic -- the logs come
   from `ctx.logger.error` in the catch block, which is correct
   behavior. Could be suppressed with a test-mode logger but not
   worth the complexity.
