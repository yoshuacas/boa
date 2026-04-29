# Security Review — rring Feature Prompts

Source findings: `boa-findings.json` (2026-04-28).
Execution: one feature branch per fix, full rring loop
(`start → design → task → work → review → finalize`), except **M-12**
which is design-only.

Branch naming: `sec/<fix-id>-<short-slug>`.
Rring feature names use the same slug (without the `sec/` prefix).

If `rring review` flags critical or high issues, the driver runs
`rring iter` + `rring work` + `rring review` once more before
finalizing.

The 4 already-fixed items (H-2, H-3, H-4, M-11) and the 2 rejected
items (M-15, L-18) do **not** run through rring — they appear only in
the final report with verification / rationale.

---

## H-1 · `alb-https-listener` · repo: boa

**Full rring loop.**

```
Add HTTPS support to the ALB extension so traffic is encrypted end-to-end.

Context:
- cli/extensions/alb/fragment.yaml currently provisions only an HTTP:80
  listener (lines 114-119) and opens port 80 to 0.0.0.0/0 in
  AlbSecurityGroup (lines 72-81). The `AlbUrl` output at line 133
  returns an http:// URL.
- This is the legacy traffic layer — default is now API Gateway + WAF
  (HTTPS by default). ALB is opt-in via `boa extend alb`.
- A security review flagged that users who opt into the ALB extension
  send every signup, login, JWT, and apikey over plaintext.

Required changes:
1. Add a required `CertificateArn` parameter to fragment.yaml. The
   `boa extend alb` command must refuse to install the extension
   without a cert ARN (update cli/commands/extend.mjs).
2. Add an HTTPS:443 listener using that cert with
   `SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06`, forwarding to
   the existing AlbTargetGroup.
3. Convert the existing HTTP:80 listener to a permanent redirect
   (HTTP 301) to HTTPS:443.
4. AlbSecurityGroup: open 443 ingress from 0.0.0.0/0; keep 80 open
   only so the redirect can happen.
5. Change `AlbUrl` output to https://... so downstream config
   (.boa/config.json apiUrl) is correct.
6. Update cli/extensions/alb/README.md: document the cert requirement
   and show an `aws acm request-certificate` example.
7. Update cli/commands/extend.mjs to parse `--certificate-arn <arn>`
   (required) and pass it into the merged template as a parameter
   override.

Acceptance:
- `boa extend alb` without `--certificate-arn` exits non-zero with a
  helpful error.
- Deployed stack serves 443 only (80 is a redirect). Verified by an
  `aws elbv2 describe-listeners` check the design should propose for
  `boa verify`.
- No plaintext paths in the ALB extension.
```

---

## H-5 · `rotate-api-keys` · repo: boa

**Full rring loop.**

```
Replace the 10-year API key lifetime with 90 days and add a
`boa rotate-keys` command.

Context:
- cli/lib/keys.mjs:20 sets TEN_YEARS = 10*365*24*3600 and signs both
  anonKey and serviceRoleKey with that expiry.
- There is no rotation command today; the only way to rotate is to
  regenerate the JWT secret and redeploy, which invalidates every
  user session.
- Security review: a leaked serviceRoleKey (which bypasses Cedar)
  gives full DB access for up to 10 years.

Required changes:
1. cli/lib/keys.mjs: change `generateKeys(secret)` to
   `generateKeys(secret, { expirySeconds = 90*86400 } = {})`. Keep
   backwards compatibility for callers passing only `secret`. Remove
   the TEN_YEARS constant entirely.
2. Add cli/commands/rotate-keys.mjs:
   - Loads .boa/config.json (require it).
   - Generates new anon + service keys with the 90-day default.
   - Writes .boa/config.json with the new keys, preserving every
     other field.
   - Supports a `--rotate-secret` flag that also rotates the JWT
     SSM secret (/<project>/jwt-secret) via aws.ssmPutParameter, and
     re-generates keys signed by the new secret. Prints a warning
     that all existing user sessions will be invalidated.
   - Prints the new keys (redacted preview) and where they were
     written.
3. cli/bin/boa.mjs: wire the new subcommand.
4. cli/commands/init.mjs: after printing keys, add a post-deploy
   note: "These keys expire in 90 days. Run `boa rotate-keys` before
   expiration to avoid downtime."
5. Unit tests in cli/__tests__ covering: default expiry, custom
   expiry, rotate-keys preserves other config fields,
   --rotate-secret updates SSM, exits cleanly when config is missing.

Acceptance:
- `boa rotate-keys` updates config in place without redeploy.
- `--rotate-secret` also updates SSM.
- Generated keys have `exp` ~90 days from now (verify by decoding).
- All existing tests still pass.
```

