# REST API Reference

The pgrest-lambda engine introspects your database schema at runtime and auto-generates a full PostgREST-compatible REST API. No custom code needed — every table is immediately available as an endpoint after running migrations.

## Endpoints

```
GET    /rest/v1/<table>                — list rows
GET    /rest/v1/<table>?id=eq.<value>  — get single row
POST   /rest/v1/<table>                — insert rows
PATCH  /rest/v1/<table>?id=eq.<value>  — update rows
DELETE /rest/v1/<table>?id=eq.<value>  — delete rows
GET    /rest/v1/                       — OpenAPI spec (JSON)
GET    /rest/v1/_docs                  — interactive API docs (Scalar UI)
POST   /rest/v1/_refresh               — refresh schema cache
```

## Authentication Headers

Every request requires an `apikey` header. For authenticated users, add a bearer token:

```bash
curl "$API_URL/rest/v1/todos" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_TOKEN"
```

- **anonKey** — role `anon`, for unauthenticated/public access
- **serviceRoleKey** — role `service_role`, bypasses authorization (server-side only)

Both keys are in `.boa/config.json` after running `bootstrap.sh`.

## Filtering

PostgREST query syntax: `?column=operator.value`

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | equals | `?status=eq.active` |
| `neq` | not equals | `?status=neq.deleted` |
| `gt` | greater than | `?price=gt.100` |
| `gte` | greater than or equal | `?price=gte.100` |
| `lt` | less than | `?price=lt.50` |
| `lte` | less than or equal | `?price=lte.50` |
| `like` | pattern match (% wildcard) | `?name=like.*smith*` |
| `ilike` | case-insensitive pattern | `?name=ilike.*smith*` |
| `is` | null check | `?deleted_at=is.null` |
| `in` | in a list | `?status=in.(active,pending)` |

### Multiple filters

Combine filters with `&` (all conditions must match):

```bash
curl "$API_URL/rest/v1/todos?user_id=eq.$USER_ID&completed=eq.false" \
  -H "apikey: $ANON_KEY"
```

## Ordering

```bash
# Single column
?order=created_at.desc

# Multiple columns
?order=status.asc,created_at.desc
```

## Pagination

```bash
# Offset-based
?limit=10&offset=20

# Get total count with Content-Range header
curl "$API_URL/rest/v1/todos?limit=10" \
  -H "apikey: $ANON_KEY" \
  -H "Prefer: count=exact"
# Response header: Content-Range: 0-9/42
```

## Select columns

```bash
# Return only specific columns
?select=id,title,completed

# All columns (default)
?select=*
```

## Request Headers

| Header | Value | Effect |
|--------|-------|--------|
| `Prefer: return=representation` | On INSERT/UPDATE/DELETE | Return the affected row(s) in the response |
| `Prefer: count=exact` | On GET | Include total count in `Content-Range` header |
| `Accept: application/vnd.pgrst.object+json` | On GET | Return single object instead of array (404 if not found) |

## Insert

```bash
# Single row
curl -X POST "$API_URL/rest/v1/todos" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"title": "Buy milk", "user_id": "'$USER_ID'"}'

# Upsert (insert or update on conflict)
curl -X POST "$API_URL/rest/v1/todos?on_conflict=id" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"id": "existing-id", "title": "Updated title"}'
```

## Update

```bash
curl -X PATCH "$API_URL/rest/v1/todos?id=eq.$TODO_ID" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"completed": true}'
```

## Delete

```bash
curl -X DELETE "$API_URL/rest/v1/todos?id=eq.$TODO_ID" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN"
```

## Using @supabase/supabase-js

The REST API is fully compatible with `@supabase/supabase-js`:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(apiUrl, anonKey);

// Read
const { data: todos } = await supabase
  .from('todos')
  .select('*')
  .eq('completed', false)
  .order('created_at', { ascending: false })
  .limit(10);

// Insert
const { data } = await supabase
  .from('todos')
  .insert({ title: 'Buy milk', user_id: userId })
  .select();

// Update
const { data } = await supabase
  .from('todos')
  .update({ completed: true })
  .eq('id', todoId)
  .select();

// Delete
await supabase.from('todos').delete().eq('id', todoId);

// Count
const { count } = await supabase
  .from('todos')
  .select('*', { count: 'exact', head: true });
```

## Resource Embedding (fetching related data)

Fetch related data in a single request instead of making multiple API calls. Use parenthetical syntax in the `select` parameter to embed related tables.

### How relationships are detected

BOA uses Aurora DSQL which doesn't support foreign key constraints. pgrest-lambda discovers relationships automatically through **column naming conventions**: any column ending in `_id` maps to the corresponding table.

```
player_id   → players table
game_id     → games table
category_id → categories table (y→ies)
address_id  → addresses table (s→es)
```

No configuration needed — just follow the `_id` naming convention in your migrations.

### Many-to-one (fetch parent)

A game_stat row has a `player_id` — fetch the player data with it:

```javascript
const { data } = await supabase
  .from('game_stats')
  .select('goals, assists, players(name, jersey_number)')
  .eq('game_id', gameId);

// [{ goals: 2, assists: 1, players: { name: "Alice", jersey_number: 10 } }, ...]
```

### One-to-many (fetch children)

A game has many game_stats — fetch them all:

```javascript
const { data: game } = await supabase
  .from('games')
  .select('*, game_stats(goals, assists, minutes_played)')
  .eq('id', gameId)
  .single();

// { id: "abc", opponent: "City FC", game_stats: [{ goals: 2, ... }, { goals: 0, ... }] }
```

### Nested embedding (2+ levels)

Fetch games with stats and each stat's player — one request:

```javascript
const { data: games } = await supabase
  .from('games')
  .select('opponent_name, home_score, away_score, game_stats(goals, assists, players(name, position))');
```

### Aliased embeds

```javascript
const { data } = await supabase
  .from('game_stats')
  .select('goals, scorer:players(name)')
// [{ goals: 2, scorer: { name: "Alice" } }]
```

### Inner join (only rows with matches)

```javascript
// Only games that have at least one game_stat entry
const { data } = await supabase
  .from('games')
  .select('*, game_stats!inner(goals)')
```

### Disambiguation (multiple _id columns to same table)

When a table has two columns pointing to the same table, use `!hint`:

```javascript
const { data } = await supabase
  .from('orders')
  .select('*, billing:addresses!billing_address_id(*), shipping:addresses!shipping_address_id(*)')
```

### Full example (game detail page in one query)

```javascript
const { data: game } = await supabase
  .from('games')
  .select(`
    id, opponent_name, game_date, location, home_score, away_score,
    game_stats (
      goals, assists, minutes_played, yellow_cards, red_cards,
      players (name, jersey_number, position)
    )
  `)
  .eq('id', gameId)
  .single();
```

### Column naming convention (required for DSQL)

For embedding to work, name foreign key columns with the `_id` suffix:

```sql
-- GOOD: _id suffix enables automatic relationship detection
CREATE TABLE game_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game_id TEXT NOT NULL,      -- links to 'games' table
  player_id TEXT NOT NULL,    -- links to 'players' table
  goals INTEGER DEFAULT 0
);

-- BAD: these won't be detected as relationships
CREATE TABLE game_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game TEXT NOT NULL,          -- no _id suffix, won't link
  player TEXT NOT NULL,        -- no _id suffix, won't link
  goals INTEGER DEFAULT 0
);
```

## Error Responses

All errors follow PostgREST format:

```json
{
  "code": "PGRST204",
  "message": "Column 'nonexistent' not found",
  "details": null,
  "hint": null
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad request (invalid filter, missing required field) |
| 401 | Missing or invalid apikey/bearer token |
| 403 | Authorization denied by Cedar policy |
| 404 | Row not found (with single-object Accept header) |
| 409 | Conflict (unique constraint violation) |
| 500 | Server error |

## Schema Cache

The engine caches database schema for 5 minutes (configurable). After adding tables or columns via migrations, the cache refreshes automatically when `migrate.sh` runs. To force a manual refresh:

```bash
curl -X POST "$API_URL/rest/v1/_refresh" -H "apikey: $SERVICE_ROLE_KEY"
```
