# BOA Architecture Patterns

Example schema and architecture patterns using the BOA stack (Aurora DSQL + Cognito + Lambda + API Gateway + S3). These are starting points — BOA works for any app that needs a serverless backend, not just these examples.

---

## App Type 1: Productivity App (Todo, Notes, Project Management)

**Complexity**: Simple
**Services**: DSQL + Cognito + Lambda + API Gateway

### Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,             -- Cognito sub
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ASYNC idx_items_user ON items(user_id);
CREATE INDEX ASYNC idx_items_user_completed ON items(user_id, completed);
```

### API Routes

| Method | Path | Action |
|--------|------|--------|
| GET | /items | List user's items |
| POST | /items | Create item |
| PUT | /items/{id} | Update item |
| DELETE | /items/{id} | Delete item |

---

## App Type 2: Social App (Posts, Comments, Likes)

**Complexity**: Medium
**Services**: DSQL + Cognito + Lambda + API Gateway + S3

### Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  content TEXT NOT NULL,
  image_url TEXT,                   -- S3 presigned URL reference
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id TEXT NOT NULL NOT NULL,  -- references posts(id),
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE likes (
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  post_id TEXT NOT NULL NOT NULL,  -- references posts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE follows (
  follower_id TEXT NOT NULL NOT NULL,  -- references users(id),
  following_id TEXT NOT NULL NOT NULL,  -- references users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX ASYNC idx_posts_user ON posts(user_id);
CREATE INDEX ASYNC idx_posts_created ON posts(created_at DESC);
CREATE INDEX ASYNC idx_comments_post ON comments(post_id);
CREATE INDEX ASYNC idx_follows_following ON follows(following_id);
```

### API Routes

| Method | Path | Action |
|--------|------|--------|
| GET | /feed | Get posts from followed users |
| POST | /posts | Create post |
| POST | /posts/{id}/like | Toggle like |
| POST | /posts/{id}/comments | Add comment |
| POST | /users/{id}/follow | Toggle follow |
| POST | /upload | Get presigned URL for image |

### Feed Query Pattern

```sql
SELECT p.*, u.username, u.avatar_url,
  EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND post_id = p.id) AS liked
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
ORDER BY p.created_at DESC
LIMIT 20 OFFSET $2;
```

---

## App Type 3: Real-time App (Chat, Collaboration)

**Complexity**: Medium-High
**Services**: DSQL + Cognito + Lambda + API Gateway (REST + WebSocket) + S3