---

## H-6 · `refresh-endpoint-auth` · repo: pgrest-lambda

**Full rring loop.**

```
Require service-role authentication for the POST /rest/v1/_refresh
endpoint.

Context:
- src/rest/router.mjs:13 routes `/_refresh` to type: 'refresh'.
- src/rest/handler.mjs:234-243 handles the refresh route with no role
  check; it reloads the schema cache, refreshes Cedar policies, and
  returns the full OpenAPI spec as the response.
- Anyone unauthenticated can call this and enumerate the schema.

Required changes:
1. In src/rest/handler.mjs, at the start of the `refresh` branch,
   require `role === 'service_role'`. Otherwise throw
   `PostgRESTError(401, 'PGRST301', 'Refresh requires service_role')`.
   The caller's role is already available in the handler scope
   (extracted from event.requestContext.authorizer).
2. Add tests in src/rest/__tests__ covering:
   - anon role → 401 PGRST301, no refresh performed
   - authenticated role → 401 PGRST301
   - service_role → 200 with the regenerated spec
   - GET /rest/v1/_refresh still returns 405 (existing behavior)
3. Update any relevant docs in docs/ if they reference `_refresh`.

Acceptance:
- _refresh rejects all non-service_role callers with 401.
- Existing test suite green, new tests pass.
```

---

## M-7 · `sql-builder-quote-ident` · repo: pgrest-lambda

**Full rring loop.**

