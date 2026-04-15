# Task 04: Auth Module

**Agent:** implementer
**Design:** docs/design/boa-client-library.md
**Depends on:** Task 02

## Objective

Implement the BoaAuth class with sign-up, sign-in, sign-out,
session management, auth state listeners, JWT decoding,
auto-refresh, and optional localStorage persistence.

## Target Tests

From `client/tests/auth.test.ts`:
- `signUp` calls `POST /auth/v1/signup` with email/password.
- `signUp` stores tokens and fires `SIGNED_IN` on success.
- `signUp` returns error on failure without storing tokens.
- `signIn` calls
  `POST /auth/v1/token?grant_type=password`.
- `signIn` stores tokens and fires `SIGNED_IN` on success.
- `signIn` returns error with message from
  `error_description`.
- `getUser()` returns user from cached token without
  network call.
- `getUser()` returns `null` when no session exists.
- `getUser({ fetch: true })` calls `GET /auth/v1/user`.
- `getSession()` returns current session from memory.
- `getSession()` returns `{ session: null, error: null }`
  when no session.
- `signOut` clears tokens, cancels refresh timer, fires
  `SIGNED_OUT`.
- `signOut` succeeds locally even if server request fails.
- `onAuthStateChange` receives `SIGNED_IN` after signIn.
- `onAuthStateChange` receives `SIGNED_OUT` after signOut.
- `onAuthStateChange` receives `TOKEN_REFRESHED` after
  refresh.
- `unsubscribe` stops delivering events.
- Auto-refresh schedules timer ~60s before expiry.
- Auto-refresh fires `TOKEN_REFRESHED` on success.
- Auto-refresh fires `SIGNED_OUT` on failure.
- JWT payload decoding extracts `exp`, `sub`, `email`.
- `persistSession: true` writes to localStorage on session
  change.
- `persistSession: true` reads from localStorage on
  construction.
- `persistSession: true` clears localStorage on signOut.
- localStorage errors are caught silently (SSR safe).

## Implementation

### client/src/auth.ts

Create the `BoaAuth` class.

**Constructor:**
- `http: HttpClient` reference
- `persistSession: boolean`

**Internal state:**
- `_session: Session | null`
- `_listeners: Set<AuthListener>`
- `_refreshTimer: ReturnType<typeof setTimeout> | null`

**Token provider interface:**
BoaAuth acts as the token provider for HttpClient. After
construction, wire it via `http.setTokenProvider(this)` so
the HTTP layer can read the current access token and trigger
refresh on 401.

Implement:
- `getAccessToken(): string | null` -- returns
  `_session?.access_token ?? null`.
- `refresh(): Promise<boolean>` -- calls the refresh
  endpoint, updates session, returns success/failure.
- `onSignOut(): void` -- clears session, fires
  `SIGNED_OUT`.

**Public methods:**

`signUp({ email, password }): Promise<AuthResult>`
1. POST `/auth/v1/signup` with `{ email, password }`.
2. On success: parse response, build Session and User,
   call `_setSession(session)`.
3. On error: return `{ user: null, session: null, error }`.

`signIn({ email, password }): Promise<AuthResult>`
1. POST `/auth/v1/token?grant_type=password` with
   `{ email, password }`.
2. Same success/error handling as signUp.

`getUser(options?): Promise<{ user, error }>`
- Default: decode JWT payload from `_session.access_token`
  to extract `{ id: sub, email, role }`. No network call.
- `{ fetch: true }`: GET `/auth/v1/user` with Bearer token.
  Normalize server response to `User` shape. Full server
  response available as `user.raw`.
- No session: return `{ user: null, error: null }`.

`getSession(): Promise<{ session, error }>`
- Return `_session` from memory. No network call.

`signOut(): Promise<{ error }>`
1. POST `/auth/v1/logout` (best-effort, ignore errors).
2. Call `_clearSession()`.
3. Return `{ error: null }`.

`onAuthStateChange(listener): { unsubscribe }`
- Add listener to `_listeners`.
- Return `{ unsubscribe: () => _listeners.delete(listener) }`.

**Private methods:**

`_setSession(session):`
1. Store `_session`.
2. Notify listeners with appropriate event.
3. Schedule auto-refresh.
4. If `persistSession`: write to localStorage.

`_clearSession():`
1. Set `_session = null`.
2. Cancel `_refreshTimer`.
3. Notify listeners with `SIGNED_OUT`.
4. If `persistSession`: remove from localStorage.

`_scheduleRefresh():`
1. Cancel existing timer.
2. Decode `exp` from access token.
3. Calculate `delay = (exp - now - 60) * 1000`.
4. If `delay <= 0`: refresh immediately.
5. Else: `setTimeout(_doRefresh, delay)`.

`_doRefresh():`
1. POST `/auth/v1/token?grant_type=refresh_token` with
   `{ refresh_token: _session.refresh_token }`.
2. On success: `_setSession(newSession)`, notify
   `TOKEN_REFRESHED`.
3. On failure: `_clearSession()`.

`_decodeJwtPayload(token): object`
- Split token on `.`, take second segment.
- Base64url decode: replace `-` with `+`, `_` with `/`,
  pad with `=`.
- Use `atob()` in browsers, `Buffer.from(s, 'base64')`
  in Node.js. Try `atob` first, fall back to Buffer.
- Parse JSON.

**Session persistence (when `persistSession: true`):**
- localStorage key: `boa-auth` (design specifies this;
  Open Question 4 about URL hashing is deferred).
- On `_setSession`: `localStorage.setItem('boa-auth',
  JSON.stringify({ access_token, refresh_token,
  expires_at }))`.
- On construction: read from localStorage. If access token
  is valid, restore session and start auto-refresh. If
  access token is expired but refresh token is valid,
  trigger immediate refresh. If both expired, clear.
- On `_clearSession`: `localStorage.removeItem('boa-auth')`.
- Wrap all localStorage calls in try/catch for SSR safety.

## Acceptance Criteria

- All `auth.test.ts` tests pass.
- BoaAuth integrates with HttpClient as a token provider.
- Auto-refresh timer is correctly scheduled.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the HttpClient `setTokenProvider` API from Task 02
  differs from what is described, adapt to match the actual
  API.
