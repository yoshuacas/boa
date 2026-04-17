Build `@boa-cloud/client` -- a JavaScript/TypeScript client library for BOA backends.

This replaces `@supabase/supabase-js` as the recommended client. It talks directly to
the pgrest-lambda API (PostgREST-compatible REST + GoTrue-compatible auth) and handles
all token management, CORS, and UI helpers internally.

## Why

`@supabase/supabase-js` works but it carries Supabase-specific assumptions (Realtime
channels, Supabase-hosted URLs, GoTrue v2 session management) that cause friction with
BOA backends (CORS preflight issues with CloudFront, token refresh edge cases, unnecessary
bundle weight). A purpose-built client will be smaller, simpler, and work perfectly with
CloudFront + Lambda Function URLs out of the box.

## Repository

Create the library as a new top-level directory: `client/` in the boa repo.
Package name: `@boa-cloud/client`. Pure ESM. Zero runtime dependencies.
TypeScript source, ships both `.mjs` and `.d.ts`.

## Core API

```typescript
import { createClient } from '@boa-cloud/client'

const boa = createClient('https://your-api.cloudfront.net', 'your-anon-key')
```

### Auth

Full lifecycle. The client stores tokens in memory (no localStorage by default)
and auto-refreshes before expiry.

```typescript
// Sign up
const { user, session, error } = await boa.auth.signUp({ email, password })

// Sign in
const { user, session, error } = await boa.auth.signIn({ email, password })

// Get current user (from cached token, or GET /auth/v1/user)
const { user, error } = await boa.auth.getUser()

// Listen to auth state changes
boa.auth.onAuthStateChange((event, session) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
})

// Sign out
await boa.auth.signOut()
```

Token management:
- Access token (1h) stored in memory, sent as `Authorization: Bearer` header
- Refresh token (30d) stored in memory, used to auto-refresh before expiry
- Anon key sent as `apikey` header on every request
- No localStorage/sessionStorage by default (opt-in via `persistSession: true`)
- Auto-refresh runs ~60s before token expiry via setTimeout
- On refresh failure, fires 'SIGNED_OUT' event

### Data (REST)

Maps to the PostgREST-compatible API that pgrest-lambda provides.

```typescript
// Select with filters, ordering, pagination
const { data, error, count } = await boa
  .from('todos')
  .select('*', { count: 'exact' })
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .range(0, 9)

// Insert
const { data, error } = await boa
  .from('todos')
  .insert({ title: 'Buy milk', user_id: userId })

// Update
const { data, error } = await boa
  .from('todos')
  .update({ completed: true })
  .eq('id', todoId)

// Delete
const { error } = await boa
  .from('todos')
  .delete()
  .eq('id', todoId)

// Upsert
const { data, error } = await boa
  .from('todos')
  .upsert({ id: todoId, title: 'Updated' }, { onConflict: 'id' })

// Resource embedding (joins)
const { data } = await boa
  .from('games')
  .select('*, game_stats(goals, assists, players(name, position))')
```

Supported filter operators: eq, neq, gt, gte, lt, lte, like, ilike, in, is,
not (negation prefix). These map to PostgREST query parameters.

### Storage

Presigned upload/download via the BOA storage endpoints.

```typescript
// Upload
const { key, uploadUrl, error } = await boa.storage.createUploadUrl({
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
})
// Then PUT the file to uploadUrl

// Download
const { downloadUrl, error } = await boa.storage.createDownloadUrl(key)
```

### OpenAPI

```typescript
// Get the OpenAPI 3.0 spec as JSON
const { spec, error } = await boa.api.getSpec()
```

## Query Builder Design

The query builder is the core of the data API. It must be chainable, immutable
(each method returns a new builder), and type-safe when used with TypeScript generics.

