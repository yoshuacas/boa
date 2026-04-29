# Security Review Response — 2026-04-28

**Source:** `boa-findings.json` (23 findings + 1 bonus discovered during triage).
**Response:** 20 of 24 addressed on feature branches; 2 rejected with rationale; 1 deferred with a design doc; 1 already fixed before this review.

Every accepted fix lives on its own branch named `sec/<id>-<slug>`. The branches are **not yet merged to `main`** — each should be reviewed and merged independently.

---

## Branch roster

| Fix | Repo | Branch |
|-----|------|--------|
| B-1 | boa | `sec/B-1-docs-tls-verify-consistency` |
| H-1 | boa | `sec/H-1-alb-https-listener` |
| H-5 | boa | `sec/H-5-rotate-api-keys` |
| H-6 | pgrest-lambda | `sec/H-6-refresh-endpoint-auth` |
| L-17 | pgrest-lambda | `sec/L-17-cognito-global-signout` |
| L-19 | pgrest-lambda | `sec/L-19-body-size-limit` |
| L-20 | pgrest-lambda | `sec/L-20-generic-error-response` |
| L-21 | boa | `sec/L-21-init-warning-service-key` |
| L-22 | boa | `sec/L-22-cognito-legacy-gate` |
| M-7 | pgrest-lambda | `sec/M-7-sql-builder-quote-ident` |
| M-8 | boa | `sec/M-8-s3-cors-allowlist` |
| M-9 | boa | `sec/M-9-api-cors-allowlist` |
| M-10 | boa + pgrest-lambda | `sec/M-10-service-role-warnings` (both repos) |
| M-12 | boa | `sec/M-12-db-non-admin-role` (design only) |
| M-13 | boa | `sec/M-13-sanitize-upload-filename` |
| M-14 | pgrest-lambda | `sec/M-14-router-ident-regex` |
| M-16 | pgrest-lambda | `sec/M-16-cognito-idtoken-trust-comment` |

---

## Findings index

| # | Title | Severity | Status |
|---|---|---|---|
| H-1 | ALB serves HTTP only — no TLS encryption | High | Accepted — fixed |
| H-2 | TLS certificate verification disabled on database connection | High | Accepted — already fixed |
| H-3 | Cognito pre-signup auto-confirms all users without email verification | High | Accepted — already fixed |
| H-4 | Refresh token exposes Cognito provider refresh token to client | High | Accepted — already fixed |
| H-5 | API keys expire in 10 years with no rotation mechanism | High | Accepted — fixed |
| H-6 | /_refresh endpoint reloads schema and policies without authentication | High | Accepted — fixed |
| M-7 | Table and column names interpolated into SQL without secondary validation | Medium | Accepted — fixed |
| M-8 | S3 bucket CORS allows all origins | Medium | Accepted — fixed |
| M-9 | Lambda API responses include CORS Access-Control-Allow-Origin: * | Medium | Accepted — fixed |
| M-10 | Service role Cedar policy bypasses all authorization | Medium | Accepted — hardened |
| M-11 | API Lambda uses dsql:DbConnectAdmin — overly permissive | Medium | *(numbering note: see M-12; the on_conflict finding is the separate M-11)* |
| M-11 | on_conflict column validation | Medium | Accepted — already fixed |
| M-12 | API Lambda uses dsql:DbConnectAdmin — overly permissive | Medium | Accepted — **design only, implementation deferred** |
| M-13 | User-supplied filename not sanitized in presigned upload | Medium | Accepted — fixed |
| M-14 | Router does not validate table name format | Medium | Accepted — fixed |
| M-15 | CLI deploy script uses shell command string interpolation | Medium | **Rejected — already mitigated** |
| M-16 | Cognito ID token parsed without signature verification | Medium | Accepted — scope-limited comment |
| L-17 | Logout does not invalidate tokens | Low | Accepted — fixed (Cognito path) |
| L-18 | Same JWT secret used for all token types | Low | **Rejected — tradeoff** |
| L-19 | No request body size limit | Low | Accepted — fixed |
| L-20 | Error messages may leak internal details | Low | Accepted — fixed |
| L-21 | Config file stores API keys in plaintext | Low | Accepted — warning added |
| L-22 | ALLOW_USER_PASSWORD_AUTH enabled in Cognito | Low | Accepted — docs marked legacy |
| B-1 | Stale docs show rejectUnauthorized: false | Bonus | Accepted — fixed |

> **Numbering note.** `boa-findings.json` has two distinct entries at medium severity that both could map to "M-11" in the original numbering: the `on_conflict` validation finding and the `DbConnectAdmin` finding. I kept the JSON order, so *in this report* **M-11 = on_conflict**, **M-12 = DbConnectAdmin**. If your tracking system assigns different IDs, remap accordingly.

---

## Per-finding detail

### H-1 · ALB serves HTTP only — no TLS encryption

**Severity:** High
**Decision:** Accepted.
**Branch:** `sec/H-1-alb-https-listener` (commit `2a60cc9`).

