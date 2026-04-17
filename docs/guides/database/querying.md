# Querying Data

For most operations, use `@supabase/supabase-js` -- it handles filtering, sorting, and pagination through the REST API. Direct SQL is for Lambda functions that need complex queries, joins, or aggregations.

## REST API Queries (the Common Path)

The Supabase client translates method chains into PostgREST queries. No raw SQL needed for standard CRUD.

### Basic CRUD

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.API_URL, process.env.ANON_KEY)

// Create
await supabase.from('todos').insert({ user_id: userId, title: 'Buy groceries' })

// Read
const { data, error } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(20)

// Update
await supabase.from('todos').update({ completed: true }).eq('id', todoId)

// Delete
await supabase.from('todos').delete().eq('id', todoId)
```

Always check `error` in the response. Common causes: missing auth token (401), table doesn't exist (404), or constraint violation (409).

### Resource Embedding

If your FK columns follow the `_id` naming convention (`user_id`, `post_id`), pgrest-lambda auto-resolves relationships. Query related data in a single request:

```javascript
// Fetch posts with their comments and author display names
const { data } = await supabase
  .from('posts')
  .select('*, comments(*), users(display_name)')
  .order('created_at', { ascending: false })
  .limit(10)

// Fetch an order with its line items and product details
const { data: order } = await supabase
  .from('orders')
  .select('*, order_items(*, products(name, price))')
  .eq('id', orderId)
  .single()
```

This replaces SQL joins for most read operations. If the embedded data comes back empty, verify that your FK column follows the `_id` convention (e.g., `user_id` not `author`).

### Filtering

```javascript
// Multiple conditions
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', userId)
  .eq('completed', false)
  .order('priority', { ascending: false })

// Text search (ILIKE)
const { data } = await supabase
  .from('products')
  .select('*')
  .ilike('name', '%shoe%')

// Range
const { data } = await supabase
  .from('products')
  .select('*')
  .gte('price', 10)
  .lte('price', 50)

// In list
const { data } = await supabase
  .from('orders')
  .select('*')
  .in('status', ['pending', 'processing'])
```

### Pagination

For cursor-based pagination through the REST API, use range queries:

```javascript
// Page 1: items 0-19
const { data, count } = await supabase
  .from('todos')
  .select('*', { count: 'exact' })
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .range(0, 19)

// Page 2: items 20-39
const { data: page2 } = await supabase
  .from('todos')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .range(20, 39)
```

### Upsert

Insert or update in one call:

```javascript
await supabase.from('profiles').upsert(
  { id: userId, display_name: 'New Name', updated_at: new Date().toISOString() },
  { onConflict: 'id' }
)
```

## When to Use Direct SQL

Use direct SQL in Lambda functions when the REST API can't express what you need:

| Scenario | Why direct SQL |
|----------|---------------|
| Complex joins across 3+ tables | Resource embedding handles two levels; deeper nesting needs SQL |
| Aggregations (SUM, AVG, GROUP BY) | The REST API doesn't support aggregate functions |
| Full-text search with ranking | Requires `tsvector`, `ts_rank`, and custom index queries |
| Batch inserts (100+ rows) | Single REST insert is fine; bulk is faster with raw SQL |
| Transactions | REST operations are individual; SQL gives you `BEGIN`/`COMMIT` |
| Conditional updates | `UPDATE ... SET x = x + 1 WHERE ...` requires SQL |

## Direct SQL Queries (the Advanced Path)

These patterns run inside Lambda functions using the `pg` connection pool from [Connecting to Your Database](connecting.md).

### Basic CRUD

```javascript
const db = await getPool();

// Create
await db.query(
  'INSERT INTO todos (user_id, title) VALUES ($1, $2)',
  [userId, 'Buy groceries']
);

// Read
const { rows } = await db.query(
  'SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at DESC',
  [userId]
);

// Update
await db.query(
  'UPDATE todos SET completed = true WHERE id = $1 AND user_id = $2',
  [todoId, userId]
);

// Delete
await db.query(
  'DELETE FROM todos WHERE id = $1 AND user_id = $2',
  [todoId, userId]
);
```

Always include `user_id` in WHERE clauses to scope queries to the authenticated user.

### Cursor-Based Pagination

```javascript
async function listItems(userId, cursor, limit = 20) {
  const db = await getPool();
  let query = 'SELECT * FROM items WHERE user_id = $1';
  const params = [userId];

  if (cursor) {
    query += ' AND created_at < $2';
    params.push(cursor);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit + 1); // fetch one extra to detect hasMore

  const result = await db.query(query, params);
  const hasMore = result.rows.length > limit;
  const items = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].created_at : null,
  };
}
```

### Full-Text Search

```sql
-- Migration: add a tsvector column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX ASYNC IF NOT EXISTS idx_posts_search ON posts USING gin(search_vector);
```

```javascript
// Search query
const { rows } = await db.query(
  `SELECT * FROM posts
   WHERE search_vector @@ plainto_tsquery('english', $1)
   ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
   LIMIT 20`,
  [searchTerm]
);
```

Update the search vector when inserting or updating posts:

```javascript
await db.query(
  `INSERT INTO posts (user_id, title, content, search_vector)
   VALUES ($1, $2, $3, to_tsvector('english', $2 || ' ' || $3))`,
  [userId, title, content]
);
```

### Aggregation with Materialized Counts

For performance, maintain denormalized counts rather than running COUNT queries:

```javascript
// When adding a like
await db.query('BEGIN');
await db.query(
  'INSERT INTO likes (user_id, post_id) VALUES ($1, $2)',
  [userId, postId]
);
await db.query(
  'UPDATE posts SET like_count = like_count + 1 WHERE id = $1',
  [postId]
);
await db.query('COMMIT');
```

### Batch Inserts

Insert multiple rows in a single query for better performance:

```javascript
const values = items.map((item, i) => {
  const offset = i * 3;
  return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
}).join(', ');

const params = items.flatMap(item => [item.userId, item.title, item.completed]);

await db.query(
  `INSERT INTO todos (user_id, title, completed) VALUES ${values}`,
  params
);
```

## Next Step

Secure your data with authentication and authorization. See [Auth Overview](../auth/overview.md).
