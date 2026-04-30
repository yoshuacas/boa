# API Patterns

API Gateway REST + WAF is the default traffic layer for every BOA
backend. `pgrest-lambda` generates the REST API from the database
schema, so agents do not write Lambda route handlers for CRUD routes.

> **Note:** ALB is available as an extension (`boa extend alb`) for
> long-running requests (>29s), streaming, or high-throughput
> workloads. The patterns below apply to both the default API Gateway
> layer and the ALB extension. The Lambda reads the public base URL
> from the incoming request's `Host` and `X-Forwarded-Proto` headers,
> so the same code works on either.

---

## Default Traffic Layer

Every `boa init` deployment places API Gateway REST in front of Lambda:

- **HTTPS by default**: The `*.execute-api.<region>.amazonaws.com`
  endpoint provides TLS. No ACM certificate or custom domain required.
- **WAF rate limiting**: 1000 requests per 5 minutes per IP
  (configurable in the `RateBasedStatement` `Limit` in the base
  template).
- **Request throttling**: 10,000 requests per second default
  (account-level, adjustable via service quotas).
- **Lambda integration**: API Gateway invokes the function directly
  via an `AWS_PROXY` integration on `/` (root) and `/{proxy+}`
  (everything else).

### CORS

pgrest-lambda emits CORS headers on every response. The allowlist
comes from the `ALLOWED_ORIGINS` Lambda env var, set via the
`AllowedOrigins` CloudFormation parameter. Empty list means the
Lambda emits no CORS headers (same-origin only).

### Rate Limit Tuning

Edit the `RateBasedStatement` `Limit` in `.boa/template.yaml` (or the
base template if no local override exists) and run `boa deploy`.

---

## How the API Is Generated

pgrest-lambda handles every `/rest/v1/*` and `/auth/v1/*` route:

- `/rest/v1/<table>` — CRUD on any public schema table, PostgREST
  query syntax (`?status=eq.active`, ordering, pagination, resource
  embedding).
- `/auth/v1/*` — GoTrue-compatible sign-up, sign-in, token refresh,
  current user, sign-out. See [AUTH-PATTERNS.md](AUTH-PATTERNS.md).
- `/rest/v1/` and `/rest/v1/_docs` — auto-generated OpenAPI 3.0 spec
  and interactive Scalar UI.

Full request syntax, filtering, pagination, and error responses are
in [REST-API.md](REST-API.md).

## Authentication Context

pgrest-lambda attaches flat authorizer context keys to each request:

```javascript
event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
event.requestContext.authorizer.userId   // user UUID or '' for anon
event.requestContext.authorizer.email    // user email or ''
```

Custom Lambda functions added via `boa extend` should read the same
keys for per-user authorization.

## Custom Functions

When an app needs a route that isn't CRUD (webhooks, custom actions,
cron jobs), add a function through a BOA extension. See
[FUNCTIONS.md](FUNCTIONS.md) for the current function patterns.
