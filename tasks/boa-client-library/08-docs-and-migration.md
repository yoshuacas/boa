# Task 08: Documentation and boa-cars-test Migration

**Agent:** implementer
**Design:** docs/design/boa-client-library.md
**Depends on:** Task 05, Task 06

## Objective

Create the package README and migrate the boa-cars-test app
from `@supabase/supabase-js` to `@boa-cloud/client` as a
validation exercise.

## Target Tests

No new automated tests. Validation is manual:
- The boa-cars-test app compiles without errors.
- All app features (auth, CRUD, listing) work against the
  live backend.
- Integration tests still pass with the migrated app.

## Implementation

### client/README.md

Create package documentation covering:

1. **Installation:** `npm install @boa-cloud/client`
2. **Quick start:** `createClient(url, anonKey)` example.
3. **Auth:** signUp, signIn, signOut, getUser, getSession,
   onAuthStateChange examples.
4. **Data:** from, select, insert, update, delete, upsert,
   filters, ordering, pagination, count, single, resource
   embedding examples.
5. **Storage:** createUploadUrl, createDownloadUrl examples.
6. **Token management:** auto-refresh, persistSession
   option.
7. **UI components:** `<boa-auth>`, `<boa-user-menu>`
   usage and theming.
8. **Migrating from supabase-js:** side-by-side comparison
   of the API differences.

Keep it concise. Use code examples, not prose. Target ~150
lines.

### Migrate boa-cars-test

In `boa-cars-test/app/`:

1. Replace `@supabase/supabase-js` import with
   `@boa-cloud/client` (use relative path or npm link
   since the package is not published).

2. **`src/lib/supabase.js`** -> rename to `src/lib/boa.js`:
   ```javascript
   import { createClient } from '@boa-cloud/client'
   // or: import { createClient } from '../../../client/src/index.js'
   
   export const boa = createClient(
     'https://dm2yob87lihft.cloudfront.net',
     '<anon-key>'
   )
   ```

3. **`src/components/Auth.vue`:** Replace
   `supabase.auth.signUp(...)` with `boa.auth.signUp(...)`,
   `supabase.auth.signInWithPassword(...)` with
   `boa.auth.signIn(...)`,
   `supabase.auth.getUser()` with `boa.auth.getUser()`,
   `supabase.auth.signOut()` with `boa.auth.signOut()`.

   Key API difference: supabase-js uses
   `signInWithPassword`, BOA uses `signIn`.

4. **`src/App.vue`:** Replace all `supabase.from(...)`
   calls with `boa.from(...)`. The query builder API
   (`.select()`, `.insert()`, `.update()`, `.delete()`,
   `.eq()`, `.order()`) is intentionally compatible.

5. **Remove Vite `global` polyfill:** If
   `vite.config.js` has
   `define: { global: 'globalThis' }`, it can be removed
   since `@boa-cloud/client` does not use the Cognito SDK
   directly.

6. Remove `@supabase/supabase-js` from package.json
   dependencies.

### Verify

- `npm run dev` starts without errors.
- Sign up / sign in works.
- Creating, listing, editing, and deleting cars works.
- Sign out works.

## Acceptance Criteria

- `client/README.md` exists with usage documentation.
- boa-cars-test app uses `@boa-cloud/client` instead of
  `@supabase/supabase-js`.
- All app features work against the live backend.
- All existing tests still pass.

## Conflict Criteria

- If the boa-cars-test app uses supabase-js APIs that
  `@boa-cloud/client` does not support (e.g.,
  `.subscribe()`, `.rpc()`), document the gap rather than
  escalating. These are expected limitations for MVP.
- If the Vite `global` polyfill removal causes other
  errors, keep the polyfill and note the dependency.
