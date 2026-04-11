# Task 04: Query Parameter Parser

**Agent:** implementer
**Design:** docs/design/postgrest-compatible-api.md

## Objective

Create `postgrest/query-parser.mjs` that parses PostgREST
query parameters into structured objects for downstream SQL
generation.

## Target Tests

All tests in `__tests__/query-parser.test.mjs`:
- Select parsing (id,title / * / default)
- Filter parsing (eq, neq, gt, gte, lt, lte, like, ilike,
  in, is operators; not. prefix negation)
- neq operator parsing
- is operator validation (null/true/false/unknown ok,
  others throw PGRST100)
- `not_null` shorthand treated as `not.is.null`
- like/ilike asterisk-to-percent replacement
- in operator parentheses stripping and comma splitting
- Order parsing (direction, nulls, multiple columns,
  default asc)
- Pagination (limit, offset, defaults)
- Reserved params not treated as filters
- on_conflict parsing
- Malformed filter (no operator) throws PGRST100

## Implementation

Create `plugin/lambda-templates/postgrest/query-parser.mjs`.

**Export:**
```javascript
export function parseQuery(params, method) { ... }
```

**Input:** `params` is the `queryStringParameters` object
from the Lambda event (may be null). `method` is the HTTP
method string.

**Output:**
```javascript
{
  select: ['id', 'title'],      // or ['*']
  filters: [
    { column: 'status', operator: 'eq', value: 'active', negate: false }
  ],
  order: [
    { column: 'created_at', direction: 'desc', nulls: 'nullslast' }
  ],
  limit: 20,       // or null
  offset: 0,
  onConflict: null  // or 'id'
}
```

**Reserved parameter names** (not treated as filters):
`select`, `order`, `limit`, `offset`, `on_conflict`.

**Filter parsing rules:**
1. Split value on first `.` to get operator prefix.
2. If prefix is `not`, split remainder on next `.` to get
   real operator, set `negate: true`.
3. For `in`: strip `(` and `)` from value, split on `,`.
4. For `is`: validate value is one of `null`, `true`,
   `false`, `unknown`. Throw `PostgRESTError(400, 'PGRST100',
   ...)` for invalid values.
5. For `like`/`ilike`: replace all `*` with `%` in value.
6. Handle `not_null` shorthand: if the full filter value is
   `not_null`, treat as `{ operator: 'is', value: 'null',
   negate: true }`.
7. If no recognized operator found, throw PGRST100.

**Order parsing:**
- Split `order` value on `,` for multiple columns.
- Each entry split on `.`: first part is column, second is
  direction (`asc` default), third is nulls (optional).

**Pagination:**
- `limit`: parse to integer, or null if absent.
- `offset`: parse to integer, or 0 if absent.

Import `PostgRESTError` from `./errors.mjs`.

## Acceptance Criteria

- All query-parser.test.mjs tests pass.
- Existing tests still pass.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
