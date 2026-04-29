# Security Review Remediation Plan — 2026-04-28

Source: `boa-findings.json` (23 items from Security Review).
Verified against: `boa/` on `main` (commit `d2f8a22`) and `pgrest-lambda/` HEAD.

Each item lists: **decision**, **where the code lives now**, and **the
exact change** that will ship. "Already fixed" items describe the fix
that landed previously so the reviewer can verify it on disk.

---

## Open questions (need your call before I edit)

1. **M-12 (non-admin DB role)** — biggest blast radius. Touches both
   repos and the migration bootstrap. Accept now, or defer to a
   follow-up ticket?
2. **H-1 (ALB HTTPS)** — require user to pass a `CertificateArn` when
   running `boa extend alb`? (No cert → extension refuses to install.)
3. **Scope** — apply fixes in `boa/` only, or also in `pgrest-lambda/`?
   BOA pins `pgrest-lambda@0.2.0`; changes in that repo don't ship to
   BOA users until we bump the pin.
4. **Report location** — default:
   `reports/security-review-2026-04-28.md`. Change?

---

## High severity

### H-1 — ALB extension serves HTTP only

- **Decision:** Accept
- **Status on main:** Still present in `cli/extensions/alb/fragment.yaml`
  (lines 72-81 open port 80 to `0.0.0.0/0`; lines 114-119 define an
  HTTP:80 listener).
- **Remediation:**
  - Add a `CertificateArn` parameter to `extensions/alb/fragment.yaml`
    (required — extension refuses without it).
  - Add an HTTPS:443 listener using that cert with
    `SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06`.
  - Convert the HTTP:80 listener to a permanent redirect to HTTPS:443.
  - Security group: open 443 ingress; keep 80 open only so the redirect
    works.
  - Change the `AlbUrl` output to `https://…`.
  - Update `cli/commands/extend.mjs` to require the cert arg.
  - Update `cli/extensions/alb/README.md` to document the requirement
    and link to ACM.

### H-2 — TLS certificate verification disabled on DSQL

- **Decision:** Accept — **already fixed**
- **Verify:**
  - `pgrest-lambda/src/rest/db/dsql.mjs:84` →
    `ssl: { rejectUnauthorized: true }`
  - `pgrest-lambda/src/auth/providers/better-auth.mjs:80` → same
  - `pgrest-lambda/src/rest/db/postgres.mjs:9-10` → same default
  - Regression test:
    `pgrest-lambda/src/auth/__tests__/better-auth-dsql-pool.test.mjs:104-116`

### H-3 — Cognito pre-signup auto-confirms all users

- **Decision:** Accept — **already fixed**
- **Verify:**
  - Default `AUTH_PROVIDER` switched to `better-auth` (commit `ce94ded`).
  - `cli/templates/backend.yaml` no longer provisions a Cognito user
    pool, a `PreSignUpFunction`, or related triggers.
  - better-auth issues an email-verification flow before first sign-in
    (see `pgrest-lambda/src/auth/providers/better-auth.mjs`).

### H-4 — Refresh token exposes Cognito provider refresh token

- **Decision:** Accept — **already fixed**
- **Verify:** `pgrest-lambda/src/auth/jwt.mjs:44` now signs
  `{ sub, role, sid }` where `sid` is an opaque session id. The raw
  Cognito refresh token is no longer embedded in the app JWT.

### H-5 — API keys expire in 10 years, no rotation

- **Decision:** Accept
- **Status on main:** `cli/lib/keys.mjs:20` →
  `TEN_YEARS = 10 * 365 * 24 * 3600`.
- **Remediation:**
  - Change `keys.mjs`: `generateKeys(secret, { expirySeconds = 90*86400 })`.
  - Add `cli/commands/rotate-keys.mjs`:
    - Reads `.boa/config.json`, generates new anon + service keys.
    - Writes them back, preserves everything else.
    - `--rotate-secret` flag also rotates the JWT SSM secret.
  - Wire command into `cli/bin/boa.mjs`.
  - `init.mjs` post-deploy output adds: "Keys expire in 90 days — run
    `boa rotate-keys` before then."