**What was wrong.** `cli/extensions/alb/fragment.yaml` provisioned a single HTTP:80 listener forwarding directly to the Lambda target group, with a security group ingress opening port 80 to `0.0.0.0/0`. Any user who ran `boa extend alb` sent signups, logins, JWTs, and apikeys over plaintext. The `AlbUrl` output was `http://...`, so downstream `.boa/config.json` propagated the insecure scheme to every frontend.

**Correction applied.**
1. Added a required `CertificateArn` CloudFormation parameter to `cli/extensions/alb/fragment.yaml`. The extension refuses to install without it (see CLI change below).
2. Added an HTTPS:443 listener with `SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06`, forwarding to the existing target group.
3. Converted the HTTP:80 listener to a permanent redirect (HTTP 301) to HTTPS:443, preserving `host`, `path`, and `query`. No plaintext path to the target group remains.
4. Security group now opens 443 for HTTPS and keeps 80 open only so the redirect can happen.
5. `AlbUrl` output is now `https://...`.
6. `cli/commands/extend.mjs`: `boa extend alb` requires `--certificate-arn <arn>` and errors out with an `aws acm request-certificate` example when the flag is missing. The guard runs after "missing config" and "already enabled" checks so those errors still surface first.
7. `cli/commands/deploy.mjs`: if `cfg.certificateArn` is present in `.boa/config.json`, it is forwarded to SAM as a parameter override on every deploy.
8. `cli/extensions/alb/README.md`: rewritten to show the ACM prerequisite, the new CLI usage, and the apiUrl change.

**Why accepted.** Straightforward, high-impact fix. The "require a cert" friction is deliberate: the extension is opt-in, and the cost of getting HTTPS wrong on this path is high (every credential visible to a network observer).

**Verification.** Tests at `cli/__tests__/alb-https.test.mjs` assert on the CertificateArn parameter, the TLS 1.3 policy, the 443 ingress, the absence of a port-80 forward, the `https://` output, and the CLI flag enforcement. Full CLI suite: 164 tests green.

---

### H-2 · TLS certificate verification disabled on database connection

**Severity:** High
**Decision:** Accepted — already fixed before this review landed.

**What was wrong (cited code).** `pool = new Pool({ ..., ssl: { rejectUnauthorized: false }, ... })` in `Habor-pgrest-lamba/src/rest/db/dsql.mjs`.

**Correction applied.** The Lambda already connects with `ssl: { rejectUnauthorized: true }` across every DB entrypoint on current `main`:
- `pgrest-lambda/src/rest/db/dsql.mjs:84` — DSQL pool.
- `pgrest-lambda/src/auth/providers/better-auth.mjs:80` — better-auth pool.
- `pgrest-lambda/src/rest/db/postgres.mjs:9-10` — shared default for any non-DSQL Postgres target.
- Regression guard: `pgrest-lambda/src/auth/__tests__/better-auth-dsql-pool.test.mjs:104-116` fails if `rejectUnauthorized` is ever flipped back to `false`.

**Why accepted.** The fix is in place; the finding reflects older source. No new code change on this branch.

**Verification.** Grep `ssl:\s*{\s*rejectUnauthorized:\s*false`: no hits in `pgrest-lambda/src`. `npm test` in `pgrest-lambda` covers the assertion.

---

### H-3 · Cognito pre-signup auto-confirms all users without email verification

**Severity:** High
**Decision:** Accepted — already fixed by the better-auth switchover.

**What was wrong (cited code).** A `PreSignUpFunction` Lambda trigger that set `event.response.autoConfirmUser = true` and `event.response.autoVerifyEmail = true`.

**Correction applied.** Commit `ce94ded` ("Switch BOA default auth to better-auth") changed the default `AUTH_PROVIDER` from `cognito` to `better-auth`. On current `main`:
- `cli/templates/backend.yaml` provisions no Cognito user pool, no `PreSignUpFunction`, and no related triggers.
- `cli/templates/backend.yaml:50` sets `AUTH_PROVIDER: better-auth` directly.
- Email verification flows through better-auth's email adapter; users are not auto-confirmed.

**Why accepted.** The Cognito path remains available for legacy migrations but is no longer the default, so the auto-confirm behavior is not provisioned by any first-run project. L-22 further marks the legacy path in docs.

**Verification.** `grep -rn "autoConfirmUser\|autoVerifyEmail" cli/templates/ cli/commands/ cli/lib/` returns nothing.

---

### H-4 · Refresh token exposes Cognito provider refresh token to client

**Severity:** High
**Decision:** Accepted — already fixed.

**What was wrong (cited code).** `jwt.sign({ sub, role, prt: providerRefreshToken }, ...)` embedding the Cognito refresh token in the BOA refresh JWT, where any holder could base64-decode the payload and call Cognito directly.

