# BOA Known Pitfalls — Quick Reference

Every pitfall below was observed in real AI agent builds. Each one cost hours to debug. Detailed descriptions and fixes live in the relevant pattern docs.

## Index

| # | Pitfall | Severity | Details In |
|---|---------|----------|-----------|
| **Auth** | | | |
| 1 | Self-sign-up disabled by default (`AllowAdminCreateUserOnly: true`) | CRITICAL | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 2 | Users stuck in UNCONFIRMED (missing pre-signup trigger) | CRITICAL | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 3 | `update-user-pool` CLI wipes all Lambda triggers | HIGH | [AUTH-PATTERNS.md](AUTH-PATTERNS.md) |
| 4 | Cognito SDK fails in browser — `global is not defined` (Vite) | HIGH | [SKILL.md](../SKILL.md) Critical Rule #7 |
| 5 | Wrong API Gateway type — HTTP API instead of REST API (only when `api-gateway` extension is enabled) | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
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
| 14 | Python Lambda with native dependencies (use Node.js) | HIGH | [SKILL.md](../SKILL.md) Critical Rule #4 |
| 15 | SAM build fails — missing `package.json` or `version` field | MEDIUM | [FUNCTIONS.md](FUNCTIONS.md) |
| 24 | Function URL 403 Forbidden (missing `lambda:InvokeFunction` permission) | CRITICAL | See below |
| 25 | HTTP only by default (ALB needs ACM cert for HTTPS) | MEDIUM | See below |
| **Functions** | | | |
| 16 | Circular dependency: function env vars referencing `${Api}` | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| 17 | SSM `SecureString` not supported for Lambda env vars | HIGH | [FUNCTIONS.md](FUNCTIONS.md) |
| **Frontend** | | | |
| 18 | Amplify SPA redirect `/<*>` breaks static assets | HIGH | [SKILL.md](../SKILL.md) Critical Rule #8 |
| 19 | CORS errors — Lambda missing headers or OPTIONS not configured | HIGH | [API-PATTERNS.md](API-PATTERNS.md) |
| 20 | Opening HTML via `file://` — CORS blocks all API requests | HIGH | Use `http://localhost` (dev server) |
| 26 | Async form submit handler reads `event.currentTarget` after `await` | MEDIUM | [SKILL.md](../SKILL.md) Frontend Configuration |
| **Storage** | | | |
| 21 | Public S3 bucket — always use presigned URLs | CRITICAL | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |
| 22 | Presigned URL expiration too short for large files | LOW | [STORAGE-PATTERNS.md](STORAGE-PATTERNS.md) |
| **Corporate Accounts** | | | |
| 23 | Corporate security policies auto-disable Cognito self-sign-up | HIGH | See below |

## Corporate AWS Accounts — Self-Sign-Up

Some enterprises (including Amazon) run automated security scans that set `AllowAdminCreateUserOnly: true` on Cognito user pools. This breaks BOA's sign-up flow silently — self-sign-up works initially, then stops working after the next security scan.

**Symptoms:** Sign-up returns "User creation is not allowed" or the SAM template setting keeps reverting.

**Workaround:** If this happens, tell the developer their corporate AWS account blocks self-sign-up. They can:
1. Request a security exception for the user pool
2. Use a personal AWS account for development (free tier covers everything BOA uses)

## Function URL 403 — Missing Permission (October 2025)

Since October 2025, AWS requires two resource-based policy
statements for public Lambda Function URLs:

1. `lambda:InvokeFunctionUrl` — all SAM versions generate
2. `lambda:InvokeFunction` — SAM v1.101.0+ generates this;
   older versions require an explicit `AWS::Lambda::Permission`

Without both, the Function URL returns 403 Forbidden on
every request. No Lambda logs are generated because the
request never reaches the handler.

**Symptoms:** Every API request returns
`{"Message":"Forbidden"}` with HTTP 403. No CloudWatch
logs for the Lambda function. `boa verify` fails the
Function URL permission check.

**Fix for new deployments:** Already handled — the BOA
SAM template includes both permissions.

**Fix for existing deployments created before this was
fixed:** Run `boa deploy` to redeploy the stack with the
updated template. The new permission is added
automatically.

**Manual fix (without redeploying):**
```bash
aws lambda add-permission \
  --function-name <project-name>-api \
  --statement-id FunctionURLInvokePermission \
  --action lambda:InvokeFunction \
  --principal "*" \
  --invoked-via-function-url
```

## HTTP Only by Default — ALB Needs ACM Certificate

ALB uses HTTP (port 80) by default. For HTTPS, you need
to add an ACM certificate and an HTTPS listener (port 443).

**Symptoms:** Browser shows "Not Secure" warning. Mixed
content errors when calling the API from an HTTPS frontend.

**Fix:** Request an ACM certificate for your domain, add
an HTTPS listener to the ALB, and redirect HTTP to HTTPS.
Update `.boa/config.json` `apiUrl` to use the HTTPS URL.
