# @boa-cloud/client Library

## Overview

A purpose-built JavaScript/TypeScript client library for BOA
backends. `@boa-cloud/client` replaces `@supabase/supabase-js`
as the recommended client for BOA projects. It talks directly
to the pgrest-lambda API (PostgREST-compatible REST +
GoTrue-compatible auth) and handles token management, CORS,
and storage internally.

**Why not keep using `@supabase/supabase-js`?**
`@supabase/supabase-js` v2 works with BOA but carries
Supabase-specific assumptions -- Realtime channels,
Supabase-hosted URL patterns, GoTrue v2 session management
via localStorage, and `X-Client-Info` telemetry headers --
that add friction with BOA backends. Specific issues:

- CORS preflight complexity: supabase-js sends headers
  (`X-Client-Info`, `X-Supabase-Api-Version`) that must be
  forwarded through CloudFront origin request policies even
  though BOA ignores them.
- Token refresh edge cases: supabase-js uses localStorage by
  default and has its own internal refresh timer that can
  conflict with BOA's JWT expiry model.
- Bundle weight: supabase-js v2 ships ~45KB gzipped including
  Realtime, Storage, and Functions modules that BOA does not
  use.
- `global` polyfill: supabase-js requires
  `define: { global: 'globalThis' }` in Vite config due to
  transitive Cognito SDK assumptions.

A purpose-built client is smaller (target: core < 8KB
gzipped), simpler (zero runtime dependencies), and works
perfectly with CloudFront + Lambda Function URLs out of the
box.

**Repository location:** `client/` directory in the boa
monorepo. Package name: `@boa-cloud/client`. Pure ESM. Zero
runtime dependencies. TypeScript source, ships `.mjs` + `.d.ts`.

## Current CX / Concepts

### How developers use BOA today

After `boa init`, the developer has a `.boa/config.json`
with `apiUrl` (CloudFront domain) and `anonKey`. They install
`@supabase/supabase-js` and initialize a client:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://dm2yob87lihft.cloudfront.net',
  'eyJhbGciOiJIUzI1NiIs...'
)
```

Auth operations (`signUp`, `signInWithPassword`, `getUser`,
`signOut`) and data operations (`from().select()`,
`from().insert()`, `from().update()`, `from().delete()`) work
against the pgrest-lambda endpoints. The `boa-cars-test` app
(`boa-cars-test/app/`) demonstrates the full pattern.

### API surface used in practice

From the boa-cars-test app (`boa-cars-test/app/src/`):

**Auth** (`components/Auth.vue`):
```javascript
await supabase.auth.signUp({ email, password })
const { data, error } = await supabase.auth
  .signInWithPassword({ email, password })
const { data } = await supabase.auth.getUser()
await supabase.auth.signOut()
```

**Data** (`App.vue`):
```javascript
const { data, error } = await supabase
  .from('cars')
  .select('*')
  .order('created_at', { ascending: false })

await supabase.from('cars')
  .insert({ ...carData, user_id: user.value.id })

await supabase.from('cars')
  .update(carData)
  .eq('id', editingCar.value.id)

await supabase.from('cars')
  .delete()
  .eq('id', car.id)
```

All operations return `{ data, error }` where `error` has a
`.message` property.

### BOA backend endpoints

pgrest-lambda provides these endpoints:

| Path | Method | Purpose |
|------|--------|---------|
| `/rest/v1/{table}` | GET | List/filter rows |
| `/rest/v1/{table}` | POST | Insert rows |
| `/rest/v1/{table}` | PATCH | Update rows |
| `/rest/v1/{table}` | DELETE | Delete rows |
| `/rest/v1/` | GET | OpenAPI 3.0 spec |
| `/rest/v1/_refresh` | POST | Refresh schema cache |
| `/rest/v1/_docs` | GET | Interactive API docs |
| `/auth/v1/signup` | POST | Create account |
| `/auth/v1/token?grant_type=password` | POST | Sign in |
| `/auth/v1/token?grant_type=refresh_token` | POST | Refresh |
| `/auth/v1/user` | GET | Current user |
| `/auth/v1/logout` | POST | Sign out |
| `/upload` | POST | Presigned upload URL |
| `/download?key=...` | GET | Presigned download URL |

### Authentication model

BOA uses pgrest-lambda which mints its own JWTs (HS256,
issuer `pgrest-lambda`) backed by Cognito as the identity
provider. Token structure:

- **Access token** (1h): `{ sub, email, role, aud, iss, iat,
  exp }` where `role` is `"authenticated"` and `iss` is
  `"pgrest-lambda"`.
- **Refresh token** (30d): `{ sub, role, prt, iss, iat, exp }`
  where `prt` embeds the Cognito refresh token and `iss` is
  `"pgrest-lambda"`.
- **Anon key** (10y): `{ role: "anon", iss: "pgrest-lambda",
  iat, exp }`. Sent as the `apikey` header on every request.

Every request requires an `apikey` header (the anon key).
Authenticated requests also include
`Authorization: Bearer <access_token>`.

### CloudFront architecture

All client traffic flows through CloudFront:

```
Client App
    |
CloudFront + WAF (DDoS, rate limiting, edge cache)
    |
Lambda Function URL (origin secret header validation)
    |
pgrest-lambda (JWT validation, CORS, routing)
```

CloudFront adds `x-origin-verify` header via
`OriginCustomHeaders`. The Lambda handler rejects requests
without the correct secret value. Direct Function URL access
is blocked.

CORS is handled by pgrest-lambda in the Lambda response.
CloudFront passes response headers through to the viewer.

## Proposed CX / CX Specification

### Installation

```bash
npm install @boa-cloud/client
```

### Initialization

```typescript
import { createClient } from '@boa-cloud/client'

