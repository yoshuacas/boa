# Task 01: End-to-End Tests for PostgREST-Compatible API

**Agent:** implementer
**Design:** docs/design/postgrest-compatible-api.md

## Objective

Create comprehensive unit and integration test suites for the
PostgREST-compatible data API layer. All tests should compile
and fail with clear messages indicating missing implementations.

## Test File Paths

Create the following test files under
`plugin/lambda-templates/postgrest/`:

- `__tests__/query-parser.test.mjs`
- `__tests__/sql-builder.test.mjs`
- `__tests__/schema-cache.test.mjs`
- `__tests__/router.test.mjs`
- `__tests__/response.test.mjs`
- `__tests__/errors.test.mjs`
- `__tests__/openapi.test.mjs`
- `__tests__/handler.integration.test.mjs`

Use a test runner that works with ES modules (e.g., Node.js
built-in `node:test` with `node:assert`). Do not add new
dependencies — use Node.js built-in test facilities. The
project uses `"type": "module"` in package.json.

## Test Cases

### query-parser.test.mjs

**Select parsing:**
- Given `?select=id,title`, when parsed, then select is
  `['id', 'title']`
- Given `?select=*`, when parsed, then select is `['*']`
- Given no select param, when parsed, then select defaults
  to `['*']`

**Filter parsing:**
- Given `?id=eq.abc`, when parsed, then filter has column
  `id`, operator `eq`, value `abc`, negate `false`
- Given `?status=neq.archived`, when parsed, then filter
  has operator `neq`, value `archived`
- Given `?status=not.eq.archived`, when parsed, then filter
  has negate `true`, operator `eq`, value `archived`
- Given `?status=in.(active,done)`, when parsed, then filter
  has operator `in`, value `['active', 'done']`
- Given `?deleted_at=is.null`, when parsed, then filter has
  operator `is`, value `null`
- Given `?flag=is.true`, when parsed, then filter has
  operator `is`, value `true`
- Given `?flag=is.false`, when parsed, then filter has
  operator `is`, value `false`
- Given `?flag=is.unknown`, when parsed, then filter has
  operator `is`, value `unknown`
- Given `?col=is.invalid`, when parsed, then throws with
  code `PGRST100`
- Given `?name=like.*smith*`, when parsed, then filter has
  operator `like`, value `%smith%` (asterisks replaced)
- Given `?name=ilike.*smith*`, when parsed, then filter has
  operator `ilike`, value `%smith%`
- Given `?id=not.in.(a,b)`, when parsed, then filter has
  negate `true`, operator `in`, value `['a', 'b']`
- Given `?deleted_at=not.is.null`, when parsed, then filter
  has negate `true`, operator `is`, value `null`
- Given `?deleted_at=not_null`, when parsed, then treated
  as `not.is.null` (PostgREST shorthand)
- Given `?col=badvalue` (no operator dot), when parsed,
  then throws with code `PGRST100`

**Order parsing:**
- Given `?order=created_at.desc.nullslast`, when parsed,
  then order has column `created_at`, direction `desc`,
  nulls `nullslast`
- Given `?order=a.asc,b.desc`, when parsed, then order has
  two entries
- Given `?order=name`, when parsed, then direction defaults
  to `asc`

**Pagination:**
- Given `?limit=20&offset=10`, when parsed, then limit is
  20, offset is 10
- Given no limit/offset, when parsed, then limit is null,
  offset is 0

**Reserved params:**
- Given `?select=id&status=eq.active&order=id`, when parsed,
  then `select`, `order`, `limit`, `offset`, `on_conflict`
  are not treated as filters

**on_conflict:**
- Given `?on_conflict=id`, when parsed, then onConflict is
  `'id'`

### sql-builder.test.mjs

Use a mock schema object:
```javascript
const schema = {
  tables: {
    todos: {
      columns: {
        id: { type: 'text', nullable: false, defaultValue: null },
        user_id: { type: 'text', nullable: false, defaultValue: null },
        title: { type: 'text', nullable: true, defaultValue: null },
        status: { type: 'text', nullable: true, defaultValue: null },
        created_at: { type: 'timestamptz', nullable: false, defaultValue: 'now()' }
      },
      primaryKey: ['id']
    },
    categories: {
      columns: {
        id: { type: 'text', nullable: false, defaultValue: null },
        name: { type: 'text', nullable: false, defaultValue: null }
      },
      primaryKey: ['id']
    }
  }
};
```

**SELECT:**
- Given table `todos` with filter `id=eq.abc`, when
  buildSelect, then SQL contains `WHERE` with `"id" = $1`
  and values include `'abc'`
- Given table `todos` with `select=id,title`, then SQL
  selects `"id", "title"` (not `*`)
- Given table `todos` with `select=*` (default), then SQL
  selects all columns from schema (or uses `*`)
