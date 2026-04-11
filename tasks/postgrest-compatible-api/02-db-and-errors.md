# Task 02: Connection Pool and Error Handling

**Agent:** implementer
**Design:** docs/design/postgrest-compatible-api.md

## Objective

Create `postgrest/db.mjs` (connection pool extracted from
`crud-api.mjs`) and `postgrest/errors.mjs` (PostgRESTError
class and PostgreSQL error code mapping).

## Target Tests

From `__tests__/errors.test.mjs`:
- PostgRESTError.toJSON() produces correct format
- PostgRESTError with null details/hint includes them as null
- mapPgError maps 23505 -> 409
- mapPgError maps 23503 -> 409
- mapPgError maps 23502 -> 400
- mapPgError maps unknown -> 500

## Implementation

### postgrest/db.mjs

Extract lines 1-62 from `plugin/lambda-templates/crud-api.mjs`
into `plugin/lambda-templates/postgrest/db.mjs`. Preserve:

- `DsqlSigner` import from `@aws-sdk/dsql-signer`
- `pg` import
- `DSQL_ENDPOINT` and `REGION_NAME` from env
- Module-scoped `pool`, `tokenRefreshedAt`, `TOKEN_LIFETIME_MS`
- `generateToken()` function
- `getPool()` function with token refresh logic

Export only `getPool()`.

### postgrest/errors.mjs

Create `plugin/lambda-templates/postgrest/errors.mjs` with:

- `PostgRESTError` class extending `Error`:
  - Constructor: `(statusCode, code, message, details, hint)`
  - `toJSON()`: returns `{code, message, details, hint}`
  - `details` and `hint` default to `null`
- `mapPgError(pgError)` function mapping PG error codes:
  - 23505 -> HTTP 409 (unique constraint)
  - 23503 -> HTTP 409 (foreign key)
  - 23502 -> HTTP 400 (not-null)
  - 42P01 -> HTTP 404 (undefined table)
  - 42703 -> HTTP 400 (undefined column)
  - Others -> HTTP 500
  - Returns a `PostgRESTError` with the mapped status code
    and the PG error's `code`, `message`, `detail`, and
    `hint` fields

## Acceptance Criteria

- All errors.test.mjs tests pass.
- `db.mjs` exports `getPool` and has no syntax errors.
- No new dependencies added.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If `crud-api.mjs` has changed significantly from what the
  design describes (lines 1-62 being the connection pool),
  escalate.