const boa = createClient(
  'https://your-api.cloudfront.net',
  'your-anon-key'
)
```

**Parameters:**
- `url` (string, required): The API URL from
  `.boa/config.json`. Must be an HTTPS URL. Trailing slash
  is stripped.
- `anonKey` (string, required): The anon key from
  `.boa/config.json`.
- `options` (object, optional):
  - `persistSession` (boolean, default `false`): When `true`,
    stores tokens in `localStorage` under key `boa-auth`.
    When `false`, tokens are held in memory only and lost on
    page reload.
  - `headers` (Record<string, string>, optional): Additional
    headers to include on every request.

**Validation rules:**
- `url` must be a non-empty string. Error:
  `"url is required"`
- `anonKey` must be a non-empty string. Error:
  `"anonKey is required"`

### Auth

#### signUp

```typescript
const { user, session, error } = await boa.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePass1'
})
```

**Request:** `POST /auth/v1/signup`
```json
{ "email": "user@example.com", "password": "SecurePass1" }
```

**On success:** Returns `{ user, session, error: null }`.
The session contains `access_token`, `refresh_token`, and
`expires_in`. Tokens are stored (memory or localStorage per
`persistSession`). Auth state listeners are notified with
`SIGNED_IN`. Auto-refresh timer is started.

**On error:** Returns `{ user: null, session: null, error }`.
Error object has `message` (string) and optionally `status`
(number).

| Server error | Client error.message |
|-------------|----------------------|
| `validation_failed` (missing email) | `"Email is required"` |
| `validation_failed` (missing password) | `"Password is required"` |
| `validation_failed` (invalid format) | `"Invalid email format"` |
| `weak_password` | `"Password must be at least 8 characters and include uppercase, lowercase, and numbers"` |
| `user_already_exists` | `"User already registered"` |
| `unexpected_failure` | `"An unexpected error occurred"` |

#### signIn

```typescript
const { user, session, error } = await boa.auth.signIn({
  email: 'user@example.com',
  password: 'SecurePass1'
})
```

**Request:** `POST /auth/v1/token?grant_type=password`
```json
{ "email": "user@example.com", "password": "SecurePass1" }
```

**On success:** Same shape as signUp. Tokens stored,
`SIGNED_IN` event fired, auto-refresh started.

**On error:**
| Server error | Client error.message |
|-------------|----------------------|
| `invalid_grant` | `"Invalid login credentials"` |
| `validation_failed` | Passthrough of `error_description` |

#### getUser

```typescript
const { user, error } = await boa.auth.getUser()
```

**Behavior:** If a valid access token exists in memory,
decodes the JWT locally and returns the user object from
claims (`{ id, email, role }`). If no token exists, returns
`{ user: null, error: null }`.

Optionally fetches from the server to get the canonical user
object:

```typescript
const { user, error } = await boa.auth.getUser({
  fetch: true
})
```

**Request (when `fetch: true`):** `GET /auth/v1/user` with
`Authorization: Bearer <access_token>`.

**User object shape:**
```typescript
{
  id: string       // UUID (from JWT sub claim)
  email: string    // from JWT email claim
  role: string     // 'authenticated'
}
```

When `fetch: true`, the server returns a richer object
including `app_metadata`, `user_metadata`, and `created_at`.
The client normalizes both local and server responses to
the same `User` shape (id, email, role) for consistency.
The full server response is available as `user.raw` if
needed.

#### onAuthStateChange

```typescript
const { unsubscribe } = boa.auth.onAuthStateChange(
  (event, session) => {
    // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
    console.log(event, session)
  }
)

// Later: unsubscribe()
```

**Events:**
- `SIGNED_IN`: After successful signUp or signIn. Session
  contains tokens.
- `SIGNED_OUT`: After signOut, or when token refresh fails.
  Session is `null`.
- `TOKEN_REFRESHED`: After successful automatic or manual
  token refresh. Session contains new tokens.

Returns `{ unsubscribe: () => void }`. Calling `unsubscribe`
removes the listener.

#### signOut

```typescript
const { error } = await boa.auth.signOut()
```

**Request:** `POST /auth/v1/logout`

**Behavior:** Clears tokens from memory (and localStorage if
`persistSession` is enabled). Cancels the auto-refresh timer.
Fires `SIGNED_OUT` event. Always succeeds locally even if
the server request fails (server-side logout is best-effort
in BOA -- JWTs expire naturally).

#### getSession

```typescript
const { session, error } = await boa.auth.getSession()
```

**Behavior:** Returns the current session from memory (or
localStorage). Session contains `access_token`,
`refresh_token`, `expires_in`, and `user`. Returns
`{ session: null, error: null }` if no session exists. Does
not make a network request. Does not trigger token refresh.

### Token Management

- Access token (1h) stored in memory. Sent as
  `Authorization: Bearer` header on data/storage requests.
- Refresh token (30d) stored in memory. Used to auto-refresh
  before expiry.
- Anon key sent as `apikey` header on every request.
- Auto-refresh runs via `setTimeout` approximately 60 seconds
  before access token expiry. The expiry time is decoded from
  the JWT `exp` claim using `atob` (browsers) or
  `Buffer.from` (Node.js) -- no `crypto.subtle` needed for
  simple base64 JWT payload decoding.
- On refresh failure (network error or invalid refresh token),
  the client fires `SIGNED_OUT` and clears all tokens.
- When `persistSession: true`, tokens are stored in
  `localStorage` under key `boa-auth` as a JSON string:
  `{ access_token, refresh_token, expires_at }`. On client
  creation, tokens are loaded from localStorage and
  auto-refresh is started if the access token is still valid.
  If the access token is expired but the refresh token is
  still valid, an immediate refresh is attempted.

**Token refresh request:**
`POST /auth/v1/token?grant_type=refresh_token`
```json
{ "refresh_token": "<refresh_token>" }
```

### Data (REST)

#### from

```typescript
boa.from('todos')
```

Returns a `QueryBuilder` scoped to the given table. No
network call is made.

#### select

```typescript
const { data, error, count } = await boa
  .from('todos')
  .select('*', { count: 'exact' })
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .range(0, 9)
```

**Request:** `GET /rest/v1/todos?select=*&completed=eq.false&order=created_at.desc&limit=10&offset=0`
**Headers:**
```
apikey: <anon-key>
Authorization: Bearer <access-token>
Prefer: count=exact
```

**Response parsing:**
- Body is a bare JSON array.
- `data` is the parsed array.
- `count` is parsed from `Content-Range` header (e.g.,
  `0-9/42` -> `count: 42`). `null` if count was not
  requested.
- `error` is `null` on success.

#### insert

```typescript
const { data, error } = await boa
  .from('todos')
  .insert({ title: 'Buy milk', user_id: userId })
