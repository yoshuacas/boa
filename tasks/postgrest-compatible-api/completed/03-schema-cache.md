# Task 03: Schema Cache (pg_catalog Introspection)

**Agent:** implementer
**Design:** docs/design/postgrest-compatible-api.md
**Depends on:** Task 02 (db.mjs for getPool)

## Objective

Create `postgrest/schema-cache.mjs` that introspects
PostgreSQL system catalogs and caches table/column metadata
with configurable TTL.

## Target Tests

From `__tests__/schema-cache.test.mjs`:
- Parses pg_catalog rows into cache structure with correct
  column metadata
- Respects TTL (returns cached data within TTL without
  re-querying)
- Re-queries when TTL expired
- refresh() forces re-query regardless of TTL
- hasTable returns true for existing tables
- hasTable returns false for nonexistent tables
- hasColumn returns true for existing columns
- hasColumn returns false for nonexistent columns
- getPrimaryKey returns correct columns

## Implementation

Create `plugin/lambda-templates/postgrest/schema-cache.mjs`.

**Module-scoped state:**
```javascript
let cache = null;
let lastRefreshAt = 0;
const TTL = parseInt(process.env.SCHEMA_CACHE_TTL_MS || '300000');
```

**Exports:**

- `async getSchema(pool)` — returns cached schema or
  introspects if cache is null or TTL expired. Schema
  structure:
  ```javascript
  {
    tables: {
      'tablename': {
        columns: {
          'colname': {
            type: 'text',
            nullable: false,
            defaultValue: null
          }
        },
        primaryKey: ['id']
      }
    }
  }
  ```

- `async refresh(pool)` — forces re-introspection regardless
  of TTL, updates cache, returns schema.

- `hasTable(schema, table)` — returns boolean.

- `hasColumn(schema, table, column)` — returns boolean.

- `getPrimaryKey(schema, table)` — returns array of column
  names.

**Introspection queries** (use `pg_catalog`, not
`information_schema`, for Aurora DSQL compatibility):

1. Columns query — join `pg_class`, `pg_namespace`,
   `pg_attribute`, `pg_attrdef` for `public` schema,
   `relkind IN ('r', 'p')`, `attnum > 0`,
   `NOT attisdropped`. Use `pg_catalog.format_type()` for
   data type. See the exact SQL in the design doc's
   schema-cache.mjs section.

2. Primary keys query — join `pg_constraint`, `pg_class`,
   `pg_namespace`, `pg_attribute` where `contype = 'p'`
   and `nspname = 'public'`. See design doc for exact SQL.

**Processing:** Group column rows by `table_name`, parse
`is_nullable` (the query returns `NOT a.attnotnull`),
convert `data_type` string. Group PK rows by table.

## Acceptance Criteria

- All schema-cache.test.mjs tests pass.
- Existing tests still pass.
- No new dependencies.

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true positives
  before marking the task complete.
- If `pg_catalog.format_type()` returns unexpected type
  strings in the mock, adjust the test expectations rather
  than escalating (the real type strings come from
  PostgreSQL, not from our code).
