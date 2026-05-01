# Access Policies

Access policies control who can access what data in your BOA backend. They replace traditional PostgreSQL Row-Level Security (RLS) with a policy-as-code approach that is faster (~5 microsecond evaluation via cedar-wasm), more readable, and version-controlled alongside your schema.

## How It Works

1. You write `.cedar` policy files in `policies/` in your project root
2. At deploy time, `boa deploy` bundles them with the Lambda
3. At runtime, pgrest-lambda evaluates policies and translates row-level conditions into SQL WHERE clauses — filtering happens in the database, not in application code
4. The entity schema is auto-generated from your PostgreSQL schema

## Project Layout

```
project/
├── migrations/        # Schema (SQL) — what the data looks like
│   ├── 001_create_users.sql
│   └── 002_create_todos.sql
├── policies/          # Access policies — who can access what
│   └── todos.cedar
└── .boa/
    └── config.json
```

## Default Behavior

Without any custom access policies, pgrest-lambda applies built-in defaults:
- Authenticated users can read/update/delete rows where `user_id` matches their ID
- Authenticated users can insert into any table
- `service_role` key bypasses all authorization
- Anonymous users (`anon` key without a bearer token) are denied by default

## Cedar Entity Model

Namespace: `PgrestLambda`

### Principals

| Type | When Used | Attributes |
|------|-----------|------------|
| `PgrestLambda::User` | Authenticated user (bearer token present) | `email` (String), `role` (String) |
| `PgrestLambda::ServiceRole` | Request with serviceRoleKey | None |
| `PgrestLambda::AnonRole` | Request with anonKey only (no bearer) | None |

The principal ID for `User` is the user's UUID (from the JWT `sub` claim).

### Actions

| Action | HTTP Method | Applies To |
|--------|-------------|------------|
| `PgrestLambda::Action::"select"` | GET | Table, Row |
| `PgrestLambda::Action::"insert"` | POST | Table, Row |
| `PgrestLambda::Action::"update"` | PATCH | Table, Row |
| `PgrestLambda::Action::"delete"` | DELETE | Table, Row |

### Resources

| Type | Represents | Attributes |
|------|-----------|------------|
| `PgrestLambda::Table` | A database table | Table name as the entity ID |
| `PgrestLambda::Row` | A specific row | All columns from the DB schema, auto-typed |

Row attributes are auto-mapped from PostgreSQL types:
- `text`, `varchar`, `uuid` → Cedar `String`
- `integer`, `smallint`, `bigint` → Cedar `Long`
- `boolean` → Cedar `Boolean`
- All others → Cedar `String`

Rows have a parent relationship: `resource in PgrestLambda::Table::"tablename"` checks if a row belongs to a specific table.

## Writing Access Policies

Create the `policies/` directory and add `.cedar` files:

```bash
mkdir -p policies
```

### Example 1: User-owned data (todo app)

The most common pattern — users can only access their own rows:

```cedar
// policies/todos.cedar

// Authenticated users can read/update/delete their own rows
permit(
    principal is PgrestLambda::User,
    action in [
        PgrestLambda::Action::"select",
        PgrestLambda::Action::"update",
        PgrestLambda::Action::"delete"
    ],
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};

// Authenticated users can create rows in any table
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
);

// Service role bypasses everything (admin/server-side)
permit(
    principal is PgrestLambda::ServiceRole,
    action,
    resource
);
```

### Example 2: Public read, private write (blog/social)

Posts are readable by everyone, but only authors can modify their own:

```cedar
// policies/posts.cedar

// Anyone can read posts (including anonymous)
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"posts"
};

// Only the author can update/delete their posts
permit(
    principal is PgrestLambda::User,
    action in [
        PgrestLambda::Action::"update",
        PgrestLambda::Action::"delete"
    ],
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"posts" &&
    resource has user_id && resource.user_id == principal
};

// Authenticated users can create posts
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"posts"
};
```

### Example 3: Role-based access (admin panel)

Different access levels based on user role:

```cedar
// policies/admin.cedar

// Admins can do anything
permit(
    principal is PgrestLambda::User,
    action,
    resource
) when {
    principal.role == "admin"
};

// Regular users can only read
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    principal.role == "member"
};
```

### Example 4: Table-specific permissions (e-commerce)

Different policies for different tables. Use `has` as a schema guard (see SQL Translation Reference) so each rule only applies to the table that owns its distinguishing column:

```cedar
// policies/shop.cedar

// Anyone can browse products. `sku` only exists on products, so this rule
// is inert on other tables.
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has sku
};

// Users can manage their own cart. `cart_id` only exists on cart_items.
permit(
    principal is PgrestLambda::User,
    action,
    resource is PgrestLambda::Row
) when {
    resource has cart_id && resource has user_id && resource.user_id == principal
};

// Users can view their own orders (read-only). `order_number` only exists
// on orders.
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has order_number && resource.buyer_id == principal
};
```