```

**Request:** `POST /rest/v1/todos`
```json
{"title": "Buy milk", "user_id": "abc-123"}
```
**Headers:**
```
Content-Type: application/json
Prefer: return=representation
apikey: <anon-key>
Authorization: Bearer <access-token>
```

**Array insert:**
```typescript
const { data, error } = await boa
  .from('todos')
  .insert([
    { title: 'Buy milk' },
    { title: 'Walk dog' }
  ])
```

Body is sent as-is (object or array). pgrest-lambda accepts
both.

#### update

```typescript
const { data, error } = await boa
  .from('todos')
  .update({ completed: true })
  .eq('id', todoId)
```

**Request:** `PATCH /rest/v1/todos?id=eq.abc-123`
```json
{"completed": true}
```
**Headers:** Same as insert (includes
`Prefer: return=representation`).

#### delete

```typescript
const { error } = await boa
  .from('todos')
  .delete()
  .eq('id', todoId)
```

**Request:** `DELETE /rest/v1/todos?id=eq.abc-123`
**Headers:**
```
apikey: <anon-key>
Authorization: Bearer <access-token>
```

Note: `Prefer: return=representation` is not sent on delete
by default (matching supabase-js behavior where delete does
not return data unless `.select()` is chained).

#### upsert

```typescript
const { data, error } = await boa
  .from('todos')
  .upsert(
    { id: todoId, title: 'Updated' },
    { onConflict: 'id' }
  )
```

**Request:** `POST /rest/v1/todos?on_conflict=id`
**Headers:**
```
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
apikey: <anon-key>
Authorization: Bearer <access-token>
```

#### Resource embedding (joins)

```typescript
const { data } = await boa
  .from('games')
  .select('*, game_stats(goals, assists, players(name))')
```

The `select` string is passed as-is in the `?select=` query
parameter. pgrest-lambda handles the join resolution using
`_id` column naming conventions.

#### single

```typescript
const { data, error } = await boa
  .from('todos')
  .select('*')
  .eq('id', todoId)
  .single()
```

**Request header:** `Accept: application/vnd.pgrst.object+json`

Returns a single object instead of an array. If zero or more
than one row matches, the server returns HTTP 406 with
PGRST116, and the client returns it as an error.

#### Filter operators

All filter methods return a new `QueryBuilder` (immutable
chaining). Each method appends a PostgREST filter to the
query string.

| Method | PostgREST parameter | Example |
|--------|-------------------|---------|
| `.eq(col, val)` | `col=eq.val` | `?status=eq.active` |
| `.neq(col, val)` | `col=neq.val` | `?status=neq.deleted` |
| `.gt(col, val)` | `col=gt.val` | `?age=gt.18` |
| `.gte(col, val)` | `col=gte.val` | `?age=gte.18` |
| `.lt(col, val)` | `col=lt.val` | `?price=lt.100` |
| `.lte(col, val)` | `col=lte.val` | `?price=lte.100` |
| `.like(col, pat)` | `col=like.pat` | `?name=like.*smith*` |
| `.ilike(col, pat)` | `col=ilike.pat` | `?name=ilike.*smith*` |
| `.in(col, vals)` | `col=in.(v1,v2)` | `?status=in.(active,done)` |
| `.is(col, val)` | `col=is.val` | `?deleted_at=is.null` |
| `.not(col, op, val)` | `col=not.op.val` | `?id=not.eq.abc` |

#### Modifiers

| Method | PostgREST parameter |
|--------|-------------------|
| `.order(col, { ascending })` | `order=col.desc` (or `.asc`) |
| `.limit(n)` | `limit=n` |
| `.range(from, to)` | `limit=to-from+1&offset=from` |
| `.single()` | `Accept: application/vnd.pgrst.object+json` |

### Storage

#### createUploadUrl

```typescript
const { key, uploadUrl, error } = await boa.storage
  .createUploadUrl({
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
  })
```

**Request:** `POST /upload`
```json
{ "filename": "photo.jpg", "contentType": "image/jpeg" }
```
**Headers:**
```
Content-Type: application/json
apikey: <anon-key>
Authorization: Bearer <access-token>
```

**Response mapping:**
- Server returns `{ uploadUrl, key, expiresIn, maxSizeBytes,
  message }`.
- Client returns `{ uploadUrl, key, error: null }`.
  (`expiresIn`, `maxSizeBytes`, and `message` are not
  exposed in the client result -- they are informational
  server responses.)

After receiving the URL, the developer uploads directly to S3:
```typescript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,
})
```

**Validation:**
- Server validates `contentType` against an allowlist
  (`image/jpeg`, `image/png`, `image/gif`, `image/webp`,
  `application/pdf`, `text/plain`, `text/csv`,
  `application/json`). Invalid types return HTTP 400.
- Max file size: 10 MB (enforced by presigned URL conditions).

#### createDownloadUrl

```typescript
const { downloadUrl, error } = await boa.storage
  .createDownloadUrl('uploads/user-id/abc-photo.jpg')
