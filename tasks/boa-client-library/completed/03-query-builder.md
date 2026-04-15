# Task 03: Query Builder

**Agent:** implementer
**Design:** docs/design/boa-client-library.md

## Objective

Implement the immutable, chainable QueryBuilder that
constructs PostgREST-compatible URLs and headers for data
operations.

## Target Tests

From `client/tests/query-builder.test.ts`:
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
- `.order('created_at')` defaults to ascending.
- `.limit(10)` appends `limit=10`.
- `.range(0, 9)` appends `limit=10&offset=0`.
- `.range(20, 29)` appends `limit=10&offset=20`.
- `.single()` sets Accept header to
  `application/vnd.pgrst.object+json`.
- `.single()` on a query returning zero or multiple rows
  results in an error (server returns HTTP 406 / PGRST116).
- `.select('*', { count: 'exact' })` adds `count=exact`
  to Prefer header.
- `.insert({...})` builds POST with body and Prefer.
- `.update({...}).eq('id', 'abc')` builds PATCH with
  filters and body.
- `.delete().eq('id', 'abc')` builds DELETE with filters.
- `.upsert({...}, { onConflict: 'id' })` builds POST with
  `on_conflict=id` and merge-duplicates Prefer.
- Immutability: `.eq()` returns new builder, original
  unchanged.
- Multiple filters chain with `&`.

## Implementation

### client/src/query-builder.ts

Create the `QueryBuilder<T>` class with these internals:

**Private state (set via constructor/clone):**
- `_http: HttpClient`
- `_table: string`
- `_method: HttpMethod` (default `'GET'`)
- `_body: unknown | null`
- `_select: string | null`
- `_filters: string[]`
- `_order: string | null`
- `_limit: number | null`
- `_offset: number | null`
- `_count: 'exact' | null`
- `_single: boolean`
- `_onConflict: string | null`
- `_prefer: string[]`
- `_headers: Record<string, string>`

**Immutability via `_clone`:**
Each mutation method creates a shallow clone with the new
parameter applied. Use `Object.assign` on a new instance.

**Mutation methods:**
- `select(columns?, options?)`: Sets `_method` to `GET`,
  `_select` to columns. If `options.count === 'exact'`,
  sets `_count`.
- `insert(data)`: Sets `_method` to `POST`, `_body`,
  adds `return=representation` to `_prefer`.
- `update(data)`: Sets `_method` to `PATCH`, `_body`,
  adds `return=representation` to `_prefer`.
- `upsert(data, options?)`: Sets `_method` to `POST`,
  `_body`, `_onConflict`, adds
  `resolution=merge-duplicates,return=representation`
  to `_prefer`.
- `delete()`: Sets `_method` to `DELETE`.

**Filter methods** (each returns a clone with appended
filter):
- `eq(col, val)` -> `col=eq.val`
- `neq(col, val)` -> `col=neq.val`
- `gt(col, val)` -> `col=gt.val`
- `gte(col, val)` -> `col=gte.val`
- `lt(col, val)` -> `col=lt.val`
- `lte(col, val)` -> `col=lte.val`
- `like(col, pat)` -> `col=like.pat`
- `ilike(col, pat)` -> `col=ilike.pat`
- `in(col, vals)` -> `col=in.(v1,v2,...)`
- `is(col, val)` -> `col=is.val` (convert `null` to
  string `"null"`)
- `not(col, op, val)` -> `col=not.op.val`

**Modifier methods:**
- `order(col, opts?)`: `_order = col.desc` or `col.asc`
  (default ascending).
- `limit(n)`: `_limit = n`.
- `range(from, to)`: `_limit = to - from + 1`,
  `_offset = from`.
- `single()`: `_single = true`.

**URL construction (`_buildUrl`):**
1. Start with `/rest/v1/{_table}`.
2. Build query params: `select`, each filter, `order`,
   `limit`, `offset`, `on_conflict`.

**Header construction (`_buildHeaders`):**
1. If `_prefer` is non-empty: `Prefer: <joined values>`.
2. If `_count` is `'exact'`: append `count=exact` to
   Prefer.
3. If `_single`: `Accept: application/vnd.pgrst.object+json`.

**Thenable execution (`then`):**
Implement `then(onfulfilled, onrejected)` that calls
`_execute()` internally. `_execute`:
1. Builds URL and headers via `_buildUrl` / `_buildHeaders`.
2. Calls `_http.request()`.
3. Parses `Content-Range` header for count on GET.
4. Returns `{ data, error, count }`.

## Assumption

The `HttpClient` from Task 02 is available and provides
`request()`. If the HttpClient API differs from what is
described here, adapt the QueryBuilder to match.

## Acceptance Criteria

- All `query-builder.test.ts` tests pass.
- The QueryBuilder is fully immutable (no method mutates
  `this`).
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If the HttpClient from Task 02 has a different API than
  expected, adapt rather than escalate -- but note the
  adaptation in the commit message.