### H-6 — `/_refresh` endpoint reloads schema without auth

- **Decision:** Accept
- **Status on main:** `pgrest-lambda/src/rest/handler.mjs:234-243` and
  `router.mjs:13` — no role check.
- **Remediation:** In `handler.mjs`, before the `refresh` branch,
  require `role === 'service_role'`; otherwise return
  `401 PGRST301`. The BOA authorizer already sets `role` from the
  presented apikey, so no API-gateway-side change is needed.

---

## Medium severity

### M-7 — Identifiers interpolated without secondary validation

- **Decision:** Accept (defense-in-depth)
- **Status on main:** `pgrest-lambda/src/rest/sql-builder.mjs` —
  identifiers are validated against the schema cache but not
  pattern-checked at the SQL builder layer.
- **Remediation:**
  - Add `IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/` and `quoteIdent(name)` at
    the top of `sql-builder.mjs`. `quoteIdent` throws
    `PostgRESTError(400, 'PGRST204', …)` on mismatch.
  - Replace every `` `"${table}"` `` / `` `"${col}"` `` interpolation
    in the file (~25 sites) with `quoteIdent()`.
  - This is additive — schema validation stays.

### M-8 — S3 bucket CORS `AllowedOrigins: '*'`

- **Decision:** Accept
- **Status on main:** `cli/templates/backend.yaml:166-167`.
- **Remediation:**
  - Add `AllowedOrigins` CloudFormation parameter (CommaDelimitedList,
    default empty).
  - If empty: omit the `CorsConfiguration` block (same-origin requests
    still work — CORS only gates cross-origin).
  - If populated: pass the list verbatim to `AllowedOrigins`.
  - Plumb the parameter through `cli/commands/deploy.mjs` and
    document in the deploy output.

### M-9 — Lambda responses use `Access-Control-Allow-Origin: *`

- **Decision:** Accept
- **Status on main:**
  - `cli/templates/lambda/presigned-upload.mjs:24-28`.
  - `cli/templates/backend.yaml:87, 93, 98` (API Gateway CORS +
    `GatewayResponses`).
- **Remediation:**
  - `presigned-upload.mjs`: read `ALLOWED_ORIGINS` env var
    (comma-separated). Validate request `Origin` against the allowlist
    and echo only a matching origin. If the list is empty, respond
    with no CORS headers (same-origin still works).
  - `backend.yaml`: replace `AllowOrigin: "'*'"` with a
    `!Join [',', !Ref AllowedOrigins]`-derived value; if empty, omit
    the CORS block entirely.
  - `deploy.mjs`: forward the parameter.

### M-10 — Service role Cedar policy bypasses authorization

- **Decision:** Accept (hardening — the bypass is deliberate)
- **Status on main:** `pgrest-lambda/policies/default.cedar:22-26`.
- **Remediation:**
  - Banner comment at the top of `default.cedar` explaining the
    constraint and the browser-exposure ban.
  - `cli/commands/init.mjs`: after generating keys, print a loud
    warning — "NEVER embed the service role key in browser code."
  - `docs/ARCHITECTURE.md`: add a "Service role key handling" section
    (storage: SSM/Secrets Manager; rotation: `boa rotate-keys`;
    strict browser prohibition).

### M-11 — `on_conflict` column names not validated

- **Decision:** Accept — **already fixed**
- **Verify:** `pgrest-lambda/src/rest/sql-builder.mjs:500-508` —
  each comma-separated column now passes through
  `validateCol(schema, table, col)` before being quoted.

### M-12 — API Lambda uses `dsql:DbConnectAdmin`

- **Decision:** Accept — **recommend deferral**
- **Status on main:** `cli/templates/backend.yaml:71` and
  `pgrest-lambda/src/rest/db/dsql.mjs:76`.