```

**Request:**
`GET /download?key=uploads%2Fuser-id%2Fabc-photo.jpg`
**Headers:**
```
apikey: <anon-key>
Authorization: Bearer <access-token>
```

**Response mapping:**
- Server returns `{ downloadUrl }`.
- Client returns `{ downloadUrl, error: null }`.

The server validates that the file key belongs to the
authenticated user (`key` must start with
`uploads/{userId}/`). Access denied returns HTTP 403.

### OpenAPI

```typescript
const { spec, error } = await boa.api.getSpec()
```

**Request:** `GET /rest/v1/`
**Response:** The full OpenAPI 3.0 JSON spec describing all
tables, columns, and operations.

### Error Object

All methods return errors in a consistent shape:

```typescript
interface BoaError {
  message: string    // Human-readable error description
  status?: number    // HTTP status code (when from server)
  code?: string      // PostgREST error code (e.g. 'PGRST204')
  details?: string   // Additional context
  hint?: string      // Suggested fix
}
```

**PostgREST errors** (from data operations) map the server's
`{ code, message, details, hint }` format directly.

**Auth errors** map the server's
`{ error, error_description }` format: `error_description`
becomes `message`.

**Network errors** (fetch failures) produce
`{ message: 'Network request failed' }` with no status code.

## Technical Design

### Module Structure

```
client/src/
  index.ts          -- createClient factory, re-exports
  client.ts         -- BoaClient class
  auth.ts           -- BoaAuth class (token lifecycle)
  query-builder.ts  -- QueryBuilder (chainable, immutable)
  storage.ts        -- BoaStorage (presigned URLs)
  http.ts           -- fetch wrapper (headers, retry)
  types.ts          -- shared TypeScript types
  ui/
    index.ts        -- UI entry point
    auth.ts         -- <boa-auth> web component
    user-menu.ts    -- <boa-user-menu> web component
```

### types.ts

```typescript
export interface BoaClientOptions {
  persistSession?: boolean
  headers?: Record<string, string>
}

export interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export interface User {
  id: string
  email: string
  role: string
  raw?: Record<string, unknown>  // full server response
}

export interface BoaError {
  message: string
  status?: number
  code?: string
  details?: string
  hint?: string
}

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'

export type AuthListener = (
  event: AuthEvent,
  session: Session | null
) => void

export interface QueryResult<T> {
  data: T[] | null
  error: BoaError | null
  count: number | null
}

export interface SingleResult<T> {
  data: T | null
  error: BoaError | null
}

export interface AuthResult {
  user: User | null
  session: Session | null
  error: BoaError | null
}

export interface StorageUploadResult {
  key: string | null
  uploadUrl: string | null
  error: BoaError | null
}

export interface StorageDownloadResult {
  downloadUrl: string | null
  error: BoaError | null
}
```

### http.ts -- Fetch Wrapper

A single internal function that all modules use for HTTP
requests. Handles header injection, error parsing, and 401
retry.

```typescript
type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method: HttpMethod
  path: string
  body?: unknown
  headers?: Record<string, string>
  parseJson?: boolean  // default true
}

interface HttpResponse<T> {
  data: T | null
  error: BoaError | null
  status: number
  headers: Headers
}
```

**Header logic (applied to every request):**

1. `apikey: <anonKey>` -- always present.
2. `Authorization: Bearer <access_token>` -- when an access
   token is available in the auth module.
3. `Content-Type: application/json` -- on POST, PATCH (when
   body is present).
4. Any custom headers from `options.headers` on the client.

**401 retry logic:**

When a response returns HTTP 401 and the auth module has a
refresh token:
1. Attempt token refresh
   (`POST /auth/v1/token?grant_type=refresh_token`).
2. If refresh succeeds, replay the original request with the
   new access token.
3. If refresh fails, fire `SIGNED_OUT` event and return the
   original 401 error.
4. Only retry once per request to prevent infinite loops.

**Error parsing:**

- If the response body has `{ code, message, details, hint }`
  (PostgREST format), map to `BoaError`.
- If the response body has `{ error, error_description }`
  (GoTrue format), map `error_description` to
  `BoaError.message`.
- If the body cannot be parsed, use the HTTP status text as
  the error message.

### client.ts -- BoaClient

```typescript
export class BoaClient {
  readonly auth: BoaAuth
  readonly storage: BoaStorage
  readonly api: BoaApi

  constructor(url: string, anonKey: string,
              options?: BoaClientOptions)

  from<T = any>(table: string): QueryBuilder<T>
}
```

The constructor:
1. Validates `url` and `anonKey` are non-empty strings.
2. Strips trailing slash from `url`.
3. Creates an internal `HttpClient` with the url, anonKey,
   and custom headers.
4. Creates `BoaAuth` with a reference to the HttpClient and
   the `persistSession` option.
5. Creates `BoaStorage` with a reference to the HttpClient.
6. Creates `BoaApi` with a reference to the HttpClient.
7. Wires `BoaAuth` as the token provider for `HttpClient`
   (so `HttpClient` can read the current access token and
   trigger refresh).

### auth.ts -- BoaAuth

```typescript
export class BoaAuth {
  signUp(credentials: { email: string; password: string }):
    Promise<AuthResult>