Pick a column that uniquely identifies the table (primary identifier, a
column only that table has) as the `has` guard — don't rely on generic
names like `user_id` that several tables share.

### Example 5: Public-optional rows (social feeds, published/draft)

The most common real-world shape: a single table where **some rows are public and some are private**. Posts, documents, notes, sharing links.

The trick is to write SELECT permits as a pair — one for the public flag, one for owner access — against a single uniform column set (`user_id`, `is_public`) that every app table shares. This compiles into a clean SQL filter like:

```sql
SELECT * FROM posts WHERE is_public = true OR user_id = $1
```

```cedar
// policies/social.cedar

// 1. Anyone (anon or authenticated) can read rows flagged public.
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has is_public && resource.is_public == true
};

// 2. The owner can always read their own rows — including private ones.
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};

// 3. Authenticated users can insert into any table.
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
);

// 4. Owner-only update / delete.
permit(
    principal is PgrestLambda::User,
    action in [
        PgrestLambda::Action::"update",
        PgrestLambda::Action::"delete"
    ],
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};
```

#### Schema convention to match

Give every app table both columns, even when `is_public` doesn't logically vary (e.g., `profiles`, `likes` — set them all `TRUE`). One uniform rule beats five table-specific ones, and `has` makes mismatches harmless.

```sql
-- posts: the column varies per row
CREATE TABLE posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles: always public, but the column still exists so the policy applies
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  handle TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Gotcha: backfilling a new column

DSQL does not allow `ALTER TABLE ... ADD COLUMN ... DEFAULT <value>`. If you add `is_public` to an existing table, the column is `NULL` for every existing row, and policy rule (1) above treats `NULL` as `FALSE` — so anonymous reads silently return zero rows.

Run the backfill in the same migration:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_public BOOLEAN;
UPDATE posts SET is_public = FALSE WHERE is_public IS NULL;
```

And set the value explicitly on insert from the client — don't rely on a `DEFAULT` that DSQL won't apply to `ALTER`-added columns on existing rows.

## Deploying Access Policies

After writing or updating access policies, redeploy:

```bash
boa deploy
```

The deploy script copies `policies/` into the Lambda build automatically. Changes take effect on next Lambda cold start, or within 5 minutes via the policy cache TTL.

## How Access Policies Become SQL

Access policies with row-level conditions are **partially evaluated** and translated into SQL WHERE clauses. This means filtering happens in the database, not in application code.

Example: A policy with `resource.user_id == principal` for a `select` action becomes:

```sql
SELECT * FROM todos WHERE user_id = $1  -- $1 = authenticated user's ID
```

This is efficient — the database only returns rows the user is authorized to see. There's no post-query filtering.

## Explaining Access Policies

To explain how access policies affect a specific request, trace through:

1. **Principal**: What type? `User` (authenticated), `AnonRole` (anon key only), or `ServiceRole`?
2. **Action**: What HTTP method? GET → `select`, POST → `insert`, PATCH → `update`, DELETE → `delete`
3. **Resource**: Which table? Which row (if applicable)?
4. **Conditions**: Do the `when` clauses match?
5. **Result**: If any `permit` policy matches → allowed. If no policy matches → denied (default deny).

Access policies are deny by default: if no policy explicitly permits the request, it is denied.

## SQL Translation Reference

Row-level policies (those with `resource is PgrestLambda::Row`) must translate to a SQL `WHERE` clause. Not every Cedar expression can. Use this table to stay on the supported path.

### Translates cleanly

| Cedar | SQL | Notes |
|-------|-----|-------|
| `resource.col == value` | `"col" = $1` | value can be a literal or `principal` |
| `resource.col != value` | `"col" != $1` | |
| `resource.col > N` etc. | `"col" > $1` | `>`, `>=`, `<`, `<=` |
| `cond1 && cond2` | `cond1 AND cond2` | |
| `cond1 \|\| cond2` | `cond1 OR cond2` | |
| `!cond` | `NOT cond` | |
| `resource has col` | `"col" IS NOT NULL` **if the table has that column**; otherwise the whole policy short-circuits to `FALSE` and is skipped for that table | See "Per-table scoping" below |

### Does NOT translate in row-level SELECT / UPDATE / DELETE

These throw `PGRST000 — unsupported operator` the first time anyone queries a table where the rule could apply:

| Cedar | Why it breaks |
|-------|---------------|
| `resource in PgrestLambda::Table::"name"` | The engine can't express "row belongs to table X" as a SQL predicate against an already-scoped query. Use column-based scoping instead (see below). Fine on `Table` resources — `resource == Table::"x"` works for `insert` policies. |
| `resource.col == otherResource.col` | Only column-vs-value is supported. |
| `resource.col.contains(...)`, `.like(...)`, `in [...]` | Set/string operators are not translated. |

