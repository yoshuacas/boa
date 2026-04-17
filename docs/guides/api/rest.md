# REST API Reference

BOA's REST API is PostgREST-compatible. If you've used Supabase, you already know the syntax.

Every example shows the `@supabase/supabase-js` call first, then the raw HTTP equivalent.

## Selecting columns

Return only the columns you need to reduce payload size:

```javascript
const { data } = await supabase
  .from('users')
  .select('id, email, display_name')
```

```
GET /rest/v1/users?select=id,email,display_name
```

## Resource embedding (joins)

Fetch related data in a single request. If you have a `posts` table with a foreign key to `comments`, you can fetch both:

```javascript
// Fetch posts with their comments
const { data } = await supabase
  .from('posts')
  .select('*, comments(*)')

// Fetch specific columns from the related table
const { data } = await supabase
  .from('posts')
  .select('id, title, comments(id, body, created_at)')

// Nested embedding — posts with comments and comment authors
const { data } = await supabase
  .from('posts')
  .select('*, comments(*, users(display_name))')
```

```
GET /rest/v1/posts?select=*,comments(*)
GET /rest/v1/posts?select=id,title,comments(id,body,created_at)
```

Resource embedding follows foreign key relationships automatically. If the relationship doesn't exist in your schema, the query returns an error.

## Filtering

Use query parameters to filter results. The format is `column=operator.value`:

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `?status=eq.active` |
| `neq` | Not equals | `?status=neq.deleted` |
| `gt` | Greater than | `?price=gt.100` |
| `gte` | Greater than or equal | `?created_at=gte.2026-01-01` |
| `lt` | Less than | `?price=lt.50` |
| `lte` | Less than or equal | `?quantity=lte.0` |
| `like` | Pattern match (case-sensitive) | `?name=like.*phone*` |
| `ilike` | Pattern match (case-insensitive) | `?name=ilike.*phone*` |
| `in` | In list | `?status=in.(active,pending)` |
| `is` | Is null/true/false | `?deleted_at=is.null` |

### With @supabase/supabase-js

```javascript
const { data } = await supabase
  .from('products')
  .select('*')
  .gte('price', 10)
  .lte('price', 100)
  .eq('category', 'electronics')
  .is('deleted_at', null)
```

### With fetch

```
GET /rest/v1/products?price=gte.10&price=lte.100&category=eq.electronics&deleted_at=is.null
```

## Sorting

```javascript
const { data } = await supabase
  .from('posts')
  .select('*')
  .order('created_at', { ascending: false })
```

```
GET /rest/v1/posts?order=created_at.desc
```

Multiple sort columns:

```javascript
const { data } = await supabase
  .from('posts')
  .select('*')
  .order('priority', { ascending: false })
  .order('created_at', { ascending: false })
```

```
GET /rest/v1/posts?order=priority.desc,created_at.desc
```

## Pagination

### Limit and offset

```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .range(0, 19)  // rows 0-19 (first 20)
```

```
GET /rest/v1/todos?limit=20&offset=0
```

### Cursor-based (recommended for large datasets)

Offset pagination gets slower as offset grows because the database still scans skipped rows. Use a filter on the sort column instead:

```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .lt('created_at', lastItem.created_at)
  .order('created_at', { ascending: false })
  .limit(20)
```

## Inserting data

```javascript
// Single insert
const { data, error } = await supabase
  .from('todos')
  .insert({ title: 'New task', user_id: userId })
  .select()  // return the inserted row

// Bulk insert
const { data, error } = await supabase
  .from('todos')
  .insert([
    { title: 'Task 1', user_id: userId },
    { title: 'Task 2', user_id: userId },
  ])
```

## Upsert

Insert a row or update it if a row with the same primary key already exists:

```javascript
// Insert or update based on primary key
const { data, error } = await supabase
  .from('todos')
  .upsert({ id: existingId, title: 'Updated title', user_id: userId })
  .select()

// Bulk upsert
const { data, error } = await supabase
  .from('todos')
  .upsert([
    { id: 'id-1', title: 'First', user_id: userId },
    { id: 'id-2', title: 'Second', user_id: userId },
  ])
```

The upsert matches on the primary key by default. If you need to match on a different column, pass `onConflict`:

```javascript
const { data, error } = await supabase
  .from('profiles')
  .upsert(
    { email: 'user@example.com', display_name: 'Updated Name' },
    { onConflict: 'email' }
  )
```

## Count queries

Get the total number of matching rows without fetching the data:

```javascript
// Count only (no rows returned)
const { count, error } = await supabase
  .from('todos')
  .select('*', { count: 'exact', head: true })

// Count with data
const { data, count, error } = await supabase
  .from('todos')
  .select('*', { count: 'exact' })
  .eq('completed', false)
```

The `head: true` option sends a HEAD request, so the database counts rows but doesn't return them. Use this for dashboards and pagination controls.

## Updating data

```javascript
const { data, error } = await supabase
  .from('todos')
  .update({ completed: true })
  .eq('id', todoId)
  .select()
```

Always include a filter (`.eq()`, `.in()`, etc.) on updates. An update without a filter modifies every row in the table.

## Deleting data

```javascript
const { error } = await supabase
  .from('todos')
  .delete()
  .eq('id', todoId)
```

Like updates, always include a filter. A delete without a filter removes every row.

## Error handling

The API returns standard HTTP status codes:

| Code | Meaning | Common cause |
|------|---------|--------------|
| `200` | Success | |
| `201` | Created | |
| `400` | Bad request | Invalid filter syntax, missing required column |
| `401` | Unauthorized | Missing or expired token |
| `403` | Forbidden | Access policy denied the request |
| `404` | Not found | Table doesn't exist (check spelling, run `boa deploy`) |
| `409` | Conflict | Unique constraint violation |
| `500` | Internal server error | Check CloudWatch Logs for the Lambda |

Error responses include a message and PostgreSQL error code when applicable:

```json
{
  "message": "duplicate key value violates unique constraint",
  "code": "23505"
}
```

Handle errors in your frontend:

```javascript
const { data, error } = await supabase
  .from('todos')
  .insert({ title: 'New task' })

if (error) {
  if (error.code === '23505') {
    // Duplicate — show a user-friendly message
  } else {
    console.error('Insert failed:', error.message)
  }
}
```

## Next step

[Authorization and Access Policies](/docs/api/authorization) -- control who can read and write what.