  signIn(credentials: { email: string; password: string }):
    Promise<AuthResult>

  getUser(options?: { fetch?: boolean }):
    Promise<{ user: User | null; error: BoaError | null }>

  getSession():
    Promise<{ session: Session | null;
              error: BoaError | null }>

  onAuthStateChange(listener: AuthListener):
    { unsubscribe: () => void }

  signOut():
    Promise<{ error: BoaError | null }>
}
```

**Internal state:**
- `_session: Session | null` -- current session.
- `_listeners: Set<AuthListener>` -- registered callbacks.
- `_refreshTimer: ReturnType<typeof setTimeout> | null` --
  auto-refresh timer handle.

**Auto-refresh logic:**
When a session is set (after signIn, signUp, or token
refresh), calculate `delay = (exp - now - 60) * 1000` where
`exp` is the access token's expiry timestamp decoded from
the JWT payload. Schedule `setTimeout(refresh, delay)`. If
`delay <= 0`, refresh immediately.

**JWT payload decoding:**
Parse the access token's payload (second segment,
base64url-decoded) to extract `exp`, `sub`, and `email`.
Use `atob()` in browsers and `Buffer.from(s, 'base64')`
in Node.js. This is not cryptographic verification -- just
payload extraction for expiry timing and user info. The
server performs full verification.

**Session persistence (when `persistSession: true`):**
- On session change: write
  `{ access_token, refresh_token, expires_at }` to
  `localStorage.setItem('boa-auth', JSON.stringify(...))`.
- On construction: read from `localStorage.getItem('boa-auth')`,
  parse, and restore session. If access token is expired
  but refresh token is not, trigger immediate refresh. If
  both are expired, clear storage.
- On signOut: `localStorage.removeItem('boa-auth')`.
- Guard all localStorage calls with try/catch for
  environments where localStorage is unavailable (SSR,
  Web Workers).

### query-builder.ts -- QueryBuilder

The query builder is immutable -- each method returns a new
instance with the added parameter. No network call is made
until the builder is awaited.

```typescript
export class QueryBuilder<T> {
  // Internal state (private, set via constructor)
  _table: string
  _method: HttpMethod      // default 'GET'
  _body: unknown | null
  _select: string | null
  _filters: string[]       // ['status=eq.active', ...]
  _order: string | null
  _limit: number | null
  _offset: number | null
  _count: 'exact' | null
  _single: boolean
  _onConflict: string | null
  _prefer: string[]        // ['return=representation', ...]
  _headers: Record<string, string>
}
```

**Immutability implementation:**
Each mutation method creates a shallow clone of the builder
with the new parameter applied:

```typescript
private _clone(overrides: Partial<QueryBuilder<T>>):
    QueryBuilder<T> {
  const clone = new QueryBuilder<T>(this._http, this._table)
  Object.assign(clone, this, overrides)
  return clone
}

eq(column: string, value: unknown): QueryBuilder<T> {
  return this._clone({
    _filters: [...this._filters,
                `${column}=eq.${value}`]
  })
}
```

**Method behavior:**

- `select(columns?, options?)`: Sets `_method` to `GET`,
  `_select` to columns string. If `options.count` is
  `'exact'`, adds `count=exact` to `_prefer` array.
- `insert(data)`: Sets `_method` to `POST`, `_body` to data,
  adds `return=representation` to `_prefer`.
- `update(data)`: Sets `_method` to `PATCH`, `_body` to data,
  adds `return=representation` to `_prefer`.
- `upsert(data, options?)`: Sets `_method` to `POST`, `_body`
  to data, `_onConflict` to `options.onConflict`, adds
  `resolution=merge-duplicates,return=representation` to
  `_prefer`.
- `delete()`: Sets `_method` to `DELETE`.
- Filter methods (`eq`, `neq`, etc.): Append to `_filters`.
- `order(col, opts)`: Sets `_order` to
  `col.desc` or `col.asc`.
- `limit(n)`: Sets `_limit`.
- `range(from, to)`: Sets `_limit` to `to - from + 1`,
  `_offset` to `from`.
- `single()`: Sets `_single` to `true`.

**URL construction (`_buildUrl`):**

1. Start with `/rest/v1/{table}`.
2. Build query string from: `select`, filters, `order`,
   `limit`, `offset`, `on_conflict`.
3. Filters are appended as separate query parameters
   (e.g., `&status=eq.active&completed=eq.false`).
4. For `.in()`, format value as `(v1,v2,v3)`.

**Request headers (`_buildHeaders`):**

1. If `_prefer` is non-empty, set
   `Prefer: return=representation` (or combined values).
2. If `_single` is true, set
   `Accept: application/vnd.pgrst.object+json`.
3. If `_count` is `'exact'`, add `count=exact` to Prefer.

**Execution (`then`):**

The `then` method makes `QueryBuilder` thenable (works with
`await`). It calls the internal `_execute` method which:
1. Builds the URL and headers.
2. Calls `HttpClient.request()`.
3. Parses the response.
4. For GET: parses `Content-Range` header for count.
5. Returns `{ data, error, count }`.

```typescript
then<TResult>(
  onfulfilled?: (value: QueryResult<T>) => TResult,
  onrejected?: (reason: any) => TResult
): Promise<TResult> {
  return this._execute().then(onfulfilled, onrejected)
}
```

### storage.ts -- BoaStorage

```typescript
export class BoaStorage {
  createUploadUrl(params: {
    filename: string
    contentType: string
  }): Promise<StorageUploadResult>