```typescript
class QueryBuilder<T> {
  select(columns?: string, options?: { count?: 'exact' }): QueryBuilder<T>
  insert(data: Partial<T> | Partial<T>[]): QueryBuilder<T>
  update(data: Partial<T>): QueryBuilder<T>
  upsert(data: Partial<T> | Partial<T>[], options?: { onConflict?: string }): QueryBuilder<T>
  delete(): QueryBuilder<T>

  // Filters
  eq(column: string, value: any): QueryBuilder<T>
  neq(column: string, value: any): QueryBuilder<T>
  gt(column: string, value: any): QueryBuilder<T>
  gte(column: string, value: any): QueryBuilder<T>
  lt(column: string, value: any): QueryBuilder<T>
  lte(column: string, value: any): QueryBuilder<T>
  like(column: string, pattern: string): QueryBuilder<T>
  ilike(column: string, pattern: string): QueryBuilder<T>
  in(column: string, values: any[]): QueryBuilder<T>
  is(column: string, value: null | boolean): QueryBuilder<T>
  not(column: string, operator: string, value: any): QueryBuilder<T>

  // Modifiers
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  range(from: number, to: number): QueryBuilder<T>
  single(): QueryBuilder<T>  // Expect single row, return object instead of array

  // Execute (called implicitly when awaited via .then())
  then<R>(resolve: (result: QueryResult<T>) => R): Promise<R>
}
```

The builder collects query parameters and executes on `await`. No network call
until the promise is consumed.

## HTTP Layer

- All requests go through a single internal `fetch` wrapper
- Sets `apikey` header on every request (anon key)
- Sets `Authorization: Bearer <access_token>` when authenticated
- Sets `Content-Type: application/json` on POST/PATCH/PUT
- Sets `Prefer: return=representation` on mutations (to get back the modified rows)
- Sets `Prefer: count=exact` when count is requested
- Handles CORS preflight naturally (no workarounds needed)
- Retries on 401 by attempting token refresh, then replaying the request once
- Parses PostgREST error format: `{ code, message, details, hint }`

## Auth UI Components (Optional)

Ship a separate entry point `@boa-cloud/client/ui` with framework-agnostic
web components for common auth flows:

```html
<!-- Drop-in sign-in/sign-up form -->
<boa-auth
  api-url="https://your-api.cloudfront.net"
  anon-key="your-anon-key"
></boa-auth>
```

The `<boa-auth>` web component:
- Renders a sign-in form with email/password fields
- Toggle between sign-in and sign-up modes
- Handles form submission, displays errors
- Fires `boa-auth-success` CustomEvent with `{ user, session }` on success
- Fires `boa-auth-error` CustomEvent with `{ error }` on failure
- Minimal styling, easily overridable with CSS custom properties
- Uses Shadow DOM for style encapsulation
- Under 5KB gzipped

Additional components:
- `<boa-user-menu>` -- shows current user email with sign-out button
- Both components accept a `client` attribute/property to share an existing BoaClient instance

## Implementation Constraints

1. Zero runtime dependencies. Uses native `fetch`, `crypto.subtle` for JWT decode
2. Pure ESM (`"type": "module"` in package.json)
3. TypeScript source, compiled to `.mjs` + `.d.ts`
4. Tree-shakeable: auth, storage, and UI are separate entry points
5. Works in browsers, Node.js 18+, and Deno
6. Bundle size target: core < 8KB gzipped, UI components < 5KB gzipped
7. Test with `node:test` (unit) + real BOA backend (integration)

## Testing

- Unit tests for QueryBuilder (parameter construction, URL building)
- Unit tests for auth token management (refresh timing, state transitions)
- Integration tests against a live BOA backend (the boa-cars-test stack):
  - Sign up, sign in, refresh, get user, sign out
  - CRUD on the cars table
  - Resource embedding
  - Filter operators
  - Storage upload/download
- Test the `<boa-auth>` web component renders and submits

## File Structure

```
client/
  src/
    index.ts          -- createClient, exports
    client.ts         -- BoaClient class
    auth.ts           -- BoaAuth (token management, auth methods)
    query-builder.ts  -- QueryBuilder (chainable, immutable)
    storage.ts        -- BoaStorage (presigned URLs)
    http.ts           -- fetch wrapper (headers, retry on 401)
    types.ts          -- shared TypeScript types
    ui/
      auth.ts         -- <boa-auth> web component
      user-menu.ts    -- <boa-user-menu> web component
  tests/
    query-builder.test.ts
    auth.test.ts
    http.test.ts
    integration.test.ts
  package.json
  tsconfig.json
  README.md
```

## Success Criteria

1. The boa-cars-test app (`boa-cars-test/app/`) can be rewritten to use `@boa-cloud/client`
   instead of `@supabase/supabase-js` and all features work identically
2. The `<boa-auth>` web component can replace the custom Auth.vue component
3. All unit and integration tests pass
4. `npm pack` produces a valid package under 15KB gzipped total