### How `has` actually works

`resource has col` is the safest way to scope a policy to tables that have a particular column. The engine checks the live schema:

- If the table being queried **has** `col`: translates to `"col" IS NOT NULL`.
- If the table being queried **does not have** `col`: the entire conjunction short-circuits to `FALSE` — the policy simply doesn't apply to that table. No error.

This makes `has` the idiomatic per-table guard: `resource has user_id && resource.user_id == principal` safely scopes to tables that have `user_id`, is inert on tables without it, and compiles to `user_id = $1`.

### Per-table scoping: what to use

For SELECT/UPDATE/DELETE policies (row-level), prefer column-based guards:

```cedar
// Good — uses `has` as a schema guard. Compiles cleanly on every table,
// applies only to tables with `user_id`.
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource has user_id && resource.user_id == principal
};
```

```cedar
// Broken — `in PgrestLambda::Table::"x"` throws at query time in row-level
// SELECT. This shape works for INSERT (resource is a Table, not a Row) but
// not for row-level policies.
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"posts"
};
```

For INSERT policies (`resource is PgrestLambda::Table`), the table form is correct:

```cedar
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"posts"
};
```

### Column-uniformity tip

If you want a single short policy set to cover every app table, make the tables share the column names the policies reference (`user_id` for ownership, `is_public` for the read flag). Tables that don't logically need `is_public` can still have the column set to `TRUE` so the uniform rule applies. This trades a little schema redundancy for one-source-of-truth policies and avoids `has`-guard stacking.

## Supported Operators in Conditions

See the SQL Translation Reference above for the authoritative list.

## Verifying Access Policies

**Write the verification before you tell the developer the backend is done.** Policies are the single place most BOA app backends go wrong — the schema compiles, the deploy succeeds, the policy "looks right," and the app still leaks or hides data. The cheapest insurance is a short curl script that asserts the access matrix holds.

### When to run it

- After the first policy deploy for a new app.
- After *any* change to `policies/*.cedar`.
- After *any* migration that adds or renames a column referenced by a policy.

### The pattern: an access matrix

Enumerate the table × principal × action combinations your policies are supposed to enforce, then curl each one and assert the expected HTTP status or row count. Two users (A and B) are enough to cover owner / not-owner / anon for any table.

For a "public-optional rows" table like `posts`, the matrix is:

| Principal | Action | Target | Expected |
|-----------|--------|--------|----------|
| anon | SELECT | A's public post | 200, row returned |
| anon | SELECT | A's private post | 200, row absent |
| A | SELECT | own private post | 200, row returned |
| B | SELECT | A's private post | 200, row absent (filtered, not 403) |
| B | UPDATE | A's post | 200 but 0 rows affected (filtered) |
| B | DELETE | A's post | 200 but 0 rows affected (filtered) |
| A | DELETE | own post | 200, 1 row affected |
| anon | INSERT | posts | 401 or 403 |
| A | INSERT | posts | 201 |

Note the two different "denied" shapes. The engine filters row-level reads into the `WHERE` clause — unauthorized rows are *invisible*, not *rejected*. So UPDATE/DELETE of another user's row succeed with zero rows affected, not with 403. Test for that, not for HTTP errors.

### Template

Copy this into `scripts/verify-policies.sh` (or just paste into a shell session). Fill in the matrix rows for your tables.