  createDownloadUrl(key: string):
    Promise<StorageDownloadResult>
}
```

**createUploadUrl:**
1. `POST /upload` with `{ filename, contentType }`.
2. Map response `{ uploadUrl, key, expiresIn, maxSizeBytes,
   message }` to `{ uploadUrl, key, error: null }`.

**createDownloadUrl:**
1. `GET /download?key=<encodeURIComponent(key)>`.
2. Map response `{ downloadUrl }` to
   `{ downloadUrl, error: null }`.

### api.ts -- BoaApi

```typescript
export class BoaApi {
  getSpec(): Promise<{ spec: object | null;
                       error: BoaError | null }>
}
```

**getSpec:**
1. `GET /rest/v1/`.
2. Returns the parsed JSON body as `spec`.

### index.ts -- Entry Point

```typescript
export { createClient } from './client.js'
export type {
  BoaClient,
  BoaClientOptions,
  Session,
  User,
  BoaError,
  AuthEvent,
  AuthListener,
  QueryResult,
  SingleResult,
  AuthResult,
  StorageUploadResult,
  StorageDownloadResult,
} from './types.js'

export function createClient(
  url: string,
  anonKey: string,
  options?: BoaClientOptions
): BoaClient {
  return new BoaClient(url, anonKey, options)
}
```

### Auth UI Components (`client/src/ui/`)

Ship as a separate entry point
`@boa-cloud/client/ui` (configured via package.json
`exports`). Framework-agnostic web components using Shadow
DOM.

#### `<boa-auth>` Web Component

```html
<boa-auth
  api-url="https://your-api.cloudfront.net"
  anon-key="your-anon-key"
></boa-auth>
```

**Attributes:**
- `api-url` (string, required): API URL.
- `anon-key` (string, required): Anon key.
- `client` (property only): An existing `BoaClient` instance
  to use instead of creating a new one.

**Behavior:**
1. If no `client` property is set, creates a `BoaClient` from
   `api-url` and `anon-key` attributes.
2. Renders a form with email and password fields.
3. Toggle between sign-in and sign-up modes via a link.
4. On submit:
   - Sign-in mode: calls `client.auth.signIn(...)`.
   - Sign-up mode: calls `client.auth.signUp(...)`.
5. On error: displays the error message below the form.
6. On success: fires `boa-auth-success` CustomEvent with
   `detail: { user, session }`.
7. On error: fires `boa-auth-error` CustomEvent with
   `detail: { error }`.

**Styling:**
- Shadow DOM for encapsulation.
- CSS custom properties for theming:
  - `--boa-font-family` (default: `system-ui, sans-serif`)
  - `--boa-primary-color` (default: `#2563eb`)
  - `--boa-error-color` (default: `#dc2626`)
  - `--boa-border-radius` (default: `6px`)
  - `--boa-input-border` (default: `#d1d5db`)
- Minimal default styling. No external CSS dependencies.
- Target: under 5KB gzipped for both UI components combined.

#### `<boa-user-menu>` Web Component

```html
<boa-user-menu></boa-user-menu>
```

**Attributes:**
- `client` (property only, required): A `BoaClient` instance.

**Behavior:**
1. Calls `client.auth.getUser()` on connect.
2. If signed in: shows the user's email and a "Sign out"
   button.
3. If not signed in: shows nothing (empty shadow root).
4. On sign out click: calls `client.auth.signOut()`.
5. Listens to `client.auth.onAuthStateChange` to update
   display reactively.

**Events:**
- `boa-signed-out` CustomEvent when sign out completes.

## Code Architecture / File Changes

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `client/src/index.ts` | `createClient` factory, re-exports | 20 |
| `client/src/client.ts` | `BoaClient` class | 40 |
| `client/src/auth.ts` | `BoaAuth` (token lifecycle, auth methods) | 200 |
| `client/src/query-builder.ts` | `QueryBuilder` (chainable, immutable) | 200 |
| `client/src/storage.ts` | `BoaStorage` (presigned URLs) | 40 |
| `client/src/http.ts` | Fetch wrapper (headers, 401 retry) | 100 |
| `client/src/types.ts` | Shared TypeScript types | 80 |
| `client/src/ui/index.ts` | UI entry point | 5 |
| `client/src/ui/auth.ts` | `<boa-auth>` web component | 200 |
| `client/src/ui/user-menu.ts` | `<boa-user-menu>` web component | 80 |
| `client/tests/query-builder.test.ts` | QueryBuilder unit tests | 200 |
| `client/tests/auth.test.ts` | Auth token management tests | 150 |
| `client/tests/http.test.ts` | HTTP wrapper tests | 100 |
| `client/tests/integration.test.ts` | Live backend integration tests | 200 |
| `client/package.json` | Package manifest | 40 |
| `client/tsconfig.json` | TypeScript config | 20 |
| `client/README.md` | Package documentation | 150 |

### No Modified Files

This is a new package in `client/`. No existing files are
modified. The `boa-cars-test` app can be migrated separately
as a validation exercise.

### package.json Structure

```json
{
  "name": "@boa-cloud/client",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    },
    "./ui": {
      "import": "./dist/ui/index.mjs",
      "types": "./dist/ui/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "node --import tsx --test tests/*.test.ts",
    "test:integration": "node --import tsx --test tests/integration.test.ts"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "tsx": "^4.0"
  }
}
```

Zero runtime dependencies. TypeScript is a dev dependency
only.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": false,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

`lib: ["DOM"]` is needed for `fetch`, `Headers`,
`localStorage`, `HTMLElement`, `CustomEvent`, and Shadow DOM
APIs. The library uses only standard web APIs that are also
available in Node.js 18+ (fetch, Headers) and Deno.

## Testing Strategy

### Unit Tests (node:test)

**query-builder.test.ts:**

- `from('todos').select('*')` builds
  `GET /rest/v1/todos?select=*`.
