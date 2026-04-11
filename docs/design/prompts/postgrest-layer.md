BOA's current Lambda handler has hardcoded CRUD routes for a single
`/items` resource. We want to replace this with a generic data API
layer that is wire-compatible with PostgREST, so that frontend
developers can use `@supabase/supabase-js` against a BOA backend
with no code changes.

The API should:
- Accept the same HTTP request format that supabase-js sends
  (GET/POST/PATCH/DELETE to /rest/v1/{table} with query params
  for filtering, ordering, pagination, and column selection)
- Support PostgREST filter operators (eq, neq, gt, gte, lt, lte,
  like, ilike, in, is) with negation
- Dynamically discover tables and columns from the database schema
  rather than requiring configuration per table
- Produce PostgREST-compatible JSON responses (bare arrays, not
  wrapped objects) with Content-Range headers
- Return PostgREST-format errors with code, message, details, hint
- Enforce row-level data isolation per authenticated user
- Expose an OpenAPI 3.0 spec so agents can discover the schema
- Work with Aurora DSQL using the existing IAM auth token pattern
- Require zero new npm dependencies
- Require no changes to the SAM template or API Gateway config

Reference: plans/postgrest-layer.md has prior research and
architectural thinking on this feature.