- Given table `todos` with `order=created_at.desc`, then
  SQL contains `ORDER BY "created_at" DESC`
- Given table `todos` with `limit=20&offset=10`, then SQL
  contains `LIMIT $N OFFSET $M`
- Given table `todos` (has user_id) with userId `user1`,
  then SQL contains `"user_id" = $N` with value `user1`
- Given table `categories` (no user_id) with userId `user1`,
  then SQL does NOT contain `user_id`
- Given unknown column `nonexistent` in filter, then throws
  with code `PGRST204`

**INSERT:**
- Given single object body `{title: "Buy milk"}`, then SQL
  is `INSERT INTO "todos" ("title", "user_id") VALUES ($1, $2) RETURNING *`
- Given array body `[{title: "a"}, {title: "b"}]`, then SQL
  has multiple VALUES tuples
- Given body with `user_id: "attacker"`, then SQL forces
  user_id to the authenticated user's ID (verify parameter
  position, not just presence)
- Given table `categories` (no user_id), then user_id is not
  injected into INSERT
- Given body with unknown column, then throws `PGRST204`

**UPSERT:**
- Given POST with `on_conflict=id` and
  `Prefer: resolution=merge-duplicates`, then SQL contains
  `ON CONFLICT ("id") DO UPDATE SET`

**UPDATE:**
- Given filters and body, then SQL is
  `UPDATE "todos" SET ... WHERE ...`
- Given no filters on table with user_id, then throws
  `PGRST106`
- Given table with user_id, then WHERE includes user_id
  filter

**DELETE:**
- Given filters, then SQL is `DELETE FROM "todos" WHERE ...`
- Given no filters on table with user_id, then throws
  `PGRST106`
- Given table with user_id, then WHERE includes user_id
  filter

**COUNT:**
- Given table and filters, then SQL is
  `SELECT COUNT(*) FROM ...` with matching WHERE

**General:**
- All table and column names are double-quoted in output SQL

### schema-cache.test.mjs

Mock `pg.Pool` to return canned rows from introspection
queries.

- Given pg_catalog returns columns for `todos` and
  `categories`, when getSchema, then cache has both tables
  with correct column metadata
- Given cache populated within TTL, when getSchema again,
  then pool.query is NOT called again
- Given cache populated and TTL expired, when getSchema,
  then pool.query IS called again
- Given cache populated, when refresh(), then pool.query is
  called regardless of TTL
- Given schema with `todos`, when hasTable('todos'), then
  returns true
- Given schema, when hasTable('nonexistent'), then returns
  false
- Given schema, when hasColumn('todos', 'title'), then
  returns true
- Given schema, when hasColumn('todos', 'nonexistent'),
  then returns false
- Given schema, when getPrimaryKey('todos'), then returns
  `['id']`

### router.test.mjs

Use a mock schema object with table `todos`.

- Given path `/rest/v1/todos`, when route(), then returns
  `{ type: 'table', table: 'todos' }`
- Given path `/rest/v1/`, when route(), then returns
  `{ type: 'openapi' }`
- Given path `/rest/v1` (no trailing slash), when route(),
  then returns `{ type: 'openapi' }`
- Given path `/rest/v1/_refresh`, when route(), then returns
  `{ type: 'refresh' }`
- Given path `/rest/v1/nonexistent` (not in schema), when
  route(), then throws with code `PGRST205`
- Given path `/rest/v1/_refresh` with GET method, when
  route(), then returns `{ type: 'refresh' }` (reserved
  route takes precedence over any table named `_refresh`)

### response.test.mjs

- Given SELECT result array, when success(200, rows), then
  body is bare JSON array, status 200
- Given INSERT with `return=representation`, when
  success(201, rows), then body is array, status 201
- Given INSERT without representation, when success(201),
  then body is empty, status 201
- Given UPDATE with representation, when success(200, rows),
  then body is array, status 200
- Given UPDATE without representation, then status is 204,
  body empty
- Given DELETE with representation, then status 200, body
  is array
- Given DELETE without representation, then status 204,
  body empty
- Given Content-Range `0-19/*`, then header is set correctly
- Given Content-Range with count `0-19/157`, then header
  includes count
- Given empty result, Content-Range is `*/*` or `*/0`
- Given singleObject mode with 1 row, then body is a single
  object (not array)
- Given singleObject mode with 0 rows, then throws with
  code `PGRST116` and message about 0 rows
- Given singleObject mode with 2 rows, then throws with
  code `PGRST116` and message about more than 1 row
- Given error response, then body has code, message,
  details, hint fields
- All responses include CORS headers (Allow-Origin,
  Allow-Headers with apikey/X-Client-Info, Allow-Methods
  with PATCH, Expose-Headers with Content-Range)

### errors.test.mjs

