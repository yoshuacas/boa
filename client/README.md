# @boa-cloud/client

JavaScript/TypeScript client for BOA backends. Zero dependencies.

## Install

```bash
npm install @boa-cloud/client
```

## Quick Start

```js
import { createClient } from '@boa-cloud/client'

const boa = createClient('https://your-api.cloudfront.net', 'your-anon-key')
```

Options:

```js
const boa = createClient(url, anonKey, {
  persistSession: true,  // store tokens in localStorage (default: false)
  headers: { 'X-Custom': 'value' },
})
```

## Auth

```js
// Sign up
const { user, session, error } = await boa.auth.signUp({
  email: 'user@example.com',
  password: 'SecurePass1',
})

// Sign in
const { user, session, error } = await boa.auth.signIn({
  email: 'user@example.com',
  password: 'SecurePass1',
})

// Get current user (from cached JWT, no network call)
const { user } = await boa.auth.getUser()

// Get current user (from server)
const { user } = await boa.auth.getUser({ fetch: true })

// Get current session
const { session } = await boa.auth.getSession()

// Listen for auth changes
const { unsubscribe } = boa.auth.onAuthStateChange((event, session) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
})

// Sign out
await boa.auth.signOut()
```

## Data

```js
// Select
const { data, error } = await boa.from('todos').select('*')

// Select with filters, ordering, pagination
const { data, count } = await boa
  .from('todos')
  .select('*', { count: 'exact' })
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .range(0, 9)

// Single row
const { data } = await boa.from('todos').select('*').eq('id', id).single()

// Insert
const { data, error } = await boa.from('todos').insert({ title: 'Buy milk' })

// Update
const { data, error } = await boa.from('todos').update({ completed: true }).eq('id', id)

// Delete
const { error } = await boa.from('todos').delete().eq('id', id)

// Upsert
const { data } = await boa.from('todos').upsert({ id, title: 'Updated' }, { onConflict: 'id' })

// Resource embedding (joins)
const { data } = await boa.from('games').select('*, game_stats(goals, players(name))')
```

**Filters:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `not`

**Modifiers:** `order`, `limit`, `range`, `single`

## Storage

```js
// Get a presigned upload URL
const { key, uploadUrl } = await boa.storage.createUploadUrl({
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
})

// Upload directly to S3
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,
})

// Get a presigned download URL
const { downloadUrl } = await boa.storage.createDownloadUrl(key)
```

## Token Management

Access tokens (1h) refresh automatically ~60s before expiry.
With `persistSession: true`, tokens survive page reloads via
localStorage. On refresh failure, the client fires `SIGNED_OUT`
and clears all tokens.

## UI Components

Import from `@boa-cloud/client/ui`:

```html
<script type="module">
  import '@boa-cloud/client/ui'
</script>

<!-- Drop-in auth form -->
<boa-auth
  api-url="https://your-api.cloudfront.net"
  anon-key="your-anon-key"
></boa-auth>

<!-- User menu (pass client via JS) -->
<boa-user-menu id="menu"></boa-user-menu>
<script>
  document.getElementById('menu').client = boa
</script>
```

**Theme with CSS custom properties:**

```css
boa-auth, boa-user-menu {
  --boa-font-family: system-ui, sans-serif;
  --boa-primary-color: #2563eb;
  --boa-error-color: #dc2626;
  --boa-border-radius: 6px;
  --boa-input-border: #d1d5db;
}
```

## Migrating from @supabase/supabase-js

| supabase-js | @boa-cloud/client |
|---|---|
| `createClient(url, key)` | `createClient(url, key)` |
| `supabase.auth.signInWithPassword({...})` | `boa.auth.signIn({...})` |
| `supabase.auth.signUp({...})` | `boa.auth.signUp({...})` |
| `supabase.auth.getUser()` returns `{ data: { user } }` | `boa.auth.getUser()` returns `{ user }` |
| `supabase.auth.signOut()` | `boa.auth.signOut()` |
| `supabase.from('t').select()` | `boa.from('t').select()` |
| `supabase.from('t').insert()` | `boa.from('t').insert()` |
| `supabase.from('t').update()` | `boa.from('t').update()` |
| `supabase.from('t').delete()` | `boa.from('t').delete()` |
| `define: { global: 'globalThis' }` in Vite | Not needed |
| `~45KB gzipped` | `< 8KB gzipped` |

Key differences:
- `signInWithPassword` is renamed to `signIn` (BOA has no OAuth in MVP).
- `getUser()` returns `{ user }` directly, not `{ data: { user } }`.
- No Vite `global` polyfill required.
- No Realtime/subscribe (use `@boa-cloud/realtime` when available).