- `from('todos').select('id,title')` builds
  `GET /rest/v1/todos?select=id,title`.
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
- `.insert({...})` builds `POST` with body and
  `Prefer: return=representation`.
- `.update({...}).eq('id', 'abc')` builds `PATCH` with
  filters and body.
- `.delete().eq('id', 'abc')` builds `DELETE` with filters.
- `.upsert({...}, { onConflict: 'id' })` builds `POST`
  with `on_conflict=id` and
  `Prefer: resolution=merge-duplicates,return=representation`.
- Chaining is immutable: `.eq()` returns a new builder,
  original is unchanged.
- Multiple filters chain with `&`:
  `.eq('a', 1).eq('b', 2)` produces `a=eq.1&b=eq.2`.

**auth.test.ts:**

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
- `signOut` clears tokens, cancels refresh timer, fires
  `SIGNED_OUT`.
- `onAuthStateChange` receives `SIGNED_IN` after signIn.
- `onAuthStateChange` receives `SIGNED_OUT` after signOut.
- `onAuthStateChange` receives `TOKEN_REFRESHED` after
  refresh.
- `unsubscribe` stops delivering events.
- Auto-refresh schedules timer ~60s before expiry.
- Auto-refresh fires `TOKEN_REFRESHED` on success.
- Auto-refresh fires `SIGNED_OUT` on failure.
- JWT payload decoding extracts `exp`, `sub`, `email`
  correctly.
- `persistSession: true` writes to localStorage on session
  change.
- `persistSession: true` reads from localStorage on
  construction.
- `persistSession: true` clears localStorage on signOut.
- localStorage errors are caught silently (SSR safe).

  > Warning: Auth tests that mock the HTTP layer should
  > verify the mock is called with correct paths and
  > headers, not just that the response shape is correct.
  > A response with the right shape could come from a
  > hardcoded fallback.

**http.test.ts:**

- Sets `apikey` header on every request.
- Sets `Authorization: Bearer` when access token exists.
- Sets `Content-Type: application/json` on POST/PATCH.
- Omits `Content-Type` on GET/DELETE without body.
- Parses PostgREST error format `{ code, message, details,
  hint }`.
- Parses GoTrue error format `{ error, error_description }`.
- On 401, attempts token refresh then replays request.
- On 401 with failed refresh, returns original error.
- Does not retry non-401 errors.
- Does not retry more than once per request.
- Custom headers from client options are included.
- Handles network failures gracefully with error message.

### Integration Tests (against boa-cars-test backend)

These tests run against the live BOA backend at
`https://dm2yob87lihft.cloudfront.net` using the anon key
from `boa-cars-test/.boa/config.json`. They exercise the
full client through CloudFront to pgrest-lambda.

**Auth flow:**
1. Sign up a new user with a unique email (use timestamp
   suffix to avoid collisions).
2. Verify `user` and `session` are returned.
3. Verify `getUser()` returns the signed-in user.
4. Sign out.
5. Verify `getUser()` returns null.
6. Sign back in with the same credentials.
7. Verify session tokens are valid.

  > Warning: Integration tests create real Cognito users.
  > Use unique emails per test run. There is no automated
  > cleanup -- Cognito users persist until manually deleted.

**Token refresh:**
1. Sign in.
2. Manually expire the access token (set internal state).
3. Make a data request.
4. Verify the 401 retry triggers refresh and the request
   succeeds.

  > Warning: This test manipulates internal client state
  > to simulate expiry. It does not test actual JWT expiry
  > (which takes 1 hour). The test should verify that the
  > refresh endpoint is called and a new access token is
  > obtained.

**Data CRUD (cars table):**
1. Sign in as a test user.
2. Insert a car: `{ make: 'Test', model: 'Car', year: 2024,
   color: 'blue' }`.
3. Select all cars, verify the inserted car appears.
4. Update the car's color to 'red'.
5. Select the car by id, verify color is 'red'.
6. Delete the car.
7. Select all cars, verify it is gone.

**Filters and ordering:**
1. Insert 3 cars with different years.
2. `.order('year', { ascending: true })` -- verify order.
3. `.eq('year', 2024)` -- verify filter.
4. `.gt('year', 2022)` -- verify range filter.
5. `.in('year', [2023, 2024])` -- verify in filter.
6. Clean up: delete test cars.

**Resource embedding:**
1. If the test schema supports embedding (e.g., a table
   with `_id` columns referencing another table), test
   `.select('*, related_table(col)')`.
2. Verify nested data is returned.

  > Warning: The boa-cars-test schema may only have a `cars`
  > table without relationships. If embedding cannot be
  > tested against the live backend, add a note that this
  > test requires a schema with `_id` relationships.

**Count:**
1. Insert 3 cars.
2. `.select('*', { count: 'exact' })` -- verify `count`
   equals the number of user's rows.
3. Clean up.

**Storage (if upload/download endpoints are deployed):**
1. `createUploadUrl({ filename: 'test.txt',
   contentType: 'text/plain' })`.
2. Verify `uploadUrl` and `key` are returned.
3. Upload a small text file to the presigned URL.
4. `createDownloadUrl(key)`.
5. Verify `downloadUrl` is returned.
6. Fetch the download URL, verify content matches.

  > Warning: The storage upload response from the server
  > includes `{ uploadUrl, key, expiresIn, maxSizeBytes,
  > message }`. The client maps this to
  > `{ uploadUrl, key, error }`. Verify the client
  > correctly extracts `key` (not `fileKey` -- the server
  > field name is `key`).

**Error handling:**
1. `.from('nonexistent_table').select('*')` -- verify
   error with code `PGRST205`.
