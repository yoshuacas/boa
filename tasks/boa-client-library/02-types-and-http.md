# Task 02: Types and HTTP Layer

**Agent:** implementer
**Design:** docs/design/boa-client-library.md

## Objective

Implement the shared TypeScript types and the internal fetch
wrapper that all modules depend on.

## Target Tests

From `client/tests/http.test.ts`:
- Sets `apikey` header on every request.
- Sets `Authorization: Bearer` when access token exists.
- Sets `Content-Type: application/json` on POST/PATCH.
- Omits `Content-Type` on GET/DELETE without body.
- Custom headers from client options are included.
- Parses PostgREST error format
  `{ code, message, details, hint }`.
- Parses GoTrue error format
  `{ error, error_description }`.
- Handles network failures with
  `"Network request failed"`.
- On 401, attempts token refresh then replays request.
- On 401 with failed refresh, returns original error.
- Does not retry non-401 errors.
- Does not retry more than once per request.

## Implementation

### client/src/types.ts

Create all shared types exactly as specified in the design:

- `BoaClientOptions` (persistSession, headers)
- `Session` (access_token, refresh_token, expires_in, user)
- `User` (id, email, role, raw?)
- `BoaError` (message, status?, code?, details?, hint?)
- `AuthEvent` union type
- `AuthListener` callback type
- `QueryResult<T>`, `SingleResult<T>`, `AuthResult`
- `StorageUploadResult`, `StorageDownloadResult`

### client/src/http.ts

Create the `HttpClient` class with:

**Constructor:**
- `url` (string): base API URL (trailing slash stripped)
- `anonKey` (string): sent as `apikey` header
- `customHeaders` (Record<string, string>): extra headers

**Token provider interface:**
- `setTokenProvider(provider)`: accepts an object with
  `getAccessToken(): string | null`,
  `refresh(): Promise<boolean>`, and
  `onSignOut(): void` methods. This is how BoaAuth wires
  into the HTTP layer.

**request<T>(options) method:**
- `method`: GET | POST | PATCH | DELETE
- `path`: appended to base URL
- `body?`: serialized as JSON
- `headers?`: merged with defaults
- `parseJson?`: default true

**Header logic (every request):**
1. `apikey: <anonKey>` -- always
2. `Authorization: Bearer <token>` -- when token provider
   returns an access token
3. `Content-Type: application/json` -- on POST/PATCH when
   body is present
4. Custom headers from constructor
5. Per-request headers from `options.headers`

**Error parsing:**
- If body has `{ code, message, details, hint }` (PostgREST):
  map to BoaError with all fields plus `status`.
- If body has `{ error, error_description }` (GoTrue): map
  `error_description` to `BoaError.message`.
- If body cannot be parsed: use HTTP status text as message.
- On fetch throw: `{ message: 'Network request failed' }`.

**401 retry logic:**
1. On HTTP 401, if token provider has a refresh token:
   call `provider.refresh()`.
2. If refresh succeeds: replay the original request with
   the new access token. Return the replayed response.
3. If refresh fails: call `provider.onSignOut()` and return
   the original 401 error.
4. Track a `_retried` flag per request to prevent infinite
   loops -- only retry once.

**Return type:** `HttpResponse<T>` with `data`, `error`,
`status`, and `headers`.

## Test Requirements

No additional tests beyond what Task 01 defines. The
http.test.ts tests from Task 01 are the target.

## Acceptance Criteria

- All `http.test.ts` tests pass.
- `types.ts` exports all interfaces and types from the
  design.
- Zero runtime dependencies (uses `globalThis.fetch`).
- Existing tests (if any) still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the stub files from Task 01 already implement logic
  beyond stubs, escalate.
