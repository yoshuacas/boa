# BOA Known Pitfalls — Quick Reference

Every pitfall below was observed in real AI agent builds. Each one cost hours to debug. Detailed descriptions and fixes live in the relevant pattern docs.

## Index

| # | Pitfall | Severity | Details In |
|---|---------|----------|-----------|
| **Auth** | | | |
| 1 | Wrong authorizer context keys (use flat `authorizer.userId`, not `claims.sub`) | HIGH | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 2 | Editing the `better_auth` schema by hand | HIGH | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 3 | Sign-up fails with "relation \"user\" does not exist" — run `boa deploy` to re-apply the better-auth schema | MEDIUM | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| **Database** | | | |
| 4 | Hardcoded database credentials instead of IAM auth | CRITICAL | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 5 | `SERIAL`/`BIGSERIAL` in DSQL (use `TEXT DEFAULT gen_random_uuid()`) | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 6 | `REFERENCES` (foreign keys) in DSQL — not supported | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 7 | `CREATE INDEX` without `ASYNC` — DSQL requires it | MEDIUM | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 8 | Connection exhaustion in Lambda (pool outside handler) | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 9 | Missing indexes on foreign-key-style columns | MEDIUM | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| **Deployment** | | | |
| 10 | `AWS_REGION` as Lambda env var (reserved — use `REGION_NAME`) | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| 11 | Python Lambda with native dependencies (use Node.js) | HIGH | [SKILL.md](../skills/boa/SKILL.md) |
| 12 | Failed to fetch / silent network errors when calling an HTTP ALB from an HTTPS frontend | MEDIUM | See below |
| **Functions** | | | |
| 13 | Lambda env var referencing `${Api}` creates a CloudFormation dependency cycle | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| 14 | SSM `SecureString` not supported for Lambda env vars | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| **Frontend** | | | |
| 15 | Amplify SPA redirect `/<*>` breaks static assets | HIGH | [SKILL.md](../skills/boa/SKILL.md) |
| 16 | CORS errors — origin not in the `ALLOWED_ORIGINS` allowlist | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| 17 | Opening HTML via `file://` — CORS blocks all API requests | HIGH | Use `http://localhost` (dev server) |
| 18 | Async form submit handler reads `event.currentTarget` after `await` | MEDIUM | [SKILL.md](../skills/boa/SKILL.md) |
| **Storage** | | | |
| 19 | Public S3 bucket — always use presigned URLs | CRITICAL | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |
| 20 | Presigned URL expiration too short for large files | LOW | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |

## Failed to Fetch / Mixed Content on ALB

The default API Gateway REST traffic layer always serves over HTTPS.
This pitfall only applies to the ALB extension.

Chrome's HTTPS-First mode (default since Chrome 117) silently
rewrites `http://` subresource requests to `https://`. If the ALB is
configured with an HTTP listener only, the request fails with
`TypeError: Failed to fetch` and no CORS error in the console. Any
frontend served over HTTPS also blocks HTTP API calls as mixed
content.

**Fix:** Request an ACM certificate for your domain, pass it to
`boa extend alb --certificate-arn <arn>` (the extension provisions an
HTTPS listener and redirects HTTP to HTTPS), and update
`.boa/config.json` `apiUrl` to the HTTPS URL.