2. `.from('cars').select('nonexistent_column')` -- verify
   error with code containing `PGRST`.
3. `signIn` with wrong password -- verify error message.

### Web Component Tests

- `<boa-auth>` renders shadow DOM with form elements.
- Submitting the form in sign-in mode fires
  `boa-auth-success` on success.
- Submitting with invalid credentials fires
  `boa-auth-error`.
- Toggle switches between sign-in and sign-up form.
- `<boa-user-menu>` shows email when client is authenticated.
- `<boa-user-menu>` is empty when no session exists.

  > Warning: Web component tests require a DOM environment.
  > Use a lightweight DOM shim or run in a browser test
  > runner. node:test alone cannot test custom elements.

## Implementation Order

### Phase 1: Types and HTTP Layer

1. Create `client/package.json` and `client/tsconfig.json`.
2. Create `client/src/types.ts` -- all shared types.
3. Create `client/src/http.ts` -- fetch wrapper with header
   injection, error parsing, and 401 retry logic.
4. Create `client/tests/http.test.ts` -- unit tests for
   the HTTP layer using a mock fetch.

### Phase 2: Query Builder

5. Create `client/src/query-builder.ts` -- immutable
   chainable builder with all filter operators, modifiers,
   and URL construction.
6. Create `client/tests/query-builder.test.ts` -- full
   unit test coverage for URL building and header
   construction.

### Phase 3: Auth

7. Create `client/src/auth.ts` -- `BoaAuth` class with
   signUp, signIn, getUser, getSession, signOut,
   onAuthStateChange, and auto-refresh.
8. Create `client/tests/auth.test.ts` -- unit tests with
   mocked HTTP layer.

### Phase 4: Storage and API

9. Create `client/src/storage.ts` -- presigned URL methods.
10. Create `client/src/client.ts` -- `BoaClient` class
    wiring auth, storage, api, and query builder.
11. Create `client/src/index.ts` -- `createClient` factory
    and exports.

### Phase 5: Integration Tests

12. Create `client/tests/integration.test.ts` -- tests
    against the live boa-cars-test backend covering auth
    flow, CRUD, filters, count, storage, and error handling.
13. Run integration tests and fix any issues.

### Phase 6: UI Components

14. Create `client/src/ui/auth.ts` -- `<boa-auth>` web
    component.
15. Create `client/src/ui/user-menu.ts` -- `<boa-user-menu>`
    web component.
16. Create `client/src/ui/index.ts` -- UI entry point.

### Phase 7: Documentation and Validation

17. Create `client/README.md` -- usage documentation.
18. Migrate `boa-cars-test/app/` from `@supabase/supabase-js`
    to `@boa-cloud/client` and verify all features work.

## Open Questions

1. **signInWithPassword vs signIn naming.** supabase-js v2
   uses `signInWithPassword` to distinguish from OAuth
   flows. Since BOA does not support OAuth in MVP, the
   design uses the simpler `signIn`. If OAuth support is
   added later, this may need to be renamed or aliased.
   For now, `signIn` is cleaner.

2. **Realtime / subscriptions.** supabase-js has a
   `.subscribe()` method for Realtime. BOA's events-lambda
   (AppSync Events) is a separate concern. Should
   `@boa-cloud/client` include a `.subscribe()` method that
   connects to AppSync Events, or should that be a separate
   package? **Recommendation:** Separate package
   (`@boa-cloud/realtime`). Keep the core client focused on
   REST + auth + storage.

3. **Row-level type safety.** The current generic
   `QueryBuilder<T>` accepts any type parameter but does not
   enforce column names at the TypeScript level. supabase-js
   v2 supports generated types from the database schema.
   Should `@boa-cloud/client` support a similar codegen flow?
   **Recommendation:** Defer. The generic parameter is
   sufficient for MVP. Type generation can be added later
   using the OpenAPI spec from `GET /rest/v1/`.

4. **localStorage key collision.** The `boa-auth` key in
   localStorage could collide if multiple BOA clients point
   to different backends on the same origin. Should the key
   include a hash of the API URL? **Recommendation:** Yes,
   use `boa-auth-{hash}` where hash is a short hash of the
   URL. This prevents collisions without complicating the
   common single-backend case.

5. **Server-side rendering.** The library uses `fetch`
   (available in Node.js 18+) and optionally `localStorage`
   (browser only). SSR frameworks (Next.js, Nuxt) run code
   in both environments. The `persistSession` option already
   guards localStorage access with try/catch. Should there
   be an explicit SSR mode? **Recommendation:** No. The
   try/catch guard is sufficient. SSR code should use
   `persistSession: false` (the default) and manage tokens
   via cookies or server-side session stores outside the
   client library.

6. **Logical operators (or/and).** pgrest-lambda supports
   `?or=(status.eq.active,status.eq.pending)` and nested
   `?and=(or(a.eq.1,b.eq.2),c.eq.3)` logical grouping.
   supabase-js exposes this via `.or('status.eq.active,
   status.eq.pending')`. Should the BOA client support
   `.or()` and `.and()` methods? **Recommendation:** Defer
   to a follow-up. The MVP covers the common case of
   implicit AND across chained filters. Logical operators
   can be added later without breaking changes.

7. **`select()` after mutations.** supabase-js supports
   `.insert({...}).select()` to return the inserted row.
   The design uses `Prefer: return=representation` by
   default on insert/update/upsert, which already returns
   the affected rows. Should `.select()` after a mutation
   be supported for API compatibility? **Recommendation:**
   Not needed for MVP. The default behavior returns data.
   If a user chains `.select('id,name')` after insert, it
   could set the `select` query parameter to control which
   columns are returned -- but this is a supabase-js-ism
   that adds complexity for little value.
