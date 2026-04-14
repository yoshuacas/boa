# Task 07: Skill and Documentation Updates

**Agent:** implementer
**Design:** docs/design/cloudfront-dow-protection.md
**Depends on:** Task 02

## Objective

Update the skill instructions, plugin quick-reference,
API patterns guide, and pitfalls reference to reflect
CloudFront + WAF as the default traffic layer.

## Target Tests

From `cli/__tests__/cloudfront-dow-protection.test.mjs`:

- SKILL.md architecture diagram includes CloudFront
- SKILL.md mentions WAF in default traffic layer context
- Plugin CLAUDE.md API layer mentions CloudFront
- API-PATTERNS.md contains CloudFront section
- PITFALLS.md contains CloudFront 403 entry
- PITFALLS.md contains CORS through CloudFront entry
- PITFALLS.md contains cache stale data entry

## Implementation

### `plugin/skills/boa/SKILL.md`

**Change 1: Update description line (line 3)**

Change:
```
description: Build serverless backends on AWS with Aurora DSQL, Cognito, Lambda (Function URLs), and S3.
```
to:
```
description: Build serverless backends on AWS with Aurora DSQL, Cognito, Lambda (CloudFront + WAF), and S3.
```

**Change 2: Update architecture diagram (lines 32-41)**

Replace the current diagram with:

```
Client App (React/Next.js/Vue)  ──  @supabase/supabase-js (drop-in client)
    │
    ▼
CloudFront + WAF ─── DDoS protection, rate limiting, edge cache
    │
    ▼
Lambda Function URL ─── pgrest-lambda engine (handles JWT + CORS + routing)
    │
    ├──▶ Aurora DSQL ─── PostgreSQL (PostgREST-compatible REST API)
    ├──▶ Amazon S3 ─── File storage (presigned URLs only)
    └──▶ Cognito ─── User management (GoTrue-compatible auth)
```

**Change 3: Add traffic layer explanation**

After the architecture diagram description paragraph,
add a brief explanation:

```
CloudFront is the default traffic layer. All client
requests go through CloudFront, which provides DDoS
absorption (AWS Shield Standard), WAF rate limiting
(1000 req/5min per IP), and edge caching (60s TTL for
GET requests). The Lambda Function URL uses
`AuthType: AWS_IAM` -- only CloudFront can invoke it
via Origin Access Control (OAC). Direct access to the
Function URL returns 403 Forbidden.
```

**Change 4: Update critical rules**

Add after rule 12:

```
13. **Function URLs are behind CloudFront**: The raw
    Function URL is internal. Never share it with
    frontend clients. Use the CloudFront URL from
    `.boa/config.json` `apiUrl`.
14. **WAF rate limiting**: Default is 1000 requests per
    5 minutes per IP. Increase in the WAF rule if a
    legitimate app needs higher throughput.
```

### `plugin/CLAUDE.md`

**Change 1: Update API layer in architecture table**

Change:
```
| API        | Lambda Function URLs (free) |
```
to:
```
| API        | CloudFront + WAF (default), Lambda Function URLs (internal) |
```

**Change 2: Update the note below the table**

Change:
```
API Gateway is available as an extension (`boa extend api-gateway`) for rate limiting, WAF, or custom domains.
```
to:
```
CloudFront + WAF is the default traffic layer. API Gateway is available as an extension (`boa extend api-gateway`) for usage plans, API keys, or custom domains.
```

**Change 3: Add critical rule**

Add after rule 9:
```
10. Function URLs are behind CloudFront. Never share the raw Function URL with clients.
```

### `plugin/docs/API-PATTERNS.md`

**Change 1: Update header and note**

Change the opening note to explain that CloudFront is the
default and API Gateway is an extension:

