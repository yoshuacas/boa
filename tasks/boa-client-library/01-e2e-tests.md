# Task 01: End-to-End Tests for @boa-cloud/client

**Agent:** implementer
**Design:** docs/design/boa-client-library.md

## Objective

Create comprehensive unit and integration test suites for the
`@boa-cloud/client` library. All tests should compile and fail
with clear messages indicating missing implementations.

## Prerequisites

Create the project scaffolding first:

- `client/package.json` with the structure from the design
  (name: `@boa-cloud/client`, type: module, zero runtime
  deps, devDependencies: typescript ^5.4, tsx ^4.0).
- `client/tsconfig.json` with the settings from the design
  (target ES2022, module ESNext, strict, lib: ES2022 + DOM).

Then create the test files listed below.

## Test File Paths

- `client/tests/http.test.ts`
- `client/tests/query-builder.test.ts`
- `client/tests/auth.test.ts`
- `client/tests/integration.test.ts`

Use Node.js built-in `node:test` and `node:assert`. Run via
`node --import tsx --test tests/*.test.ts`. Do not add test
framework dependencies.

## Test Cases

### http.test.ts

Tests for the internal fetch wrapper. Mock `globalThis.fetch`
to intercept requests.

**Header injection:**
- Given a client with an anon key, when any request is made,
  then the `apikey` header is set to the anon key.
- Given a client with an active access token, when a request
  is made, then the `Authorization: Bearer <token>` header is
  set.
- Given a POST request with a body, when sent, then
  `Content-Type: application/json` is set.
- Given a PATCH request with a body, when sent, then
  `Content-Type: application/json` is set.
- Given a GET request, when sent, then `Content-Type` is not
  set.
- Given a DELETE request without a body, when sent, then
  `Content-Type` is not set.
- Given a client with custom headers `{ 'X-Custom': 'val' }`,
  when a request is made, then `X-Custom: val` is included.

**Error parsing:**
- Given a response with PostgREST error body
  `{ code, message, details, hint }`, when parsed, then the
  error object has all four fields.
- Given a response with GoTrue error body
  `{ error, error_description }`, when parsed, then
  `error_description` becomes `error.message`.
- Given a response with an unparseable body, when parsed,
  then the error message is the HTTP status text.
- Given a network failure (fetch throws), when a request is
  made, then the error message is
  `"Network request failed"`.

**401 retry:**
- Given a 401 response and a valid refresh token, when the
  request is retried, then the refresh endpoint
  `POST /auth/v1/token?grant_type=refresh_token` is called,
  and the original request is replayed with the new access
  token.
- Given a 401 response and a failed refresh, when retry is
  attempted, then the original 401 error is returned and
  `SIGNED_OUT` is fired.
- Given a 401 response, when retry succeeds, then only one
  retry is attempted (no infinite loop).
- Given a 403 response, when received, then no retry is
  attempted.

### query-builder.test.ts

Tests for URL construction, header building, and immutability.
These tests should NOT make real HTTP requests -- test the
URL and header output of the builder.

**Select and URL building:**
- `from('todos').select('*')` builds
  `GET /rest/v1/todos?select=*`.
- `from('todos').select('id,title')` builds
  `GET /rest/v1/todos?select=id,title`.

**Filter operators:**
- `.eq('status', 'active')` appends `status=eq.active`.
- `.neq('status', 'archived')` appends
  `status=neq.archived`.
- `.gt('age', 18)` appends `age=gt.18`.
- `.gte('age', 18)` appends `age=gte.18`.
- `.lt('price', 100)` appends `price=lt.100`.
- `.lte('price', 100)` appends `price=lte.100`.
- `.like('name', '*smith*')` appends `name=like.*smith*`.
- `.ilike('name', '*smith*')` appends `name=ilike.*smith*`.
- `.in('status', ['active', 'done'])` appends
  `status=in.(active,done)`.
- `.is('deleted_at', null)` appends `deleted_at=is.null`.
- `.not('id', 'eq', 'abc')` appends `id=not.eq.abc`.

**Modifiers:**
- `.order('created_at', { ascending: false })` appends
  `order=created_at.desc`.
- `.order('created_at')` defaults to ascending:
  `order=created_at.asc`.