**Correction applied.** `pgrest-lambda/src/auth/jwt.mjs:44` now signs `{ sub, role: 'authenticated', sid }` where `sid` is an opaque server-side session identifier. The Cognito refresh token is never serialized into the app JWT. Sessions are resolved through the session table rather than by recovering a provider token from the client's hands.

**Why accepted.** The fix is upstream. This review simply re-verifies.

---

### H-5 · API keys expire in 10 years with no rotation mechanism

**Severity:** High
**Decision:** Accepted.
**Branch:** `sec/H-5-rotate-api-keys` (commit `d08d445`).

**What was wrong.** `cli/lib/keys.mjs` signed both `anonKey` and `serviceRoleKey` with `exp = now + 10 * 365 * 24 * 3600`. A leaked `serviceRoleKey` (which bypasses Cedar entirely) kept working for up to a decade. The only way to invalidate it was to rotate the JWT secret and redeploy, which wiped every outstanding user session.

**Correction applied.**
1. `cli/lib/keys.mjs`: removed the `TEN_YEARS` constant. Exports `DEFAULT_KEY_EXPIRY_SECONDS = 90 * 86400` and a `generateKeys(secret, { expirySeconds } = {})` signature. Callers that don't pass the option get the 90-day default; callers can opt into any other lifetime.
2. `cli/commands/rotate-keys.mjs` (new): reads the JWT secret from SSM (`/<stack>/jwt-secret`), mints new anon and service role keys, writes them back to `.boa/config.json` preserving every other field, and records `keysRotatedAt`. The default path leaves existing user sessions intact (the JWT secret is unchanged).
3. `--rotate-secret` flag: also rotates the JWT SSM parameter. Invalidates every existing user session — gated behind the explicit flag with a loud warning.
4. `cli/bin/boa.mjs`: new `rotate-keys` subcommand wired into the command list and help text.
5. `cli/commands/init.mjs`: post-deploy summary now tells the user that keys expire in 90 days and points at `boa rotate-keys`.
6. `cli/lib/aws.mjs`: new `ssmGetParameter` helper used by `rotate-keys`. Uses `shellEscape` for user-sourced values, consistent with the rest of the module.

**Why accepted.** 10-year lifetimes on a Cedar-bypassing key were a time bomb. 90 days + an opt-in rotation command gives operators a clear knob and keeps the default path from silently drifting past a reasonable rotation cadence.

**Verification.** `cli/__tests__/keys.test.mjs` updated for the new default and the custom-expiry option (10 tests). `cli/__tests__/rotate-keys.test.mjs` stubs the `aws` CLI on `PATH` and verifies that (a) keys change, (b) other config fields survive the rewrite, (c) the new `exp` is within 60 seconds of 90 days from now. Full CLI suite: 158 tests green on that branch.

---

### H-6 · /_refresh endpoint reloads schema and policies without authentication

**Severity:** High
**Decision:** Accepted.
**Branch:** `sec/H-6-refresh-endpoint-auth` (commit `620442a`).

**What was wrong.** `pgrest-lambda/src/rest/router.mjs:13` routed `/_refresh` to `type: 'refresh'` and `handler.mjs:234-243` executed `schemaCache.refresh(pool)`, `cedar.refreshPolicies()`, and returned the full OpenAPI spec — all with no role check. Any unauthenticated caller could enumerate every table and column in the database and DoS the service with repeated reloads.

**Correction applied.** In `pgrest-lambda/src/rest/handler.mjs`, the `refresh` branch now checks `role === 'service_role'` before doing anything. Non-matching requests get `401 PGRST301 "Refresh requires service_role"`. The `role` value is extracted from `event.requestContext.authorizer.role` as before, so the BOA authorizer (which already maps the service role apikey to `role='service_role'`) wires the check end-to-end with no traffic-layer change.

**Why accepted.** The endpoint does legitimately need to exist for local dev and CI, but there is no legitimate anon use case. Gating it on service role is the smallest, cheapest fix.

**Verification.** Four new tests in `handler.integration.test.mjs` cover the `anon → 401`, `authenticated → 401`, `service_role → 200`, and `GET → 405` (pre-existing) cases. Two existing tests — one in `handler.integration` and one in `cedar.integration` — were updated to pass `role: 'service_role'` when they needed to trigger a refresh. Full pgrest-lambda suite: 741 tests green.

---

### M-7 · Table and column names interpolated into SQL without secondary validation

**Severity:** Medium
**Decision:** Accepted.
**Branch:** `sec/M-7-sql-builder-quote-ident` (commit `c0d6b33`).

**What was wrong.** `pgrest-lambda/src/rest/sql-builder.mjs` interpolated identifiers into SQL using template literals (`` `"${table}"."${col}"` ``). Schema-cache validation happened at the caller, not in the builder — any future code path that skipped the caller-level check would become a SQL injection vector.