- **Remediation (if accepted now):**
  - `backend.yaml`: drop `dsql:DbConnectAdmin` from `ApiFunction`;
    keep `dsql:DbConnect`.
  - `dsql.mjs`: switch to `getDbConnectAuthToken()`; connect as
    non-admin role `boa_api` instead of `admin`.
  - Add bootstrap in `cli/commands/deploy.mjs` — after first cluster
    create, connect as admin and run
    `CREATE ROLE boa_api LOGIN; GRANT CONNECT …; GRANT SELECT, INSERT,
    UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO boa_api;`.
  - Migration CLI (`migrate.mjs`) keeps `DbConnectAdmin`.
- **Why defer:** Biggest blast radius — touches both repos, the
  bootstrap path, and every existing deployment on upgrade. Flag as
  follow-up ticket; ship the smaller H/M items first.

### M-13 — User-supplied filename not sanitized

- **Decision:** Accept
- **Status on main:** `cli/templates/lambda/presigned-upload.mjs:66`.
- **Remediation:** Replace the raw interpolation with:
  1. `path.basename(filename)` (strip directory components).
  2. `.replace(/[^a-zA-Z0-9._-]/g, '_')`.
  3. Cap at 200 chars.
  4. Reject (`400`) if empty after sanitization.

### M-14 — Router does not validate table name format

- **Decision:** Accept
- **Status on main:** `pgrest-lambda/src/rest/router.mjs:35`.
- **Remediation:** Before the schema-cache lookup, reject any
  `tableName` that doesn't match `/^[A-Za-z_][A-Za-z0-9_]*$/` with
  `404 PGRST205` (same shape as today's not-found path — no new
  surface).

### M-15 — CLI shell command string interpolation

- **Decision:** Reject — **already fixed**
- **Verify:**
  - `cli/lib/aws.mjs:5-7` exports `shellEscape()`.
  - All current call sites — `teardown.mjs`, `migrate.mjs`,
    `feedback.mjs`, `status.mjs`, `init.mjs` — wrap user-sourced
    values with `shellEscape()`.
  - The `deploy.mjs` snippet the finding quotes (Cognito
    `update-user-pool`) no longer exists on `main`; deploy now uses
    `sam.build` / `sam.deploy` and `aws.cfnDescribeStacks` (which
    escapes).
- **Follow-up (not a code change):** CONTRIBUTING note —
  "any new `aws.exec` / `aws.run` call using config-sourced values
  must wrap them with `shellEscape()`."

### M-16 — Cognito ID token parsed without signature verification

- **Decision:** Accept (scope-limited)
- **Status on main:**
  `pgrest-lambda/src/auth/providers/cognito.mjs:24-45`.
- **Remediation:** Add a block comment at `parseIdToken` documenting
  that the caller receives the token from the Cognito SDK
  (`InitiateAuthCommand`) in the same request, and that the function
  is **not safe** for tokens from untrusted sources. No behavior
  change. (Cognito is legacy-only; this function may be deleted
  outright in a later cleanup.)

---

## Low severity

### L-17 — Logout doesn't invalidate tokens

- **Decision:** Accept (partial)
- **Status on main:**
  - better-auth path (`pgrest-lambda/src/auth/handler.mjs:305-328`)
    already calls `prov.signOut(claims.sub)` which deletes the
    session row — effective revocation.
  - Cognito path
    (`pgrest-lambda/src/auth/providers/cognito.mjs:155-157`) is a
    no-op.
- **Remediation:** Cognito provider's `signOut` calls
  `GlobalSignOutCommand` with the access token. Access token remains
  valid until its 1h expiry in both paths; document that in
  `docs/guides/auth/jwts.md`.

### L-18 — Same JWT secret for all token types

- **Decision:** Reject (tradeoff)
- **Rationale:** Three secrets complicate `boa rotate-keys` and
  `boa init` without closing a real attacker path — a reader of one
  SSM parameter can read the others. Document the reasoning in
  `docs/internal/SECURITY-AUTHENTICATION.md`.