### Schema

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL NOT NULL,  -- references users(id),
  is_direct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE room_members (
  room_id TEXT NOT NULL NOT NULL,  -- references rooms(id),
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  role TEXT DEFAULT 'member',       -- 'admin', 'member'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id TEXT NOT NULL NOT NULL,  -- references rooms(id),
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  content TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WebSocket connection tracking
CREATE TABLE ws_connections (
  connection_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_id TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ASYNC idx_messages_room ON messages(room_id, created_at DESC);
CREATE INDEX ASYNC idx_room_members_user ON room_members(user_id);
CREATE INDEX ASYNC idx_ws_connections_room ON ws_connections(room_id);
```

### WebSocket Flow

1. Client connects to WebSocket API with Cognito JWT
2. `$connect` handler stores connection in `ws_connections`
3. Client sends `{ "action": "join", "roomId": "..." }`
4. Handler updates `ws_connections.room_id`
5. When a message is sent, handler queries all connections in the room
6. Broadcasts message to each connection via API Gateway Management API

---

## App Type 4: E-Commerce (Products, Cart, Orders)

**Complexity**: High
**Services**: DSQL + Cognito + Lambda + API Gateway + S3

### Schema

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seller_id TEXT NOT NULL NOT NULL,  -- references users(id),
  title TEXT NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  image_url TEXT,
  stock INT DEFAULT 0,
  status TEXT DEFAULT 'active',     -- 'active', 'draft', 'sold_out'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cart_items (
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  product_id TEXT NOT NULL NOT NULL,  -- references products(id)
  quantity INT DEFAULT 1,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  buyer_id TEXT NOT NULL NOT NULL,  -- references users(id),
  total_cents INT NOT NULL,
  status TEXT DEFAULT 'pending',    -- 'pending', 'paid', 'shipped', 'delivered'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  order_id TEXT NOT NULL NOT NULL,  -- references orders(id)
  product_id TEXT NOT NULL NOT NULL,  -- references products(id)
  quantity INT NOT NULL,
  price_cents INT NOT NULL,         -- snapshot at time of order
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX ASYNC idx_products_seller ON products(seller_id);
CREATE INDEX ASYNC idx_products_status ON products(status) WHERE status = 'active';
CREATE INDEX ASYNC idx_orders_buyer ON orders(buyer_id);
```

### Checkout Pattern (Transaction)

```sql
BEGIN;
  -- Create order
  INSERT INTO orders (id, buyer_id, total_cents)
  VALUES ($1, $2, $3);

  -- Move cart items to order items, snapshot prices
  INSERT INTO order_items (order_id, product_id, quantity, price_cents)
  SELECT $1, ci.product_id, ci.quantity, p.price_cents
  FROM cart_items ci JOIN products p ON ci.product_id = p.id
  WHERE ci.user_id = $2;

  -- Decrement stock
  UPDATE products SET stock = stock - ci.quantity
  FROM cart_items ci
  WHERE products.id = ci.product_id AND ci.user_id = $2;

  -- Clear cart
  DELETE FROM cart_items WHERE user_id = $2;
COMMIT;
```

---

## App Type 5: Multi-tenant SaaS (CRM, Analytics, Admin)

**Complexity**: Very High
**Services**: DSQL + Cognito + Lambda + API Gateway + S3 + EventBridge (scheduled)

### Schema

```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',         -- 'free', 'pro', 'enterprise'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE org_members (
  org_id TEXT NOT NULL NOT NULL,  -- references organizations(id),
  user_id TEXT NOT NULL NOT NULL,  -- references users(id),
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member', 'viewer'
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

-- All tenant data includes org_id for row-level isolation
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id TEXT NOT NULL NOT NULL,  -- references organizations(id),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL NOT NULL,  -- references projects(id),
  org_id TEXT NOT NULL,             -- denormalized for efficient queries
  assigned_to TEXT NOT NULL,  -- references users(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo',       -- 'todo', 'in_progress', 'done'
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ASYNC idx_projects_org ON projects(org_id);
CREATE INDEX ASYNC idx_tasks_project ON tasks(project_id);
CREATE INDEX ASYNC idx_tasks_org ON tasks(org_id);
CREATE INDEX ASYNC idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX ASYNC idx_org_members_user ON org_members(user_id);
```

### Multi-tenancy Pattern

Every query includes `org_id` in the WHERE clause. The Lambda handler extracts the user's org membership from a JWT custom claim or by querying `org_members`:

```javascript
async function getOrgId(userId) {
  const result = await pool.query(
    'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (result.rows.length === 0) throw new Error('No organization');
  return result.rows[0].org_id;
}

// Every data query includes org_id
const tasks = await pool.query(
  'SELECT * FROM tasks WHERE org_id = $1 AND project_id = $2',
  [orgId, projectId]
);
```

---

## Decision: Why These Services

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Database | Aurora DSQL | DynamoDB, Aurora Serverless v2 | DSQL scales to zero, PostgreSQL-compatible, IAM auth, no connection management |
| Auth | Cognito | Auth0, custom JWT | Lives in customer's AWS account, free up to 10K MAU, integrates with API GW |
| Authorization | Cedar | PostgreSQL RLS, custom middleware | Policy-as-code, agents can read/write it, deny-by-default, ~5μs per eval |
| Compute | Lambda (Node.js) | Fargate, EC2, Python Lambda | Scales to zero, no provisioning, Node.js avoids native dependency issues |
| API | REST API Gateway | HTTP API, AppSync | Cognito authorizer support, request validation, usage plans |
| Storage | S3 + presigned URLs | Public buckets, EFS | Secure by default, no server-side proxy needed, unlimited scale |
| IaC | SAM/CloudFormation | CDK, Terraform | SAM is purpose-built for serverless, one command deploy |