- Given PostgRESTError constructed with all fields, when
  toJSON(), then returns `{code, message, details, hint}`
- Given PostgRESTError with null details/hint, then toJSON
  still includes them as null
- Given PG error with code 23505, when mapPgError(), then
  returns HTTP 409
- Given PG error with code 23503, when mapPgError(), then
  returns HTTP 409
- Given PG error with code 23502, when mapPgError(), then
  returns HTTP 400
- Given PG error with unknown code, when mapPgError(), then
  returns HTTP 500

### openapi.test.mjs

Use a mock schema with tables `todos` and `categories`.

- When generateSpec(), then result has `openapi: '3.0.3'`
- Then result has paths `/todos` and `/categories`
- Each table path has GET, POST, PATCH, DELETE operations
- Column types map correctly: text -> string, integer ->
  integer, boolean -> boolean, timestamptz -> string with
  format date-time, uuid -> string with format uuid,
  jsonb -> object
- Result includes securitySchemes with Bearer JWT
- Result includes PostgREST error schema in components

### handler.integration.test.mjs

Mock `pg.Pool` to simulate database responses. Build Lambda
event objects that match API Gateway proxy integration format.

**CRUD operations:**
- Given GET /rest/v1/todos with valid auth, when handler
  called, then returns 200 with bare JSON array
- Given POST /rest/v1/todos with body and
  `Prefer: return=representation`, when handler called,
  then returns 201 with inserted rows
- Given PATCH /rest/v1/todos?id=eq.abc with body and
  `Prefer: return=representation`, when handler called,
  then returns 200 with updated rows
- Given DELETE /rest/v1/todos?id=eq.abc with
  `Prefer: return=representation`, when handler called,
  then returns 200 with deleted rows

**Special routes:**
- Given GET /rest/v1/, when handler called, then returns 200
  with valid OpenAPI spec JSON
- Given POST /rest/v1/_refresh, when handler called, then
  returns 200 with refreshed spec

**Error handling:**
- Given GET /rest/v1/nonexistent, when handler called, then
  returns 404 with PGRST205 error body
- Given GET /rest/v1/todos?badcol=eq.x (unknown column in
  filter), then returns 400 with PGRST204 error body
- Given PATCH /rest/v1/todos without filters, then returns
  400 with PGRST106
- Given DELETE /rest/v1/todos without filters, then returns
  400 with PGRST106
- Given POST /rest/v1/todos with missing body, then returns
  400 with PGRST100

**User isolation:**
- Given user A inserts a row, when user B queries the same
  table, then user B does NOT see user A's row (verify
  user_id parameter in the query, not just result)

  > Warning: This test's expected isolation could be
  > bypassed if the mock doesn't properly simulate
  > user_id filtering. The implementing agent should
  > verify the mock captures the SQL WHERE clause params
  > and asserts user_id is bound correctly.

**CORS:**
- Given OPTIONS request, when handler called, then returns
  200 with CORS headers (including PATCH in Allow-Methods,
  apikey/X-Client-Info in Allow-Headers, Content-Range in
  Expose-Headers)

**Prefer headers:**
- Given GET with `Prefer: count=exact`, when handler called,
  then Content-Range header includes total count
- Given POST without `Prefer: return=representation`, then
  returns 201 with empty body

**Single object mode:**
- Given GET with `Accept: application/vnd.pgrst.object+json`
  and query returning 1 row, then response body is a single
  object
- Given GET with single object accept and 0 rows, then
  returns 406 with PGRST116
- Given GET with single object accept and >1 rows, then
  returns 406 with PGRST116

## Setup Notes

- Install no new npm dependencies. Use `node:test` and
  `node:assert` built into Node.js 20.
- Each test file should be independently runnable with
  `node --test <file>`.
- Mock `pg.Pool` by creating a simple mock object that
  records queries and returns canned results. Do NOT
  mock at the module level with import rewiring — instead,
  inject the pool/schema as function parameters where the
  module API allows it, or use a test helper that replaces
  the module-scoped pool.
- For handler integration tests, construct Lambda event
  objects with `httpMethod`, `path`, `queryStringParameters`,
  `headers`, `body`, and
  `requestContext.authorizer.claims.sub`.

## Acceptance Criteria

- All test files are syntactically valid and can be loaded
  by Node.js without import errors (create stub modules
  with the expected exports if needed to avoid import
  failures, but stubs should throw "not implemented").
- All tests fail with clear assertion messages.
- No test panics or produces cryptic stack traces.

## Conflict Criteria

- If any test that should fail instead passes, first
  diagnose why by following the "Unexpected test results"
  steps in the implementer prompt: investigate the code
  path, verify the assertion targets the right behavior,
  and attempt to rewrite the test to isolate the intended
  path. Only escalate if you cannot construct a well-formed
  test that targets the desired behavior.
