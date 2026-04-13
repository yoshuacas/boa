# Authorization Policies (Cedar)

Cedar policies control who can access what data in your BOA backend. They replace traditional PostgreSQL Row-Level Security (RLS) with a policy-as-code approach that is faster (~5 microsecond evaluation via cedar-wasm), more readable, and version-controlled alongside your schema.

## How It Works

1. You write `.cedar` policy files in `policies/` in your project root
2. At deploy time, `boa deploy` bundles them with the Lambda
3. At runtime, pgrest-lambda evaluates policies and translates row-level conditions into SQL WHERE clauses — filtering happens in the database, not in application code
4. The schema for Cedar entities is auto-generated from your PostgreSQL schema

## Project Layout

```
project/
├── migrations/        # Schema (SQL) — what the data looks like
│   ├── 001_create_users.sql
│   └── 002_create_todos.sql
├── policies/          # Authorization (Cedar) — who can access what
│   └── todos.cedar
└── .boa/
    └── config.json
```

## Default Behavior

Without any custom policies, pgrest-lambda applies built-in defaults:
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

## Writing Policies

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

Different policies for different tables:

```cedar
// policies/shop.cedar

// Anyone can browse products
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"products"
};

// Users can manage their own cart
permit(
    principal is PgrestLambda::User,
    action,
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"cart_items" &&
    resource has user_id && resource.user_id == principal
};

// Users can view their own orders (read-only)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"orders" &&
    resource has buyer_id && resource.buyer_id == principal
};
```

## Deploying Policies

After writing or updating policies, redeploy:

```bash
boa deploy
```

The deploy script copies `policies/` into the Lambda build automatically. Changes take effect on next Lambda cold start, or within 5 minutes via the policy cache TTL.

## How Policies Become SQL

Cedar policies with row-level conditions are **partially evaluated** and translated into SQL WHERE clauses. This means filtering happens in the database, not in application code.

Example: A policy with `resource.user_id == principal` for a `select` action becomes:

```sql
SELECT * FROM todos WHERE user_id = $1  -- $1 = authenticated user's ID
```

This is efficient — the database only returns rows the user is authorized to see. There's no post-query filtering.

## Explaining Policies

To explain how policies affect a specific request, trace through:

1. **Principal**: What type? `User` (authenticated), `AnonRole` (anon key only), or `ServiceRole`?
2. **Action**: What HTTP method? GET → `select`, POST → `insert`, PATCH → `update`, DELETE → `delete`
3. **Resource**: Which table? Which row (if applicable)?
4. **Conditions**: Do the `when` clauses match?
5. **Result**: If any `permit` policy matches → allowed. If no policy matches → denied (default deny).

Cedar is default-deny: if no policy explicitly permits the request, it is denied.

## Supported Cedar Operators in Conditions

| Operator | Cedar Syntax | SQL Translation |
|----------|-------------|-----------------|
| Equality | `resource.col == "value"` | `col = 'value'` |
| Inequality | `resource.col != "value"` | `col != 'value'` |
| Greater than | `resource.col > 100` | `col > 100` |
| Less than | `resource.col < 100` | `col < 100` |
| And | `cond1 && cond2` | `cond1 AND cond2` |
| Or | `cond1 \|\| cond2` | `cond1 OR cond2` |
| Not | `!cond` | `NOT cond` |
| Has attribute | `resource has col` | `col IS NOT NULL` |
| Table membership | `resource in Table::"name"` | Table-level filter |

## Policy File Organization

All `.cedar` files in the `policies/` directory are concatenated and evaluated together. Organize by concern:

```
policies/
├── base.cedar        # Service role bypass, common rules
├── todos.cedar       # Todo table policies
├── posts.cedar       # Post table policies
└── admin.cedar       # Admin-only rules
```

Order doesn't matter — Cedar evaluates all policies and permits if **any** policy matches.