```
Add defense-in-depth identifier validation at the SQL builder layer.

Context:
- src/rest/sql-builder.mjs interpolates table and column names into
  SQL using template literals (`"${table}"`, `"${col}"`). Today the
  only defense is schema-cache validation in the calling code.
- If any future code path reaches the SQL builder without going
  through schema validation, it becomes a SQL injection vector.

Required changes:
1. At the top of src/rest/sql-builder.mjs add:
   - `const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;`
   - `function quoteIdent(name) { ... }` that throws
     `PostgRESTError(400, 'PGRST204', "'" + name + "' is not a valid
     identifier")` on non-match, otherwise returns `"${name}"` with
     double quotes.
2. Replace every raw `"${table}"` / `"${col}"` / `"${rel.toTable}"`
   / etc. interpolation in the file with `quoteIdent(name)`. Around
   25 sites — grep for `` `"${ ``.
3. Keep existing schema-cache validation untouched (this is
   additive).
4. Tests in src/rest/__tests__:
   - buildSelect with a malicious table name (e.g. `users"; DROP`) —
     now rejected with 400 PGRST204 at the SQL builder, not just at
     schema-cache.
   - Existing tests still pass (generated SQL shape unchanged).

Acceptance:
- No raw `` `"${ `` identifier interpolation remains in
  sql-builder.mjs.
- New tests cover the defense-in-depth path.
```

---

## M-8 · `s3-cors-allowlist` · repo: boa

**Full rring loop.**

```
Replace S3 bucket CORS `AllowedOrigins: '*'` with a configurable
allowlist.

Context:
- cli/templates/backend.yaml:166-167 sets S3 CorsConfiguration
  AllowedOrigins to ['*'], allowing any origin to PUT/GET through
  presigned URLs.

Required changes:
1. Add an `AllowedOrigins` CloudFormation parameter (CommaDelimitedList,
   default empty string) to cli/templates/backend.yaml.
2. Use `Fn::If` so that when AllowedOrigins is empty, the entire
   CorsConfiguration block is omitted (same-origin uploads still
   work; only cross-origin is blocked). When populated, pass the
   list verbatim to AllowedOrigins.
3. Plumb the parameter through cli/commands/deploy.mjs and
   cli/lib/sam.mjs so users can set it via `.boa/config.json`
   (`allowedOrigins: ["https://app.example.com"]`).
4. Update .boa/config.json schema docs if they exist
   (docs/ARCHITECTURE.md or equivalent).
5. Post-deploy output in cli/commands/deploy.mjs: if AllowedOrigins
   is empty, print a note explaining how to configure it.

Acceptance:
- Default deploy (no allowedOrigins in config) produces a bucket
  with no CORS rules. Cross-origin fetch is blocked by the browser.
- Setting allowedOrigins: ["https://app.example.com"] and
  redeploying produces exactly that AllowedOrigins value on the
  bucket (verify with aws s3api get-bucket-cors).
```

---

## M-9 · `api-cors-allowlist` · repo: boa

**Full rring loop.**

```
Replace Access-Control-Allow-Origin: * in Lambda and API Gateway
responses with an allowlist echo.

Context:
- cli/templates/lambda/presigned-upload.mjs:24-28 sets
  `Access-Control-Allow-Origin: *`.
- cli/templates/backend.yaml:87, 93, 98 set `AllowOrigin: "'*'"` on
  the API Gateway Cors block and GatewayResponses.
- A malicious site can make authenticated cross-origin calls using
  cookies or credentials if the browser permits.

Required changes:
1. cli/templates/lambda/presigned-upload.mjs:
   - Read `ALLOWED_ORIGINS` env var (comma-separated). Parse into a
     Set at cold start.
   - On each request, compare the `Origin` header (case-insensitive
     header lookup) against the allowlist. If it matches, echo that
     exact origin in `Access-Control-Allow-Origin` and add `Vary:
     Origin`. If no match, omit CORS headers entirely (request will
     still succeed for same-origin; cross-origin blocked by
     browser).
   - If the allowlist is empty, always omit CORS headers.
2. cli/templates/backend.yaml:
   - Add `AllowedOrigins` parameter (reuse or match the S3 one from
     M-8). Join with commas for the CORS Configuration string.
   - GatewayResponses: use a `Fn::Sub` that substitutes the
     allowlist, or conditionally include the CORS headers only when
     the parameter is non-empty.
   - ApiFunction: add `ALLOWED_ORIGINS` env var sourced from the
     parameter (comma-separated).
3. cli/commands/deploy.mjs: forward the allowedOrigins config into
   the SAM parameter.
4. Tests for the Lambda's CORS logic under cli/__tests__:
   - empty allowlist → no CORS headers
   - matching origin → echoed
   - non-matching origin → no CORS headers

Acceptance:
- No `*` values remain in CORS configuration on the default deploy.
- Per-request origin echo works end-to-end (verified by the design's
  proposed curl-based test).
```

Note: M-8 and M-9 share the `AllowedOrigins` concept. If the design
agent proposes merging them into one prompt, that's acceptable —
mark M-9 as completed when M-8 lands and vice versa.

---

## M-10 · `service-role-warnings` · repo: boa + pgrest-lambda

**Full rring loop.** (This single feature spans both repos.)

```
Harden the service-role bypass through documentation and CLI
warnings — the bypass itself is deliberate design.

Context:
- pgrest-lambda policies/default.cedar lines 22-26 grant
  service_role unrestricted action on all resources. This is by
  design; service_role is for backend-only, trusted contexts.
- boa cli/commands/init.mjs generates the serviceRoleKey and writes
  it to .boa/config.json in plaintext. No warning is printed about
  browser exposure.
- A developer who pastes serviceRoleKey into frontend code loses
  all authorization.

Required changes:

In pgrest-lambda:
1. Add a banner comment to policies/default.cedar above the
   ServiceRole permit block, explaining:
   - The bypass is deliberate.
   - service_role is only for server-side/CI contexts.
   - Never embed the service role key in browser code.
   - How to audit which code paths assume service_role.

In boa:
2. cli/commands/init.mjs: immediately after the keys are generated
   and printed, print a loud warning:
   ```
   ! Service role key bypasses authorization. NEVER embed it in
   ! browser code or mobile apps. Use it only in trusted server
   ! contexts (CI, backend services, SSR). Store it in SSM or a
   ! secrets manager for production.
   ```
3. docs/ARCHITECTURE.md: add a "Service role key handling" section
   covering storage (SSM / AWS Secrets Manager), rotation
   (`boa rotate-keys`), and the browser prohibition.

Acceptance:
- `boa init` prints the warning on first run.
- docs/ARCHITECTURE.md includes the new section.
- policies/default.cedar has the banner comment.

Cross-repo note: both repos may need their own commits. The design
should split the work into two tasks: one per repo.
```

---

## M-12 · `db-non-admin-role` · repo: boa + pgrest-lambda · **DESIGN ONLY**

**`rring design` only. No task, work, review, or finalize.**

```
Design a migration from `dsql:DbConnectAdmin` / admin user to a
non-admin DB role for the runtime API Lambda.

Context:
- cli/templates/backend.yaml:71 grants ApiFunction both
  `dsql:DbConnect` and `dsql:DbConnectAdmin`. The migration CLI
  legitimately needs DbConnectAdmin, but the API Lambda does not.
- pgrest-lambda src/rest/db/dsql.mjs:76 connects as `admin` via
  `getDbConnectAdminAuthToken()`.
- If the API Lambda is compromised, the attacker can DROP tables,
  ALTER schema, and CREATE backdoor functions — not just modify
  data.

Goal of the design:
- Runtime API Lambda uses `dsql:DbConnect` only and connects as a
  non-admin role (e.g. `boa_api`) with SELECT, INSERT, UPDATE,
  DELETE on the public schema — no DDL, no role management.
- Migration CLI keeps DbConnectAdmin (runs DDL).
- First-time deploy bootstraps the `boa_api` role idempotently.
- Upgrade path for existing clusters: a migration script that
  creates the role and grants permissions without breaking live
  traffic.

Deliverable: a design doc that:
- Shows the new CloudFormation diff (backend.yaml).
- Shows the dsql.mjs changes (`getDbConnectAuthToken()`, user
  `boa_api`).
- Specifies the bootstrap SQL.
- Describes the upgrade migration.
- Calls out risks: live traffic during migration, permission gaps,
  DSQL role-support quirks.
- Estimates effort and proposes a phased rollout.

Do NOT implement. This prompt produces a design document only — the
user will review it and decide whether to schedule implementation as
a follow-up.
```

---

## M-13 · `sanitize-upload-filename` · repo: boa

**Full rring loop.**

```
Sanitize user-supplied filenames before using them as S3 keys.

Context:
- cli/templates/lambda/presigned-upload.mjs:66 builds the key as
  `uploads/${userId}/${randomUUID()}-${filename}` where filename
  comes from the request body unvalidated.
- Special characters (slashes, unicode, long strings) can interact
  with the download access check (key.startsWith) and the S3 API.

Required changes:
1. Import `basename` from `node:path`.
2. Before building the key, sanitize the filename:
   a. `const safe = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);`
   b. Reject (400) if safe is empty after sanitization.
3. Use `safe` instead of `filename` in the key.
4. Add tests in cli/__tests__ or wherever presigned-upload tests
   live:
   - filename with path traversal → sanitized to flat basename.
   - filename with unicode / special chars → replaced with
     underscores.
   - empty filename after sanitize → 400.
   - normal filename → unchanged.

Acceptance:
- No raw user input flows into the S3 key beyond `[a-zA-Z0-9._-]`.
- Download access check (key.startsWith prefix) remains sound.
```