### L-19 — No request body size limit

- **Decision:** Accept
- **Status on main:** `pgrest-lambda/src/rest/handler.mjs:197` and
  `src/auth/handler.mjs` multiple sites — `JSON.parse(event.body)`
  with no pre-check.
- **Remediation:** Introduce `MAX_BODY_BYTES = 1_048_576`. Before each
  `JSON.parse`, check `Buffer.byteLength(event.body, 'utf8')`. Return
  `413 PGRST006` on overflow. API Gateway caps at 10 MB; this adds an
  explicit bound earlier.

### L-20 — Error messages may leak internal details

- **Decision:** Accept
- **Status on main:** `pgrest-lambda/src/rest/handler.mjs:441-447` —
  catch-all echoes `err.message`.
- **Remediation:** In the non-`PostgRESTError`, non-PG-coded branch,
  log `err.message` and `err.stack` to stderr with a short random
  `errorId`. Return a generic `"Internal server error"` body plus the
  same `errorId` for support correlation. Never return the raw
  `err.message`.

### L-21 — Config file stores API keys in plaintext

- **Decision:** Accept — **mostly covered**
- **Status on main:** `.gitignore:1-2` lists `.boa/`, so
  `.boa/config.json` isn't committed.
- **Remediation:**
  - `cli/commands/init.mjs` prints a post-deploy warning —
    ".boa/config.json contains secrets; never commit, never ship to
    a browser."
  - Future work (tracked, not in this patch): optional SSM-backed
    storage for the service role key.

### L-22 — `ALLOW_USER_PASSWORD_AUTH` enabled

- **Decision:** Accept (conditional)
- **Status on main:** Not on the default path — better-auth replaced
  Cognito. Only surfaces if a user opts into the Cognito path.
- **Remediation:**
  - Mark the Cognito extension legacy in `docs/design/auth-layer.md`.
  - Require `--legacy-user-password-auth` opt-in flag if a future
    user provisions a Cognito UserPoolClient through BOA.

---

## Not in the findings list (bonus)

### B-1 — Stale doc examples show `rejectUnauthorized: false`

- **Decision:** Accept (doc fix)
- **Status on main:**
  - `plugin/docs/FUNCTIONS.md:111` — example still shows `false`.
  - `cli/skill/docs/FUNCTIONS.md:111` — same.
  - Contradicts `docs/ARCHITECTURE.md:253` (correct value) and
    rule 6 in `CLAUDE.md`.
- **Remediation:** Flip both doc copies to `true`.

---

## Execution order (once approved)

1. Doc-only fixes: **B-1**, **M-10** (warnings + comment), **M-15**
   (CONTRIBUTING note), **L-18** (rationale note).
2. pgrest-lambda small code fixes: **H-6**, **M-7**, **M-14**,
   **M-16**, **L-17**, **L-19**, **L-20**.
3. BOA template / CLI code fixes: **H-5**, **M-8**, **M-9**, **M-13**.
4. ALB extension rewrite: **H-1**.
5. Deferred (unless you say otherwise): **M-12**.
6. Final report at `reports/security-review-2026-04-28.md` cataloging
   every item with verification evidence.

---

## Summary counts

| Severity | Total | Already fixed | Accept & change | Reject | Defer |
|----------|-------|---------------|-----------------|--------|-------|
| High     | 6     | 3 (H-2, H-3, H-4) | 3 (H-1, H-5, H-6) | 0 | 0 |
| Medium   | 10    | 1 (M-11)        | 7 | 1 (M-15) | 1 (M-12) |
| Low      | 6     | 0               | 5 | 1 (L-18) | 0 |
| Bonus    | 1     | 0               | 1 (B-1) | 0 | 0 |
| **Total**| **23 (+1)** | **4**     | **16**          | **2**  | **1** |
