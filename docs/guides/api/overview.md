# API

Every table in your database is automatically a REST endpoint. No routes to define, no controllers to write. Create a table, and it's queryable through `@supabase/supabase-js` or any HTTP client.

## What you get

| Method | Path | Operation |
|--------|------|-----------|
| `GET` | `/rest/v1/todos` | List rows (with filtering, sorting, pagination) |
| `GET` | `/rest/v1/todos?id=eq.abc123` | Get specific rows |
| `POST` | `/rest/v1/todos` | Insert one or many rows |
| `PATCH` | `/rest/v1/todos?id=eq.abc123` | Update matching rows |
| `DELETE` | `/rest/v1/todos?id=eq.abc123` | Delete matching rows |

These endpoints exist the moment you create a table and run `boa deploy`. No Lambda code needed for CRUD.

## How a request flows

```
Client (@supabase/supabase-js or fetch)
  → API Gateway (REST)
    → BOA Authorizer (validates JWT, extracts role + user ID)
      → Lambda (pgrest-lambda engine)
        → Aurora DSQL (serverless PostgreSQL)
```

1. **API Gateway** receives the HTTP request and routes it to the authorizer.
2. **BOA Authorizer** checks the `apikey` header and optional `Authorization: Bearer` token. It passes the user's role, ID, and email downstream as flat keys.
3. **pgrest-lambda** translates the REST request into SQL, applies access policies as WHERE clauses, and executes against DSQL.
4. DSQL returns rows. pgrest-lambda sends JSON back through the chain.

The full round trip adds roughly 50-100ms of overhead on cold starts. Warm requests (the common case) add 10-20ms over raw database latency.

## Using the API

### With @supabase/supabase-js (recommended)

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(API_URL, ANON_KEY)

// List with filtering
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .limit(20)

// Insert
await supabase.from('todos').insert({
  title: 'New task',
  user_id: user.id
})

// Update
await supabase.from('todos')
  .update({ completed: true })
  .eq('id', todoId)

// Delete
await supabase.from('todos')
  .delete()
  .eq('id', todoId)
```

### With fetch

```javascript
const response = await fetch(
  `${API_URL}/rest/v1/todos?completed=eq.false&order=created_at.desc&limit=20`,
  {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    }
  }
)
const todos = await response.json()
```

## API keys

BOA generates two keys during `boa init`:

| Key | Role | Use |
|-----|------|-----|
| `ANON_KEY` | `anon` | Frontend requests. Respects access policies. |
| `SERVICE_ROLE_KEY` | `service_role` | Server-side only. Bypasses all access policies. |

**Never expose `SERVICE_ROLE_KEY` in frontend code.** It grants unrestricted read/write access to every table. If it leaks, anyone can read or delete all your data. Use it only in Lambda functions and backend scripts.

Both keys are stored in `.boa/config.json` after init. Pass `ANON_KEY` as the second argument to `createClient` for all frontend code.

## Rate limits

API Gateway enforces a default throttle of 10,000 requests per second with a burst of 5,000. For most applications this is more than enough. If you need higher limits, request a quota increase through the AWS Console.

## Troubleshooting

**Getting empty results?** Your table probably has no access policies. Without at least one `permit` policy, pgrest-lambda returns no rows. See [Authorization and Access Policies](/docs/api/authorization).

**Getting 401 Unauthorized?** Check that you're passing the `apikey` header. With `@supabase/supabase-js` this happens automatically, but raw `fetch` calls need it explicitly.

**Getting 403 Forbidden?** Your access policies exist but deny the request. Check that the user's role and the resource match your policy conditions.

## Next step

[REST API Reference](/docs/api/rest) -- filtering, sorting, pagination, resource embedding, and upserts.