- `.limit(10)` appends `limit=10`.
- `.range(0, 9)` appends `limit=10&offset=0`.
- `.range(20, 29)` appends `limit=10&offset=20`.
- `.single()` sets Accept header to
  `application/vnd.pgrst.object+json`.
- `.select('*', { count: 'exact' })` adds `count=exact`
  to Prefer header.

**Mutations:**
- `.insert({...})` builds `POST` with JSON body and
  `Prefer: return=representation`.
- `.update({...}).eq('id', 'abc')` builds `PATCH` with
  filters and body and `Prefer: return=representation`.
- `.delete().eq('id', 'abc')` builds `DELETE` with filters
  and no `Prefer: return=representation`.
- `.upsert({...}, { onConflict: 'id' })` builds `POST`
  with `on_conflict=id` and
  `Prefer: resolution=merge-duplicates,return=representation`.

**Single row error:**
- `.single()` on a query that returns zero or multiple
  rows results in an error (server returns HTTP 406 with
  code `PGRST116`).

**Immutability:**
- Chaining `.eq()` returns a new builder; the original is
  unchanged.
- Multiple filters chain: `.eq('a', 1).eq('b', 2)` produces
  `a=eq.1&b=eq.2`.

### auth.test.ts

Tests for the BoaAuth class. Mock the HTTP layer to
intercept requests and return controlled responses.

**signUp:**
- Given valid email and password, when `signUp` is called,
  then `POST /auth/v1/signup` is sent with
  `{ email, password }`.
- Given a successful response, when `signUp` completes,
  then tokens are stored and `SIGNED_IN` event is fired.
- Given a failure response, when `signUp` completes, then
  error is returned and no tokens are stored.

**signIn:**
- Given valid credentials, when `signIn` is called, then
  `POST /auth/v1/token?grant_type=password` is sent with
  `{ email, password }`.
- Given a successful response, when `signIn` completes,
  then tokens are stored and `SIGNED_IN` event is fired.
- Given an `invalid_grant` response, when `signIn`
  completes, then error.message is
  `"Invalid login credentials"`.

**getUser:**
- Given an active session, when `getUser()` is called, then
  it returns the user from the cached JWT without a network
  call.
- Given no session, when `getUser()` is called, then it
  returns `{ user: null, error: null }`.
- Given `{ fetch: true }`, when `getUser` is called, then
  `GET /auth/v1/user` is sent with the Bearer token.

**getSession:**
- Given an active session, when `getSession()` is called,
  then it returns the current session from memory.
- Given no session, when `getSession()` is called, then it
  returns `{ session: null, error: null }`.

**signOut:**
- When `signOut` is called, then tokens are cleared from
  memory, the refresh timer is cancelled, and `SIGNED_OUT`
  event is fired.
- When `signOut` is called and the server request fails,
  then it still clears tokens locally (best-effort logout).

**onAuthStateChange:**
- After `signIn`, listeners receive `SIGNED_IN` with the
  session.
- After `signOut`, listeners receive `SIGNED_OUT` with
  `null` session.
- After token refresh, listeners receive `TOKEN_REFRESHED`
  with the new session.
- After `unsubscribe()`, the listener stops receiving
  events.

**Auto-refresh:**
- After signIn, a timer is scheduled approximately 60
  seconds before the access token's `exp` claim.
- When auto-refresh fires and succeeds, `TOKEN_REFRESHED`
  is emitted.
- When auto-refresh fires and fails, `SIGNED_OUT` is
  emitted and tokens are cleared.

**JWT decoding:**
- Given a valid JWT, when the payload is decoded, then
  `exp`, `sub`, and `email` are extracted correctly.

**Session persistence (localStorage):**
- Given `persistSession: true`, when a session is set,
  then `localStorage.setItem('boa-auth', ...)` is called
  with the serialized session.
- Given `persistSession: true`, when the client is
  constructed and localStorage has a valid session, then
  the session is restored.
- Given `persistSession: true`, when `signOut` is called,
  then `localStorage.removeItem('boa-auth')` is called.
- Given an environment where localStorage throws, when
  persistence is attempted, then the error is caught
  silently (SSR safe).

> Warning: Auth tests that mock the HTTP layer should
> verify the mock is called with correct paths and
> headers, not just that the response shape is correct.
> A response with the right shape could come from a
> hardcoded fallback.

### integration.test.ts