---

## M-14 · `router-ident-regex` · repo: pgrest-lambda

**Full rring loop.**

```
Add a regex identifier check in the REST router before the schema
cache lookup.

Context:
- src/rest/router.mjs:35 extracts tableName with a simple
  replace-then-replace, then looks it up in the schema cache via
  hasTable(). There's no format validation at the router layer.
- This is defense-in-depth: if the schema cache ever returns true
  for a malformed name, that name could flow into SQL.

Required changes:
1. In src/rest/router.mjs, add a module-level
   `const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;`
2. After extracting tableName, if `!IDENT.test(tableName)`, throw
   `PostgRESTError(404, 'PGRST205', "Relation '<name>' does not
   exist", null, 'Check the spelling of the table name.')`.
   (Same error shape as the existing not-found path — no new
   surface.)
3. Tests in src/rest/__tests__/router.test.mjs (or the closest
   existing file):
   - table name with a dash → 404 PGRST205
   - table name starting with a digit → 404 PGRST205
   - valid table name not in schema → 404 PGRST205 (existing
     behavior unchanged)
   - valid table name in schema → routes normally

Acceptance:
- Router rejects malformed identifiers before schema lookup.
- Existing test suite green.
```

---

## M-16 · `cognito-idtoken-trust-comment` · repo: pgrest-lambda

**Full rring loop.** (Small — docs-only code change.)

```
Document the trust boundary around parseIdToken in the Cognito
provider.

Context:
- src/auth/providers/cognito.mjs:24-45 decodes a Cognito ID token
  payload directly with base64url + JSON.parse, no jwt.verify call.
- Today this is only called on tokens just returned from Cognito's
  own SDK (InitiateAuthCommand result), which is trusted — the
  token came over TLS from an authenticated SDK call.
- Security review flagged this as a latent hazard: if a future
  refactor reuses parseIdToken on tokens from untrusted sources,
  tampered tokens would be silently accepted.

Required changes:
1. Add a block comment above parseIdToken explaining:
   - This function is only safe when invoked on tokens received
     directly from the Cognito SDK in the same request.
   - Never pass an attacker-controlled token to this function.
   - For user-submitted tokens, use src/auth/verify-token.mjs
     instead.
2. Optional follow-up note in the comment: this code path is
   part of the legacy Cognito provider; new code should use the
   better-auth provider.

No behavior change. Tests untouched.

Acceptance:
- Comment is present and clear.
- File otherwise unchanged.
```

---

## L-17 · `cognito-global-signout` · repo: pgrest-lambda

**Full rring loop.**

```
Cognito provider logout should call GlobalSignOutCommand to
invalidate the refresh token.

Context:
- src/auth/providers/cognito.mjs:155-157 is a no-op. Comment says
  "JWTs expire naturally."
- Access tokens last 1h; refresh tokens last 30 days. A stolen
  refresh token keeps working after logout.
- better-auth provider already handles this correctly via
  prov.signOut(claims.sub).

Required changes:
1. Import `GlobalSignOutCommand` from
   '@aws-sdk/client-cognito-identity-provider'.
2. Modify the `signOut` method on the Cognito provider to accept
   a provider access token and call GlobalSignOutCommand.
3. The caller path: src/auth/handler.mjs:305-328 currently passes
   claims.sub; for Cognito it needs to pass the provider access
   token. Adjust the call site so both providers receive what they
   need (the provider interface may need a signOut(accessToken) for
   Cognito vs signOut(sub) for better-auth — pick a clean
   resolution).
4. Tests in src/auth/__tests__ mocking CognitoIdentityProviderClient:
   - signOut calls GlobalSignOutCommand with the access token.
   - Failure to revoke still returns 204 (best-effort).
5. Doc note in docs/guides/auth/jwts.md (or equivalent): access
   token remains valid until its expiry in both paths; refresh
   token is revoked immediately.

Acceptance:
- Signing out a Cognito user invalidates the refresh token.
- better-auth flow unchanged and passing.
```

---

## L-19 · `body-size-limit` · repo: pgrest-lambda

**Full rring loop.**

```
Enforce a 1 MB request body size limit before JSON.parse.

Context:
- src/rest/handler.mjs:197 and multiple sites in src/auth/handler.mjs
  (150, 199, 224, 308, 332, 357) call JSON.parse(event.body) without
  checking the size first.
- API Gateway caps at 10 MB, which is much larger than anything this
  API legitimately serves.
- Large bodies can cause memory spikes and slow parse paths.

Required changes:
1. Add a shared constant: `export const MAX_BODY_BYTES = 1_048_576;`
   in src/shared/constants.mjs (create if absent) or similar shared
   location.
2. Add a helper `function checkBodySize(body)` that returns void on
   OK, throws `PostgRESTError(413, 'PGRST006', 'Request body exceeds
   maximum size of 1 MB')` on overflow. Uses Buffer.byteLength.
3. Call the helper before each JSON.parse(event.body) in:
   - src/rest/handler.mjs
   - src/auth/handler.mjs (every site)
4. Tests in src/rest/__tests__ and src/auth/__tests__:
   - body exactly at MAX_BODY_BYTES → parses normally.
   - body over the limit → 413 PGRST006, no parse attempted.
   - empty body → behaves as today.

Acceptance:
- Oversized bodies return 413 before parsing.
- Existing test suite green.
```

---

## L-20 · `generic-error-response` · repo: pgrest-lambda

**Full rring loop.**

```
Stop leaking err.message in the REST handler's catch-all.

Context:
- src/rest/handler.mjs:441-447: the non-PostgRESTError, non-PG-coded
  branch returns err.message as the response body. That message may
  contain SQL details, schema info, or internal error context.

Required changes:
1. In the catch-all branch of src/rest/handler.mjs:
   - Generate a short random errorId (8 hex chars from
     crypto.randomBytes).
   - console.error({ errorId, message: err.message, stack:
     err.stack }). Structured logging so CloudWatch captures it.
   - Return `PostgRESTError(500, 'PGRST000', 'Internal server error
     (errorId: ' + errorId + ')')` — generic message, errorId as
     correlation handle.
2. Do not change the PostgRESTError or PG-coded branches. Those are
   user-facing by design.
3. Tests in src/rest/__tests__:
   - Generic error path: response is generic, errorId is present in
     both log and response, err.message is not in the response.
   - PostgRESTError still passes through as before.

Acceptance:
- Response body in catch-all never contains err.message.
- errorId present in logs for support correlation.
```

---

## L-21 · `init-warning-service-key` · repo: boa

**Full rring loop.** (Small.)

```
Print a post-init warning about service role key handling.

Context:
- cli/commands/init.mjs generates and writes serviceRoleKey to
  .boa/config.json. .gitignore already excludes .boa/, but nothing
  tells the developer not to ship this key to a browser or commit it
  anywhere else.

Required changes:
1. At the end of cli/commands/init.mjs (after the config is written
   and the success message prints), add:
   ```
   console.log('');
   console.log('IMPORTANT');
   console.log('The service role key in .boa/config.json bypasses');
   console.log('authorization. Never embed it in browsers or mobile');
   console.log('apps. Store it in SSM or a secrets manager for');
   console.log('production use. Rotate regularly with `boa rotate-keys`.');
   ```
2. Add a snapshot/regex test in cli/__tests__ verifying the warning
   prints.

Acceptance:
- `boa init` output includes the warning on success.
- Warning does not appear when init fails midway.
```

Note: depends on H-5 landing first (mentions `boa rotate-keys`). The
driver runs H-5 before L-21.

---

## L-22 · `cognito-legacy-gate` · repo: boa

**Full rring loop.** (Docs + guard; current default path is unaffected.)

```
Mark the Cognito auth path as legacy and gate ALLOW_USER_PASSWORD_AUTH
behind an explicit opt-in.

Context:
- The default AUTH_PROVIDER is better-auth (commit ce94ded). Cognito
  is legacy-only.
- If a future user provisions a Cognito UserPoolClient through BOA,
  ALLOW_USER_PASSWORD_AUTH sends the password directly rather than
  using SRP.
- Current cli/templates/backend.yaml does not provision Cognito.
  This fix is documentation + forward guards for any future path.

Required changes:
1. docs/design/auth-layer.md: add a clear "Cognito (legacy)" heading
   at the top of that provider's section. State that new projects
   should use better-auth; Cognito is kept only for migration
   compatibility.
2. docs/ARCHITECTURE.md: mark the Cognito row in the auth table as
   "legacy; use better-auth for new projects."
3. If/when a Cognito extension is added in the future, require an
   explicit `--legacy-user-password-auth` flag. For now, add a
   comment banner to cli/extensions/<cognito-if-any>/fragment.yaml
   (create placeholder if none exists? No — do not create new files
   speculatively). If no Cognito extension exists, this step is
   skipped.
4. No code change in the runtime path today.

Acceptance:
- Both docs clearly mark Cognito as legacy.
- No behavior change on the default path.
```

---

## B-1 · `docs-tls-verify-consistency` · repo: boa

**Full rring loop.** (Tiny docs-only fix.)

```
Fix stale doc examples that show TLS verification disabled.

Context:
- plugin/docs/FUNCTIONS.md:111 and cli/skill/docs/FUNCTIONS.md:111
  both contain `ssl: { rejectUnauthorized: false }` in a code
  example.
- docs/ARCHITECTURE.md:253 and docs/guides/database/connecting.md:89
  correctly show `true`.
- CLAUDE.md rule 6 says IAM auth tokens are required; the stale
  examples contradict the architecture docs and could mislead
  agents.

Required changes:
1. plugin/docs/FUNCTIONS.md:111 — change `false` to `true`.
2. cli/skill/docs/FUNCTIONS.md:111 — same.
3. If any surrounding text describes TLS, ensure it matches.

Acceptance:
- grep -rn "rejectUnauthorized: false" in boa/ returns no results in
  user-facing docs (node_modules excluded).
```

---

## Execution order

The driver runs them in this order to minimize conflicts and respect
dependencies:

1. `B-1` · docs-tls-verify-consistency (boa)
2. `M-16` · cognito-idtoken-trust-comment (pgrest-lambda — docs only)
3. `M-14` · router-ident-regex (pgrest-lambda)
4. `M-7` · sql-builder-quote-ident (pgrest-lambda)
5. `H-6` · refresh-endpoint-auth (pgrest-lambda)
6. `L-19` · body-size-limit (pgrest-lambda)
7. `L-20` · generic-error-response (pgrest-lambda)
8. `L-17` · cognito-global-signout (pgrest-lambda)
9. `M-12` · db-non-admin-role — **design only** (boa + pgrest-lambda)
10. `H-5` · rotate-api-keys (boa)
11. `L-21` · init-warning-service-key (boa) — depends on H-5
12. `M-10` · service-role-warnings (boa + pgrest-lambda)
13. `M-13` · sanitize-upload-filename (boa)
14. `M-8` · s3-cors-allowlist (boa)
15. `M-9` · api-cors-allowlist (boa)
16. `L-22` · cognito-legacy-gate (boa)
17. `H-1` · alb-https-listener (boa) — largest template change, last

Each fix lives on its own branch `sec/<fix-id>-<slug>` off `main`. The
driver returns to a clean `main` between fixes so branches don't
stack. User reviews each branch and merges in the morning.