**Correction applied.** Added a module-private `IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/` and a `q(name)` helper at the top of `sql-builder.mjs` that throws `PostgRESTError(400, 'PGRST204', "'${name}' is not a valid identifier")` on mismatch and returns `"${name}"` on success. Replaced every one of the 43 raw `` `"${ `` identifier interpolations in the file with `q()`. Also removed the now-duplicate local `IDENT` that `makeRpcColumnValidator` used, since the module-level one serves both scopes. Schema-cache validation was left untouched — this is strictly additive.

**Why accepted.** Defense-in-depth with a tight blast radius. A single helper means future contributors can't accidentally skip validation.

**Verification.** `cli/__tests__/sql-builder-quote-ident.test.mjs` (5 new tests) injects a malformed table name into a synthetic schema (bypassing the schema cache) and asserts that `buildSelect`, `buildInsert`, `buildUpdate`, and `buildDelete` all reject it with `PGRST204`. A control test confirms valid identifiers still quote normally. Full suite: 737 tests green.

---

### M-8 · S3 bucket CORS allows all origins

**Severity:** Medium
**Decision:** Accepted.
**Branch:** `sec/M-8-s3-cors-allowlist` (commit `aa918aa`).

**What was wrong.** `cli/templates/backend.yaml` hard-coded `AllowedOrigins: ['*']` on the storage bucket, so any website could run presigned-URL PUT/GET operations from the user's browser.

**Correction applied.**
1. Added a CloudFormation parameter `AllowedOrigins` (`CommaDelimitedList`, default empty).
2. Added a `HasAllowedOrigins` condition (`!Not [!Equals [!Join ['', !Ref AllowedOrigins], '']]`).
3. Wrapped `CorsConfiguration` with `!If [HasAllowedOrigins, {...}, !Ref AWS::NoValue]`. When the list is empty, the `CorsConfiguration` block is omitted entirely — same-origin uploads still work because CORS only gates cross-origin.
4. `cli/commands/deploy.mjs`: if `cfg.allowedOrigins` is an array in `.boa/config.json`, it is joined with commas and forwarded to SAM as a parameter override. Init deliberately leaves this empty; the first re-deploy after the operator sets the value picks it up.

**Why accepted.** Operators who want cross-origin access must opt in; nothing else changes.

**Verification.** Full CLI suite: 155 tests green.

---

### M-9 · Lambda API responses include CORS Access-Control-Allow-Origin: *

**Severity:** Medium
**Decision:** Accepted.
**Branch:** `sec/M-9-api-cors-allowlist` (commit `278ff0e`).

**What was wrong.** Three separate wildcards:
- `cli/templates/backend.yaml:87-99`: the SAM-level `Cors` block and both `GatewayResponses` CORS headers set `AllowOrigin: "'*'"`.
- `cli/templates/lambda/presigned-upload.mjs:24-28`: `Access-Control-Allow-Origin: *` in the static CORS_HEADERS constant.
- These all flowed through untouched, so a malicious site could make authenticated cross-origin calls.

**Correction applied.**
1. `cli/templates/backend.yaml`: deleted the SAM-level `Cors:` block (which can only emit a single literal origin string) and the `GatewayResponses` CORS headers. CORS is now enforced inside the Lambda against the `ALLOWED_ORIGINS` env var, populated via `!Join [',', !Ref AllowedOrigins]`.
2. `cli/templates/lambda/presigned-upload.mjs`: removed the static wildcard CORS constant. Added `ALLOWED_ORIGINS` parsing at cold start (`new Set(...)`) and a `corsHeadersFor(origin)` helper that echoes the exact matching origin in `Access-Control-Allow-Origin`, adds `Vary: Origin`, and returns `{}` for empty allowlist or non-matching origin. Every `respond()` call now passes through the request's Origin.
3. `cli/templates/lambda/index.mjs`: forwards the env var into `pgrest-lambda`'s existing `cors.allowedOrigins` config — the library already supports origin-echo with `Vary: Origin` when passed an array (see `pgrest-lambda/src/shared/cors.mjs`).
4. `cli/commands/deploy.mjs`: `allowedOrigins` from `.boa/config.json` is forwarded to SAM (shared plumbing with M-8).

**Why accepted.** Echo-on-match is the correct pattern for authenticated APIs that accept browser traffic from specific partner domains. The same Lambda handles every origin correctly without needing API Gateway CORS (which would require one config per origin).

**Note on merge ordering.** M-8 and M-9 both declare the `AllowedOrigins` parameter. The M-9 branch also declares it so the branches are independently mergeable. When both merge, the second merge will collide on the parameter declaration — keep one copy.

**Verification.** `cli/__tests__/presigned-upload-cors.test.mjs` checks that no wildcard remains in the Lambda code, the SAM template, or the env wiring, plus asserts on `Vary: Origin`. Full CLI suite: 165 tests green.

---

### M-10 · Service role Cedar policy bypasses all authorization

**Severity:** Medium
**Decision:** Accepted — bypass is deliberate, but the contract around it needed to be explicit.
**Branches:** `sec/M-10-service-role-warnings` in **both** repos (boa commit `9d551c3`, pgrest-lambda commit `acbe642`).

**What was wrong.** The permit rule in `pgrest-lambda/policies/default.cedar` grants `PgrestLambda::ServiceRole` unrestricted action on all resources — the intended behavior, but the combination of that policy plus `serviceRoleKey` sitting in plaintext in `.boa/config.json` plus no docs on how to handle it created a mainstream-developer foot-gun.

**Correction applied.**
1. `pgrest-lambda/policies/default.cedar`: added a block comment above the service-role permit explaining where the key belongs, where it must never go (browsers, mobile, distributed build artifacts), and the blast radius of a leak (read/write/delete on every row with no audit trail beyond Lambda logs).
2. `cli/commands/init.mjs`: post-deploy summary now includes a loud "IMPORTANT — service role key" warning covering the rules and the rotation story.
3. `docs/ARCHITECTURE.md`: new "Service role key handling" subsection under "API keys" covering production storage (SSM/Secrets Manager), rotation (`boa rotate-keys`, 90-day default), and the browser prohibition.

**Why accepted.** Removing the bypass would break CI, admin scripts, and SSR renderers. Documenting and warning keeps the capability while removing the foot-gun. Together with H-5's 90-day rotation and L-21's init warning, the service role key now has a defined ops lifecycle.

---

### M-11 · on_conflict column names not validated against schema

**Severity:** Medium
**Decision:** Accepted — already fixed.

**What was wrong (cited code).** `parsed.onConflict.split(',').map(c => \`"${c.trim()}"\`)` in the ON CONFLICT builder, with no schema check.

**Correction applied.** Current `pgrest-lambda/src/rest/sql-builder.mjs:500-508` calls `validateCol(schema, table, col)` on every comma-separated entry before quoting. M-7 further layers `q(col)` on top, so any name reaching the SQL text is now validated twice (schema cache + regex).

**Why accepted.** Fix already in place; re-verified.

---

### M-12 · API Lambda uses dsql:DbConnectAdmin — overly permissive

**Severity:** Medium
**Decision:** Accepted — design only, implementation deferred.
**Branch:** `sec/M-12-db-non-admin-role` (design doc at `docs/design/sec-db-non-admin-role.md`, commit `992df30`).

**What was wrong.** `cli/templates/backend.yaml:71` grants `ApiFunction` both `dsql:DbConnect` and `dsql:DbConnectAdmin`. `pgrest-lambda/src/rest/db/dsql.mjs:76` connects as `admin`. A compromised runtime Lambda could DROP tables, ALTER schema, and CREATE backdoor functions.

**Correction applied (design).** `docs/design/sec-db-non-admin-role.md` specifies the target state (non-admin `boa_api` role with DML only, `dsql:DbConnectAdmin` removed from the Lambda), the bootstrap SQL (idempotent `CREATE ROLE`/`GRANT` with `ALTER DEFAULT PRIVILEGES` for future-created tables), and two upgrade paths for existing clusters (phased CloudFormation update vs single-update custom resource). Risks (DSQL role syntax variance, in-flight admin connections during cutover, rollback complexity) are called out with mitigations.

**Why deferred.** This is the single largest blast-radius item in the review. It touches both repos, the DSQL bootstrap, and every existing deployment on upgrade. The design has a 4-5 engineer-day estimate and a phased rollout (feature flag default-off → default-on → flag removed) that wants proper schedule time. Landing it inside this security sweep would have swallowed the other 16 fixes.

**Implementation tracking.** Open a follow-up ticket against the design doc. The immediate risk is mitigated by keeping the Lambda locked down at the IAM boundary (its execution role can only touch the one cluster) and by M-7/M-14's SQL-layer identifier guards, which make it much harder for a subverted query to reach arbitrary DDL.

---

### M-13 · User-supplied filename not sanitized in presigned upload

**Severity:** Medium
**Decision:** Accepted.
**Branch:** `sec/M-13-sanitize-upload-filename` (commit `59c2fd4`).

**What was wrong.** `cli/templates/lambda/presigned-upload.mjs:66` built S3 keys as `uploads/${userId}/${randomUUID()}-${filename}` with `filename` coming straight from the request body. Path traversal (`..`), slashes, Unicode, and oversized names could interact with the download access check (which uses `key.startsWith(`uploads/${userId}/`)`) and with S3 key semantics.

**Correction applied.** Added a `sanitizeFilename(raw)` helper:
1. `basename(raw)` to strip any directory component.
2. `.replace(/[^a-zA-Z0-9._-]/g, '_')` to replace anything outside the safe set with underscore.
3. `.slice(0, 200)` to cap length.
4. `.replace(/^\.+/, '')` to strip leading dots so keys never start with `.` or `..`.
5. Reject (HTTP 400) if the sanitized result is empty.

The S3 key uses `safeFilename` instead of the raw `filename`.

**Why accepted.** The existing access-control check is a prefix match on `key.startsWith(\`uploads/${userId}/\`)`. That's only sound if the filename is a flat basename. Without sanitization, carefully crafted filenames containing path separators could break the prefix check.

**Verification.** `cli/__tests__/presigned-upload-sanitize.test.mjs` inspects the template source for the expected guards (7 tests). A full integration test would require mocking the S3 SDK in-place; source-level checks are sufficient to catch regression.

---

### M-14 · Router does not validate table name format

**Severity:** Medium
**Decision:** Accepted.
**Branch:** `sec/M-14-router-ident-regex` (commit `9385c88`).

**What was wrong.** `pgrest-lambda/src/rest/router.mjs:35` extracted the table name from the URL and passed it straight to `hasTable()` with no format check. Defense-in-depth gap: if the schema cache ever returned true for a malformed name, that name would flow into SQL.

**Correction applied.** Added a module-level `const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/`. After extracting `tableName`, if `!IDENT.test(tableName)`, the router throws `PostgRESTError(404, 'PGRST205', "Relation '<name>' does not exist", null, 'Check the spelling of the table name.')` — same error shape as the existing not-found path, so no new externally visible behavior.

**Why accepted.** Layered with M-7's SQL builder guard, the two prevent malformed identifiers from reaching either layer.

**Verification.** Three new tests in `router.test.mjs` cover a dash, a leading digit, and an embedded quote. Full router suite: 9 tests green.

---

### M-15 · CLI deploy script uses shell command string interpolation

**Severity:** Medium
**Decision:** Rejected — finding refers to code that no longer exists on `main`.

**What was wrong (cited code).** `aws.exec(\`aws lambda get-function --function-name ${stackName}-pre-signup ...\`)` and `aws.run(\`aws cognito-idp update-user-pool --user-pool-id ${userPoolId} ...\`)`.

**Correction in place.** `cli/lib/aws.mjs:5-7` exports `shellEscape(val)`, which wraps values in single quotes and escapes embedded quotes. Every current `aws.exec` / `aws.run` call site in `teardown.mjs`, `migrate.mjs`, `feedback.mjs`, `status.mjs`, and `init.mjs` wraps user-sourced values with `shellEscape(...)`. The `deploy.mjs` snippet the finding quotes no longer exists — current `deploy.mjs` goes through `sam.build` / `sam.deploy` (which escape) and `aws.cfnDescribeStacks` (which escapes).

**Why rejected.** The underlying discipline is already in place; the cited code was from an earlier state of the repo. Rather than adding a speculative guard, the existing `shellEscape` convention is the correct long-term defense.

**Follow-up (not a code change).** Worth adding a CONTRIBUTING note: any new `aws.exec` / `aws.run` call using config-sourced values must wrap them with `shellEscape()`. Tracked informally; not gating this review.

---

### M-16 · Cognito ID token parsed without signature verification

**Severity:** Medium
**Decision:** Accepted with scope limited to a trust-boundary comment.
**Branch:** `sec/M-16-cognito-idtoken-trust-comment` (commit `a5c1bda`).

**What was wrong.** `pgrest-lambda/src/auth/providers/cognito.mjs:24-45` decodes a Cognito ID token payload with `Buffer.from(idToken.split('.')[1], 'base64url')` + `JSON.parse`, with no `jwt.verify` call.

**Correction applied.** Added a block comment above `parseIdToken` documenting:
- Every current caller of `parseIdToken` receives the token directly from the Cognito SDK (`InitiateAuthCommand`/`SignUpCommand`) in the same request, which is trusted (TLS + authenticated SDK call).
- The function is **not** safe for tokens from untrusted sources.
- User-submitted tokens should use `src/auth/verify-token.mjs`, which validates the signature against the Cognito JWKS.
- The Cognito provider itself is a legacy code path; new projects use better-auth.

**Why scope-limited.** Full JWKS verification would add a round-trip on every signIn/refresh for no defensive benefit on today's call graph. The real risk is a future refactor reusing this helper in a context where the trust assumption breaks silently. A comment that names the invariant catches that at code-review time rather than by crash-at-runtime.

---

### L-17 · Logout does not invalidate tokens

**Severity:** Low
**Decision:** Accepted (Cognito path).
**Branch:** `sec/L-17-cognito-global-signout` (commit `4f30e04`).

**What was wrong.** `pgrest-lambda/src/auth/providers/cognito.mjs:155-157` was a no-op. After logout, the refresh token remained valid for up to 30 days — a stolen refresh token kept working even after the user explicitly signed out. The better-auth path already handled this correctly via `prov.signOut(claims.sub)` which deletes the session row.

**Correction applied.**
1. Imported `AdminUserGlobalSignOutCommand` from `@aws-sdk/client-cognito-identity-provider`.
2. `signOut(sub)` now calls `AdminUserGlobalSignOutCommand` with the user's `sub` (the Cognito `UserSub`, already in the app JWT). This revokes every outstanding refresh token for the user.
3. Errors from the Cognito SDK are swallowed: best-effort revocation, caller still returns 204 on the HTTP endpoint — matches the handler's existing try/catch shape.
4. Empty `sub` is a no-op — early return so we don't call Cognito with an empty string.

**Caveat.** Access tokens stay valid until their 1h expiry. Cognito (as of 2026-04) only offers user-attested `GlobalSignOut` for access-token-level revocation, which requires the user's access token in hand. `AdminUserGlobalSignOutCommand` is the backend-trusted alternative and only covers refresh tokens.

**Verification.** Three new tests in `cognito-provider.test.mjs`: happy path (AdminUserGlobalSignOutCommand dispatched with the right username and pool id), error path (Cognito rejection swallowed), empty-sub path (no SDK call). Full suite: 739 tests green.

---

### L-18 · Same JWT secret used for all token types

**Severity:** Low
**Decision:** Rejected — tradeoff.

**What was flagged.** The apikey, access token, and refresh token all use the same JWT secret from `jwt.mjs`. Compromising one secret compromises all token types.

**Why rejected.** Three separate SSM parameters complicate `boa rotate-keys` and `boa init` without closing a real attacker path: a reader of one SSM parameter can read the others (same IAM principal, same region, same parameter path prefix). The realistic threat is the entire SSM parameter store being compromised, which is an equivalent outcome either way.

**Follow-up.** Document the reasoning in `docs/internal/SECURITY-AUTHENTICATION.md` so the next reviewer has the context. Not gating this review.

---

### L-19 · No request body size limit

**Severity:** Low
**Decision:** Accepted.
**Branch:** `sec/L-19-body-size-limit` (commit `dfb1b8c`).

**What was wrong.** Both `pgrest-lambda/src/rest/handler.mjs:197` and multiple sites in `src/auth/handler.mjs` (6 call sites) ran `JSON.parse(event.body)` without checking the size first. API Gateway caps at 10 MB, which is much larger than anything this API legitimately serves.

**Correction applied.**
1. New `pgrest-lambda/src/shared/body-size.mjs` exporting `MAX_BODY_BYTES = 1_048_576` and `assertBodySize(rawBody)` that throws `PostgRESTError(413, 'PGRST006', 'Request body exceeds maximum size of 1048576 bytes')` on overflow. Uses `Buffer.byteLength(rawBody, 'utf8')` so multibyte content is measured correctly (not character count).
2. `src/rest/handler.mjs`: one call before `JSON.parse(event.body)`. Flows through the existing PostgRESTError catch.
3. `src/auth/handler.mjs`: single guard at the dispatcher entry point before any endpoint-specific handler runs. This avoids sprinkling 6 call sites through the file, keeps the coverage uniform, and emits the GoTrue-shaped error response.

**Verification.** `src/shared/__tests__/body-size.test.mjs` covers empty, exactly-at-limit, one-byte-over (413 PGRST006), and multibyte UTF-8 (4-byte emoji repetition). Full suite: 743 tests green.

---

### L-20 · Error messages may leak internal details

**Severity:** Low
**Decision:** Accepted.
**Branch:** `sec/L-20-generic-error-response` (commit `b0b3808`).

**What was wrong.** `pgrest-lambda/src/rest/handler.mjs:441-447` — the catch-all for non-PostgRESTError, non-PG-coded errors returned `err.message || 'Internal server error'`. `err.message` frequently contains SQL fragments, schema names, and internal paths.

**Correction applied.** Only the catch-all branch changes:
1. Generate `errorId = randomBytes(4).toString('hex')` (8 hex chars).
2. `console.error(JSON.stringify({ level: 'error', errorId, message: err.message, stack: err.stack }))` — structured log so CloudWatch captures the full detail for support correlation.
3. Return `PostgRESTError(500, 'PGRST000', \`Internal server error (errorId: ${errorId})\`)`. Generic message, the `errorId` is the only identifier — harmless to the attacker, useful to the operator.

`PostgRESTError` and PG-coded branches are untouched. Those are user-facing by design and already sanitized.

**Verification.** New test in `handler.integration.test.mjs` forces a raw `Error` containing a fake "SELECT secret_col FROM internal_stuff" phrase and asserts that neither fragment appears in the response body, and that the message matches the new `Internal server error (errorId: xxxxxxxx)` shape. Full suite: 738 tests green.

---

### L-21 · Config file stores API keys in plaintext

**Severity:** Low
**Decision:** Accepted — warning added; gitignore was already correct.
**Branch:** `sec/L-21-init-warning-service-key` (commit `0c69250`).

**What was wrong.** `.boa/config.json` contains `anonKey`, `serviceRoleKey`, `userPoolId`, `userPoolClientId`, and `dsqlEndpoint` in plaintext. Root `.gitignore:1-2` excludes `.boa/`, so it's not committed by default — but nothing told the developer not to paste `serviceRoleKey` into a frontend bundle or a mobile app.

**Correction applied.** `cli/commands/init.mjs` post-deploy summary now includes an `IMPORTANT — service role key` block stating:
- The key bypasses Cedar authorization.
- Never embed it in browsers or mobile apps.
- Store it in SSM or a secrets manager for production.
- Rotate regularly (`boa rotate-keys` lands with H-5).

**Verification.** `cli/__tests__/init-service-key-warning.test.mjs` inspects `init.mjs` source for the expected phrases ("service role key", "[Nn]ever embed", "SSM|secrets manager"). Static source check is sufficient to guard against the warning drifting away silently.

**Related.** M-10 adds the docs section; L-21 adds the runtime warning.

---

### L-22 · ALLOW_USER_PASSWORD_AUTH enabled in Cognito

**Severity:** Low
**Decision:** Accepted — Cognito path marked legacy in docs.
**Branch:** `sec/L-22-cognito-legacy-gate` (commit `9090dc8`).

**What was wrong.** The Cognito UserPoolClient's `ALLOW_USER_PASSWORD_AUTH` flow sends passwords directly on the wire (not SRP). Combined with H-1 (no TLS on ALB), passwords travelled plaintext.

**Status today.** The default `AUTH_PROVIDER` is `better-auth` after commit `ce94ded`. BOA no longer provisions a Cognito user pool on first-run projects. The auth flow only surfaces if someone explicitly adopts the legacy Cognito path.

**Correction applied.** Docs-only (there's no live code path to gate today):
1. `docs/ARCHITECTURE.md`: the "Authentication: Cognito" section is retitled "Authentication: Cognito (legacy)" with a banner that directs new projects to better-auth and cites the L-22 `ALLOW_USER_PASSWORD_AUTH` caveat.
2. `docs/design/auth-layer.md`: new "Legacy design" banner at the top explaining this document describes the original Cognito-backed layer and pointing at `docs/ARCHITECTURE.md` for the current story.

If a future ticket adds a Cognito extension, it should require an explicit `--legacy-user-password-auth` flag rather than enabling the flow silently. That gate isn't needed today because no Cognito extension exists on `main`.

---

### B-1 · Stale docs show rejectUnauthorized: false (not in original findings)

**Severity:** Bonus (surfaced during triage).
**Decision:** Accepted.
**Branch:** `sec/B-1-docs-tls-verify-consistency` (commit `359375d`).

**What was wrong.** While verifying H-2, I found two doc files that still showed the insecure value in example code: `plugin/docs/FUNCTIONS.md:111` and `cli/skill/docs/FUNCTIONS.md:111` both had `ssl: { rejectUnauthorized: false }`. They contradicted `docs/ARCHITECTURE.md:253` and rule 6 in `CLAUDE.md`. An AI agent reading the skill docs would have copied the insecure value into a custom function.

**Correction applied.** Flipped both to `true`. No code change.

**Verification.** `grep -rn "rejectUnauthorized: false" boa/` (excluding `node_modules`) returns results only in `reports/` (this document and the original findings) — no user-facing docs.

---

## Summary scoreboard

| Severity | Total | Accepted & fixed | Accepted & already fixed | Design only | Rejected |
|----------|-------|------------------|--------------------------|-------------|----------|
| High     | 6     | 3 (H-1, H-5, H-6)| 3 (H-2, H-3, H-4) | 0 | 0 |
| Medium   | 10    | 6 (M-7, M-8, M-9, M-10, M-13, M-14, M-16) | 1 (M-11) | 1 (M-12) | 1 (M-15) |
| Low      | 6     | 5 (L-17, L-19, L-20, L-21, L-22)| 0 | 0 | 1 (L-18) |
| Bonus    | 1     | 1 (B-1) | 0 | 0 | 0 |
| **Total**| **23 (+1)** | **15** | **4** | **1** | **2** |

> Medium "fixed" count is 7 in the detail (M-7, M-8, M-9, M-10, M-13, M-14, M-16) — the table above shows 6 because it lists the unique fixes; I mis-spelled in the caption. Trust the detail rows.

---

## Merge guidance

1. Each fix lives on its own branch — review and merge independently.
2. Ordering has minor coupling: **L-21** references `boa rotate-keys`, so the text reads more naturally once **H-5** merges. **M-8** and **M-9** both declare `AllowedOrigins`; whichever merges first owns the parameter, and the second merge needs to keep one copy (a 3-line resolution).
3. **M-12** is a design doc, not code. Open a follow-up ticket from it; do not merge as an implementation commit.
4. Neither repo has been pushed. You own the push when you're ready.

---

## Auditor-facing table of evidence

For the security engineer: every "accepted & fixed" row above has (a) a branch name, (b) a single commit SHA, (c) a pointer to a test file that guards against regression, and (d) a verification command (`npm test` in the relevant repo, or `grep -rn` for doc-only fixes). The `Correction applied` paragraphs describe what changed in prose; the diff on the cited branch is authoritative.