These tests run against the live BOA backend at
`https://dm2yob87lihft.cloudfront.net` using the anon key
from `boa-cars-test/.boa/config.json`. They exercise the
full client through CloudFront to pgrest-lambda.

Mark these tests to be skipped by default (use
`{ skip: !process.env.BOA_INTEGRATION }` or similar) so
unit tests can run without a live backend.

**Auth flow:**
- Sign up a new user with a unique email (use timestamp
  suffix). Verify `user` and `session` are returned.
- Verify `getUser()` returns the signed-in user.
- Sign out. Verify `getUser()` returns null.
- Sign back in with the same credentials. Verify session
  tokens are valid.

> Warning: Integration tests create real Cognito users.
> Use unique emails per test run. There is no automated
> cleanup.

**Token refresh:**
- Sign in. Manually expire the access token (set internal
  state). Make a data request. Verify the 401 retry
  triggers refresh and the request succeeds.

> Warning: This test manipulates internal client state to
> simulate expiry. It does not test actual JWT expiry.

**Data CRUD (cars table):**
- Sign in as a test user.
- Insert a car: `{ make: 'Test', model: 'Car', year: 2024,
  color: 'blue' }`.
- Select all cars, verify the inserted car appears.
- Update the car's color to 'red'.
- Select the car by id, verify color is 'red'.
- Delete the car.
- Select all cars, verify it is gone.

**Filters and ordering:**
- Insert 3 cars with different years.
- `.order('year', { ascending: true })` -- verify order.
- `.eq('year', 2024)` -- verify filter.
- `.gt('year', 2022)` -- verify range filter.
- `.in('year', [2023, 2024])` -- verify in filter.
- Clean up: delete test cars.

**Count:**
- Insert 3 cars.
- `.select('*', { count: 'exact' })` -- verify `count`
  equals the number of user's rows.
- Clean up.

**Storage (if upload/download endpoints are deployed):**
- `createUploadUrl({ filename: 'test.txt',
  contentType: 'text/plain' })`.
- Verify `uploadUrl` and `key` are returned.
- Upload a small text file to the presigned URL.
- `createDownloadUrl(key)`.
- Verify `downloadUrl` is returned.
- Fetch the download URL, verify content matches.

> Warning: The storage upload response from the server
> includes `{ uploadUrl, key, expiresIn, maxSizeBytes,
> message }`. The client maps this to
> `{ uploadUrl, key, error }`. Verify the client correctly
> extracts `key`.

**OpenAPI spec:**
- `client.api.getSpec()` returns the OpenAPI 3.0 JSON
  spec. Verify `spec` is a non-null object with an
  `openapi` field.

**Client validation:**
- `createClient('', anonKey)` throws or returns error
  `"url is required"`.
- `createClient(url, '')` throws or returns error
  `"anonKey is required"`.
- `createClient(url + '/', anonKey)` strips the trailing
  slash (subsequent requests use the clean URL).

**Error handling:**
- `.from('nonexistent_table').select('*')` -- verify
  error with code `PGRST205`.
- `signIn` with wrong password -- verify error message.

## Stub Modules

Create minimal stub source files so the test files can
import without errors. Each stub should export the expected
API surface but throw `"not implemented"` when called:

- `client/src/index.ts` -- `createClient` function stub
- `client/src/client.ts` -- `BoaClient` class stub
- `client/src/auth.ts` -- `BoaAuth` class stub
- `client/src/query-builder.ts` -- `QueryBuilder` class stub
- `client/src/storage.ts` -- `BoaStorage` class stub
- `client/src/api.ts` -- `BoaApi` class stub
- `client/src/http.ts` -- `HttpClient` class stub
- `client/src/types.ts` -- all type/interface exports

## Acceptance Criteria

- `client/package.json` and `client/tsconfig.json` exist.
- All test files are syntactically valid TypeScript.
- All tests compile (no import errors from stubs).
- All tests fail with clear assertion messages.
- No test panics or produces cryptic stack traces.
- Integration tests are skipped by default.

## Conflict Criteria

- If any test that should fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps in the implementer prompt: investigate the code
  path, verify the assertion targets the right behavior,
  and attempt to rewrite the test to isolate the intended
  path. Only escalate if you cannot construct a well-formed
  test that targets the desired behavior.