```bash
#!/usr/bin/env bash
set -eu
API_URL=$(jq -r .apiUrl .boa/config.json)
ANON=$(jq -r .anonKey .boa/config.json)

# --- signup two users ------------------------------------------------------
signup() {
  curl -s -X POST "$API_URL/auth/v1/signup" \
    -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"VerifyPolicies!1\"}"
}
A=$(signup "verify-a-$(date +%s)@test.local")
B=$(signup "verify-b-$(date +%s)@test.local")
A_TOKEN=$(echo "$A" | jq -r .access_token); A_ID=$(echo "$A" | jq -r .user.id)
B_TOKEN=$(echo "$B" | jq -r .access_token); B_ID=$(echo "$B" | jq -r .user.id)

# --- seed: A writes one public and one private row -------------------------
POST() {  # POST table body_json token
  curl -s -X POST "$API_URL/rest/v1/$1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $3" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "$2"
}
PUB=$(POST posts "{\"user_id\":\"$A_ID\",\"is_public\":true,\"body\":\"pub\"}"  "$A_TOKEN" | jq -r .[0].id)
PRV=$(POST posts "{\"user_id\":\"$A_ID\",\"is_public\":false,\"body\":\"prv\"}" "$A_TOKEN" | jq -r .[0].id)

# --- assertion helpers -----------------------------------------------------
fail=0
assert_eq() {  # label expected actual
  if [ "$2" != "$3" ]; then
    printf '  ✗ %-50s expected=%s got=%s\n' "$1" "$2" "$3"; fail=$((fail+1))
  else
    printf '  ✓ %s\n' "$1"
  fi
}
count() {  # GET query token → row count
  local url="$API_URL/rest/v1/$1"
  local tok="${2:-}"
  local auth=()
  [ -n "$tok" ] && auth=(-H "Authorization: Bearer $tok")
  curl -s "$url" -H "apikey: $ANON" "${auth[@]}" | jq 'length'
}
status() {  # method path token body → HTTP status
  local method="$1" path="$2" tok="${3:-}" body="${4:-}"
  local auth=() data=()
  [ -n "$tok" ]  && auth=(-H "Authorization: Bearer $tok")
  [ -n "$body" ] && data=(-H "Content-Type: application/json" -d "$body")
  curl -s -o /dev/null -w '%{http_code}' -X "$method" "$API_URL/rest/v1/$path" \
    -H "apikey: $ANON" "${auth[@]}" "${data[@]}"
}

# --- matrix ---------------------------------------------------------------
echo "SELECT posts"
assert_eq "anon sees only public"          1 "$(count "posts"             "")"
assert_eq "B sees only A's public"         1 "$(count "posts"             "$B_TOKEN")"
assert_eq "A sees own public + private"    2 "$(count "posts"             "$A_TOKEN")"

echo "UPDATE / DELETE filtering (not rejection)"
assert_eq "B update on A's row → 0 rows"   "[]" \
  "$(curl -s -X PATCH "$API_URL/rest/v1/posts?id=eq.$PUB" \
      -H "apikey: $ANON" -H "Authorization: Bearer $B_TOKEN" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" \
      -d '{"body":"pwned"}')"
assert_eq "A update on own row → 1 row"    1 \
  "$(curl -s -X PATCH "$API_URL/rest/v1/posts?id=eq.$PUB" \
      -H "apikey: $ANON" -H "Authorization: Bearer $A_TOKEN" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" \
      -d '{"body":"updated"}' | jq 'length')"

echo "INSERT authorization"
assert_eq "anon INSERT denied"             401 "$(status POST posts ''        '{"user_id":"x","body":"nope"}')"
assert_eq "A INSERT allowed"               201 "$(status POST posts $A_TOKEN  "{\"user_id\":\"$A_ID\",\"is_public\":true,\"body\":\"ok\"}")"

# --- cleanup ---------------------------------------------------------------
curl -s -X DELETE "$API_URL/rest/v1/posts?id=eq.$PUB" -H "apikey: $ANON" -H "Authorization: Bearer $A_TOKEN" > /dev/null
curl -s -X DELETE "$API_URL/rest/v1/posts?id=eq.$PRV" -H "apikey: $ANON" -H "Authorization: Bearer $A_TOKEN" > /dev/null

echo; [ $fail -eq 0 ] && echo "✓ access matrix holds" || { echo "✗ $fail failures"; exit 1; }
```

### Interpreting failures

| Symptom | Likely cause |
|---------|--------------|
| Anon sees 0 rows of a table that should be public | Policy references a column whose existing rows are `NULL` — run the backfill from [Example 5](#example-5-public-optional-rows-social-feeds-publisheddraft). |
| B sees A's private rows | The SELECT permit is missing the `is_public == true` guard, or matches on a column both users share. |
| UPDATE/DELETE of another user's row returns 200 with rows affected | The row-level filter in the SELECT permit doesn't apply to UPDATE/DELETE — you need an explicit `user_id == principal` permit for each action. |
| `PGRST000 unsupported operator 'in'` | A row-level SELECT/UPDATE/DELETE uses `resource in PgrestLambda::Table::"x"`. Swap to `resource has <unique-col>`. See [SQL Translation Reference](#sql-translation-reference). |
| `42703 column … does not exist` | A policy compares a column that doesn't exist on every queried table. Wrap the comparison in `resource has col && …`. |

### Make verification part of "done"

When the developer asks for an app, don't report it ready until the matrix passes. Add the check to the app's README so the developer (or the next agent) can re-run it after any policy change:

```
npm run verify-policies
```

## Policy File Organization

All `.cedar` files in the `policies/` directory are concatenated and evaluated together. Organize access policies by concern:

```
policies/
├── base.cedar        # Service role bypass, common rules
├── todos.cedar       # Todo table policies
├── posts.cedar       # Post table policies
└── admin.cedar       # Admin-only rules
```

Order doesn't matter — all policies are evaluated and a request is permitted if **any** policy matches.