```markdown
# API Patterns

CloudFront + WAF is the default traffic layer for every
BOA backend. It provides DDoS protection, rate limiting,
and edge caching at the CDN level.

> **Note:** API Gateway REST is available as an extension
> (`boa extend api-gateway`) for teams needing usage plans,
> API keys, or custom domains. The patterns below cover
> both the default CloudFront layer and the API Gateway
> extension.

---

## CloudFront Default Traffic Layer

Every `boa init` deployment places CloudFront in front of
the Lambda Function URL:

- **DDoS absorption**: AWS Shield Standard (included free)
- **WAF rate limiting**: 1000 requests per 5 minutes per IP
  (configurable in the WAF rule)
- **Edge caching**: GET requests cached for 60 seconds.
  Cache key includes `Authorization` header and query
  string, so different users and queries get separate
  cache entries
- **Origin auth**: CloudFront uses OAC with SigV4 to
  invoke the Function URL (`AuthType: AWS_IAM`). Direct
  access to the Function URL returns 403

### Cache Behavior

- GET and HEAD requests are cached (60s TTL)
- POST, PUT, PATCH, DELETE always forward to origin
- Add `Cache-Control: no-cache` to bypass cache for
  fresh reads
- Cache key includes `Authorization` and `apikey` headers
  plus all query string parameters

### CORS

CloudFront passes through CORS headers from pgrest-lambda.
No CloudFront-level CORS configuration is needed.

### Rate Limit Tuning

The default WAF rate limit is 1000 requests per 5 minutes
per IP. To increase it, modify the `RateBasedStatement`
`Limit` in `.boa/template.yaml` (or the base template if
no local override exists) and run `boa deploy`.

---
```

Keep the existing API Gateway REST Configuration section
below, unchanged.

### `plugin/docs/PITFALLS.md`

**Change 1: Add three new index entries**

Add in the **Deployment** section of the index table,
after entry 24:

```markdown
| 25 | Direct Function URL returns 403 (expected with CloudFront) | MEDIUM | See below |
| 26 | CORS errors through CloudFront (missing origin request headers) | MEDIUM | See below |
| 27 | Stale GET responses from CloudFront cache (60s TTL) | LOW | See below |
```

**Change 2: Add detail sections**

Add at the end of the file:

```markdown
## Direct Function URL 403 — Expected with CloudFront

With CloudFront as the default traffic layer, the Lambda
Function URL uses `AuthType: AWS_IAM`. Only CloudFront
(via OAC) can invoke it. Curling the Function URL directly
returns `{"Message":"Forbidden"}` with HTTP 403.

**This is expected behavior, not a bug.** The API URL for
clients is the CloudFront domain (from
`.boa/config.json` `apiUrl`), not the raw Function URL.

**Symptoms:** HTTP 403 when accessing the Function URL
directly. No Lambda CloudWatch logs for the request
(it never reaches Lambda).

**Fix:** Use the CloudFront URL from `.boa/config.json`
`apiUrl`. If you need to test Lambda directly, use
`aws lambda invoke` with the AWS CLI.

## CORS Through CloudFront

CloudFront passes through CORS headers from the Lambda
response. pgrest-lambda handles CORS internally. If CORS
errors occur, the issue is in pgrest-lambda's CORS
configuration, not CloudFront.

**Symptoms:** Browser console shows CORS errors when
making requests to the CloudFront URL.

**Common causes:**
1. The request origin is not allowed by pgrest-lambda
2. A required header is missing from the CloudFront
   origin request policy (not forwarded to Lambda)
3. The preflight OPTIONS request is not handled correctly

**Fix:** Check that the origin request policy forwards
all required headers. The default policy includes
`Content-Type`, `Accept`, `Prefer`, and Supabase client
headers. If your app sends custom headers, add them to
the origin request policy in the SAM template.

## Stale GET Responses — CloudFront Cache

CloudFront caches GET responses for 60 seconds (the
default cache policy TTL). After updating data, a
subsequent GET may return stale data if served from
the CloudFront edge cache.

**Symptoms:** Data appears unchanged after a write
operation. Refreshing after 60 seconds shows the
correct data.

**Fix:** Add `Cache-Control: no-cache` to GET requests
that must return fresh data. For real-time use cases,
consider using POST requests (never cached) or reducing
the TTL in the CloudFront cache policy.
```

## Acceptance Criteria

- All "Skill documentation", "Plugin documentation",
  "API patterns", and "Pitfalls" tests pass
- All documentation renders correctly as Markdown
- No existing content is removed (only additions and
  updates)
- Word wrap at 72 columns for prose, matching existing
  documents

## Conflict Criteria

- If all target tests already pass before any code changes
  are made, investigate whether the tests are true
  positives before marking the task complete.
- If any of the documents already contain CloudFront
  references, escalate -- the design assumes they do not.
