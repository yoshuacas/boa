# BOA Known Pitfalls — Quick Reference

Every pitfall below was observed in real AI agent builds. Each one cost hours to debug. Detailed descriptions and fixes live in the relevant pattern docs.

## Index

| # | Pitfall | Severity | Details In |
|---|---------|----------|-----------|
| **Auth** | | | |
| 1 | Self-signup disabled by default (`AllowAdminCreateUserOnly: true`) | CRITICAL | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 2 | Users stuck in UNCONFIRMED (missing pre-signup trigger) | CRITICAL | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 3 | `update-user-pool` CLI wipes all Lambda triggers | HIGH | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 4 | Cognito SDK fails in browser — `global is not defined` (Vite) | HIGH | [SKILL.md](../skills/boa/SKILL.md) Critical Rule #7 |
| 5 | Wrong API Gateway type — HTTP API instead of REST API | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| 6 | Wrong authorizer context path (`claims.sub` vs `authorizer.userId`) | HIGH | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| **Database** | | | |
| 7 | Hardcoded database credentials instead of IAM auth | CRITICAL | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 8 | `SERIAL`/`BIGSERIAL` in DSQL (use `TEXT DEFAULT gen_random_uuid()`) | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 9 | `REFERENCES` (foreign keys) in DSQL — not supported | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 10 | `CREATE INDEX` without `ASYNC` — DSQL requires it | MEDIUM | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 11 | Connection exhaustion in Lambda (pool outside handler) | HIGH | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| 12 | Missing indexes on foreign key columns | MEDIUM | [DSQL-PATTERNS.md](DSQL-PATTERNS.md) |
| **Deployment** | | | |
| 13 | `AWS_REGION` as Lambda env var (reserved — use `REGION_NAME`) | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| 14 | Python Lambda with native dependencies (use Node.js) | HIGH | [SKILL.md](../skills/boa/SKILL.md) Critical Rule #4 |
| 15 | SAM build fails — missing `package.json` or `version` field | MEDIUM | [FUNCTIONS.md](FUNCTIONS.md) |
| **Functions** | | | |
| 16 | Circular dependency: function env vars referencing `${Api}` | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| 17 | SSM `SecureString` not supported for Lambda env vars | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| **Frontend** | | | |
| 18 | Amplify SPA redirect `/<*>` breaks static assets | HIGH | [SKILL.md](../skills/boa/SKILL.md) Critical Rule #8 |
| 19 | CORS errors — Lambda missing headers or OPTIONS not configured | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| **Storage** | | | |
| 20 | Public S3 bucket — always use presigned URLs | CRITICAL | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |
| 21 | Presigned URL expiration too short for large files | LOW | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |
