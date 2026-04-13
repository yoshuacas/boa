# Authorization and Access Policies

Authorization controls who can read and write what. BOA uses Cedar, a policy language that evaluates in microseconds. Every table needs at least one policy -- without policies, the REST API returns empty results for that table.

## How it works

1. Every request passes through the BOA Authorizer, which validates the JWT and extracts the user's role, ID, and email.
2. pgrest-lambda evaluates your Cedar policies against the request.
3. Row-level conditions in policies become SQL WHERE clauses -- filtering happens in the database, not application code.
4. If no policy permits the request, it is denied. Default deny.

The developer never writes WHERE clauses for authorization. A policy like "users can only read their own todos" automatically adds `WHERE user_id = $1` to every query on that table.

## Roles

| Role | When it applies | What it means |
|------|----------------|---------------|
| `anon` | Request has `ANON_KEY` but no JWT | Unauthenticated visitor. Denied by default unless a policy explicitly permits anonymous access. |
| `authenticated` | Request has a valid JWT from a signed-in user | Signed-in user. Most policies target this role. |
| `service_role` | Request uses `SERVICE_ROLE_KEY` | Bypasses all policies. Server-side admin access only. |

## Writing policies

Create `.cedar` files in the `policies/` directory at your project root:

```
project/
├── migrations/
├── policies/
│   ├── base.cedar       # Service role bypass, common rules
│   ├── todos.cedar      # Todo table policies
│   └── posts.cedar      # Post table policies
└── .boa/config.json
```

All `.cedar` files are loaded together. A request is permitted if **any** policy matches. Order doesn't matter.

After writing or updating policies, run `boa deploy` to bundle them with the Lambda. Changes take effect on the next cold start or within 5 minutes via the policy cache TTL.

## Cedar entity model

### Principals

| Type | When used | Attributes |
|------|-----------|------------|
| `PgrestLambda::User` | Authenticated user (JWT present) | `email` (String), `role` (String) |
| `PgrestLambda::ServiceRole` | Request with `SERVICE_ROLE_KEY` | None |
| `PgrestLambda::AnonRole` | Request with `ANON_KEY` only | None |

The principal ID for `User` is the user's UUID from the JWT `sub` claim.

### Actions

| Action | HTTP method |
|--------|-------------|
| `PgrestLambda::Action::"select"` | GET |
| `PgrestLambda::Action::"insert"` | POST |
| `PgrestLambda::Action::"update"` | PATCH |
| `PgrestLambda::Action::"delete"` | DELETE |

### Resources

| Type | Represents | Attributes |
|------|-----------|------------|
| `PgrestLambda::Table` | A database table | Table name as entity ID |
| `PgrestLambda::Row` | A specific row | All columns, auto-mapped from PostgreSQL types |

Row attributes are auto-mapped: `text`/`varchar`/`uuid` become Cedar `String`, `integer`/`bigint` become `Long`, `boolean` becomes `Boolean`.

Use `resource in PgrestLambda::Table::"tablename"` to scope a policy to a specific table.

## Common patterns

### Own-data-only (todo app, notes, personal data)

The most common pattern. Users see and modify only their own rows:

```cedar
// policies/todos.cedar

// Read, update, delete own rows
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

// Insert into any table
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
);

// Service role bypasses everything
permit(
    principal is PgrestLambda::ServiceRole,
    action,
    resource
);
```

With this policy, `supabase.from('todos').select('*')` returns only the current user's todos -- no `.eq('user_id', userId)` needed.

### Public read, private write (blog, marketplace, social)

Anyone can browse. Only the author can edit or delete:

```cedar
// policies/posts.cedar

// Anyone can read posts (including anonymous visitors)
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"posts"
};

// Only the author can update or delete
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

### Role-based access (admin panel, team app)

Different capabilities based on a role stored in the user's profile:

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

// Members can only read
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    principal.role == "member"
};
```

### Table-specific permissions (e-commerce)

Different rules for different tables in the same app:

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

// Users manage their own cart
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

## How policies become SQL

Cedar conditions with row attributes are partially evaluated and translated into SQL WHERE clauses at query time:

| Cedar condition | SQL WHERE clause |
|----------------|------------------|
| `resource.user_id == principal` | `user_id = $1` (user's UUID) |
| `resource.status == "active"` | `status = 'active'` |
| `resource.price > 100` | `price > 100` |
| `cond1 && cond2` | `cond1 AND cond2` |
| `resource has col` | `col IS NOT NULL` |

This means filtering happens in the database. DSQL only returns rows the user is authorized to see -- there's no post-query filtering in application code.

## Supported operators

| Operator | Cedar syntax | SQL translation |
|----------|-------------|-----------------|
| Equality | `resource.col == "value"` | `col = 'value'` |
| Inequality | `resource.col != "value"` | `col != 'value'` |
| Greater than | `resource.col > 100` | `col > 100` |
| Less than | `resource.col < 100` | `col < 100` |
| And | `cond1 && cond2` | `cond1 AND cond2` |
| Or | `cond1 \|\| cond2` | `cond1 OR cond2` |
| Not | `!cond` | `NOT cond` |
| Has attribute | `resource has col` | `col IS NOT NULL` |
| Table membership | `resource in Table::"name"` | Table-level scope |

## Accessing user info in custom handlers

The BOA Authorizer passes flat keys in the event context. Use these in custom Lambda functions:

```javascript
export async function handler(event) {
  const role = event.requestContext.authorizer.role;       // 'anon' | 'authenticated' | 'service_role'
  const userId = event.requestContext.authorizer.userId;   // UUID or '' for anon
  const email = event.requestContext.authorizer.email;     // email or ''
}
```

Do **not** use `event.requestContext.authorizer.claims.sub` -- that is the old Cognito authorizer format. BOA uses flat keys.

## Protected vs public routes

By default, all routes require authentication. To make a route public (webhooks, health checks), set `Auth: NONE` in the SAM template:

```yaml
StripeWebhookFunction:
  Type: AWS::Serverless::Function
  Properties:
    Events:
      Api:
        Type: Api
        Properties:
          Path: /functions/v1/stripe-webhook
          Method: POST
          Auth:
            Authorizer: NONE
```

## Troubleshooting

**Empty results but no error?** The table has no matching `permit` policy. Every table needs at least one policy that covers `select`. Add a policy to `policies/` and run `boa deploy`.

**403 on insert?** Insert policies target `PgrestLambda::Table`, not `PgrestLambda::Row`. Make sure your insert policy uses `resource is PgrestLambda::Table`.

**Policy changes not taking effect?** Policies are cached for up to 5 minutes. Wait for the cache to expire, or trigger a cold start by updating the Lambda configuration.

## Next step

[File Storage](/docs/storage/overview) -- upload and download files through presigned URLs.
