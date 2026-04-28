# API Patterns

API Gateway REST + WAF is the default traffic layer for
every BOA backend. It provides HTTPS out of the box,
WAF rate limiting, and request throttling.

> **Note:** ALB is available as an extension
> (`boa extend alb`) for long-running requests (>29s),
> streaming, or high-throughput workloads. The patterns
> below cover both the default API Gateway layer and the
> ALB extension.

---

## API Gateway REST Default Traffic Layer

Every `boa init` deployment places API Gateway REST in
front of Lambda:

- **HTTPS by default**: The `*.execute-api.<region>.amazonaws.com`
  endpoint provides TLS with no ACM certificate or custom
  domain required
- **WAF rate limiting**: 1000 requests per 5 minutes per IP
  (configurable in the WAF rule)
- **Request throttling**: 10,000 requests per second default
  (account-level, adjustable via service quotas)
- **Lambda integration**: API Gateway invokes Lambda directly.
  There is no public Lambda endpoint

### CORS

API Gateway handles CORS via the `Cors` property on the
`AWS::Serverless::Api` resource. pgrest-lambda also returns
CORS headers on every response.

### Rate Limit Tuning

The default WAF rate limit is 1000 requests per 5 minutes
per IP. To increase it, modify the `RateBasedStatement`
`Limit` in `.boa/template.yaml` (or the base template if
no local override exists) and run `boa deploy`.

---

## API Gateway REST Configuration (SAM)

```yaml
ApiGateway:
  Type: AWS::Serverless::Api
  Properties:
    StageName: prod
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,Authorization'"
      AllowOrigin: "'*'"
    Auth:
      DefaultAuthorizer: CognitoAuth
      Authorizers:
        CognitoAuth:
          UserPoolArn: !GetAtt CognitoUserPool.Arn
```

Always use REST API (not HTTP API) for Cognito authorizer support.

## Lambda Handler Structure

```javascript
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export const handler = async (event) => {
  // OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const userId = event.requestContext.authorizer.claims.sub;
    const method = event.httpMethod;
    const path = event.resource;
    const body = event.body ? JSON.parse(event.body) : null;
    const params = event.pathParameters || {};

    // Route
    if (method === 'GET' && path === '/items') {
      return await listItems(userId);
    }
    if (method === 'POST' && path === '/items') {
      return await createItem(userId, body);
    }
    if (method === 'PUT' && path === '/items/{id}') {
      return await updateItem(userId, params.id, body);
    }
    if (method === 'DELETE' && path === '/items/{id}') {
      return await deleteItem(userId, params.id);
    }

    return respond(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return respond(500, { error: 'Internal server error' });
  }
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}
```

## Route Patterns

| Pattern | SAM Event | Use |
|---------|-----------|-----|
| `GET /items` | `Path: /items, Method: get` | List all for user |
| `POST /items` | `Path: /items, Method: post` | Create |
| `GET /items/{id}` | `Path: /items/{id}, Method: get` | Get one |
| `PUT /items/{id}` | `Path: /items/{id}, Method: put` | Update |
| `DELETE /items/{id}` | `Path: /items/{id}, Method: delete` | Delete |

## Request Validation

Validate in the Lambda handler, not API Gateway:

```javascript
function validateRequired(body, fields) {
  const missing = fields.filter(f => !body || !body[f]);
  if (missing.length > 0) {
    return respond(400, { error: `Missing required fields: ${missing.join(', ')}` });
  }
  return null;
}

// Usage
const err = validateRequired(body, ['title']);
if (err) return err;
```

## Error Response Format

Always return consistent JSON error responses:

```json
{ "error": "Human-readable error message" }
```

Status codes:
- `400` — Bad request (missing/invalid fields)
- `401` — Unauthorized (no/invalid token)
- `403` — Forbidden (valid token, no permission)
- `404` — Not found
- `409` — Conflict (duplicate)
- `500` — Internal server error

## Pagination

Use cursor-based pagination. Return a `nextCursor` in the response:

```javascript
async function listItems(userId, cursor, limit = 20) {
  const pool = await getPool();
  let query = 'SELECT * FROM items WHERE user_id = $1';
  const params = [userId];

  if (cursor) {
    query += ' AND created_at < $2';
    params.push(cursor);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit + 1);  // fetch one extra to detect hasMore

  const result = await pool.query(query, params);
  const hasMore = result.rows.length > limit;
  const items = hasMore ? result.rows.slice(0, limit) : result.rows;

  return respond(200, {
    items,
    nextCursor: hasMore ? items[items.length - 1].created_at : null,
  });
}
```

## Rate Limiting

API Gateway REST API supports usage plans:

```yaml
UsagePlan:
  Type: AWS::ApiGateway::UsagePlan
  Properties:
    Throttle:
      BurstLimit: 100
      RateLimit: 50
    Quota:
      Limit: 10000
      Period: DAY
```
