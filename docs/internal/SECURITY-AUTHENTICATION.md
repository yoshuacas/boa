# BOA Authentication — Security Overview

**Audience:** Security Assessment Engineer (Rashmi)
**Scope:** How identity, tokens, secrets, and API access work in a BOA backend
**Stack version:** pgrest-lambda integration (post-2026-04-12), pre-launch (target 2026-04-28)

This document explains how a customer's frontend becomes an authenticated caller against a BOA backend, where every secret lives in the deployed AWS account, and what controls mediate each hop. It is organized so you can read it top-down or jump to a specific concern.

---

## 1. What "BOA auth" actually is

BOA does not invent an identity provider. It wraps Amazon Cognito behind a GoTrue-compatible API so that `@supabase/supabase-js` works unmodified. Three things compose the auth surface:

| Component | Role | Where it runs |
|-----------|------|----------------|
| **Amazon Cognito User Pool** | Stores users, validates passwords, issues Cognito tokens | Customer AWS account |
| **pgrest-lambda auth handler** | Translates GoTrue endpoints (`/auth/v1/*`) into Cognito calls and mints BOA-signed JWTs | Lambda, Node.js 20.x |
| **pgrest-lambda authorizer** | Validates BOA JWTs on every data request and returns `role`/`userId`/`email` | Lambda (same function) |

pgrest-lambda is an npm package (`github.com/yoshuacas/pgrest-lambda`). BOA's Lambda code is a thin wrapper (`plugin/lambda-templates/index.mjs`) that delegates to it. The wrapper is ~67 lines total.

---

## 2. Architecture: request life cycle

```
Browser / Mobile / Server
   │
   │  @supabase/supabase-js
   │    apikey: <anonKey or serviceRoleKey>           (always)
   │    Authorization: Bearer <access_token>          (once signed in)
   ▼
┌─────────────────────────────────────────────────┐
│ ALB (HTTP:80) + WAF (rate limit 1000/5min/IP,   │
│ AWS Managed IP reputation) + Shield Standard    │
└──────────────────┬──────────────────────────────┘
                   │ IAM-invoked Lambda target
                   ▼
┌─────────────────────────────────────────────────┐
│ Lambda (Node 20.x, 256MB, reserved concurrency 50)│
│  ┌────────────────────────────────────────────┐ │
│  │ index.mjs — normalizeEvent + route         │ │
│  │  /upload, /download ─▶ presigned-upload    │ │
│  │  /auth/v1/*, /rest/v1/* ─▶ pgrest-lambda   │ │
│  └────────────────────────────────────────────┘ │
│  ┌──────────────┐   ┌────────────────────────┐  │
│  │ GoTrue API   │   │ PostgREST + Cedar       │ │
│  │ (Cognito SDK)│   │ (authz + SQL WHERE)     │ │
│  └──────┬───────┘   └──────────┬─────────────┘  │
└─────────┼───────────────────────┼────────────────┘
          │                       │
          ▼                       ▼
   Cognito User Pool          Aurora DSQL
   (password store,           (IAM-token auth,
   email attribute)           no stored creds)
```

Two independent paths:

- **Auth path** — `POST /auth/v1/signup|token|logout`, `GET /auth/v1/user`. No authorizer; the handler itself calls Cognito and issues BOA tokens.
- **Data path** — `GET|POST|PATCH|DELETE /rest/v1/<table>`. Authorizer runs first, validates the JWT, and attaches `role`/`userId`/`email` to the event. Cedar then decides permit/deny and rewrites the SQL.

The default deployment uses ALB. An `api-gateway` extension swaps ALB + WAF for API Gateway + a REQUEST-type Lambda authorizer; in that mode the authorizer is separate Lambda invocation.

---

## 3. Identity: how a user is created and authenticated

### 3.1 Sign-up

1. Frontend calls `supabase.auth.signUp({email, password})`, which POSTs to `/auth/v1/signup`.
2. pgrest-lambda's Cognito provider calls `SignUpCommand` against the configured User Pool.
3. The **pre-signup Lambda trigger** (`plugin/lambda-templates/auth-presignup.mjs`) auto-confirms the user and marks the email verified:
   ```js
   event.response.autoConfirmUser = true;
   event.response.autoVerifyEmail = true;
   ```
4. pgrest-lambda immediately calls `InitiateAuth` (USER_PASSWORD_AUTH) to obtain Cognito tokens, then mints a BOA access/refresh token pair and returns the GoTrue-shaped response.

**Security-relevant defaults** (`AllowAdminCreateUserOnly: false`, `AutoVerifiedAttributes: [email]`, password policy min-8/upper/lower/number). These live in the SAM template and in `plugin/docs/AUTH-PATTERNS.md`.

### 3.2 Sign-in

1. Frontend calls `signInWithPassword`, which POSTs to `/auth/v1/token?grant_type=password`.
2. Cognito provider calls `InitiateAuth` (USER_PASSWORD_AUTH) — the password is sent to Cognito over TLS; **BOA never stores or logs the password.**
3. On success, pgrest-lambda signs a BOA access token (1h) and refresh token (30d) and returns them. The Cognito refresh token is embedded inside the BOA refresh token's `prt` claim so BOA can refresh upstream later.

### 3.3 Refresh

1. Frontend POSTs to `/auth/v1/token?grant_type=refresh_token` with the BOA refresh token.
2. pgrest-lambda verifies the BOA refresh JWT signature, extracts the `prt` (Cognito refresh token), calls Cognito with `REFRESH_TOKEN_AUTH`, and mints a new BOA access/refresh pair.

### 3.4 Logout

Logout is client-side only for MVP. The BOA access token naturally expires within 1 hour. There is **no server-side revocation list**. This is documented and is one of the explicit review items (see §9).

---

## 4. Tokens — how they are generated and validated

BOA issues its **own** JWTs rather than passing Cognito tokens through. Reason: `@supabase/supabase-js` expects a `role` claim and an `aud` claim shaped the GoTrue way, which Cognito does not emit.

### 4.1 Token catalog

| Token | Signed by | Algorithm | Claims | TTL | Storage |
|-------|-----------|-----------|--------|-----|---------|
| **Access token** | BOA | HS256 (shared secret) | `sub`, `email`, `role:"authenticated"`, `aud:"authenticated"`, `iss:"boa"`, `exp` | 1 hour | Supabase client (memory + localStorage by default) |
| **Refresh token** | BOA | HS256 | `sub`, `prt` (Cognito refresh token), `iss:"boa"`, `exp` | 30 days | Same as above |
| **Anon key** | BOA | HS256 | `role:"anon"`, `iss:"boa"`, `exp` | ~10 years | `.boa/config.json`; shipped to clients |
| **Service role key** | BOA | HS256 | `role:"service_role"`, `iss:"boa"`, `exp` | ~10 years | `.boa/config.json`; **server-only** |
| **Cognito tokens** | Cognito | RS256 (JWKS) | Cognito-standard | 1h / 30d | Never leave Lambda — used only to refresh |
| **DSQL IAM auth token** | IAM signer in Lambda | SigV4 | n/a (opaque password) | 15 minutes | In-memory; re-generated before expiry |

### 4.2 Signing

- **Algorithm:** HS256 with a 32-byte shared secret (`JWT_SECRET`). Chosen for simplicity and portability across provider swaps; see §9 for the trade-off vs. RS256.
- **Secret provisioning:** `bootstrap.sh` (aka `boa init`) runs `openssl rand -base64 32` and stores the result in SSM Parameter Store under `/${stackName}/jwt-secret` as a `SecureString` (KMS-encrypted with the default AWS-managed key).
- **Lambda access to the secret:** The SAM template resolves it at deploy time via `{{resolve:ssm:/${ProjectName}/jwt-secret}}` and passes it to the Lambda as the `JWT_SECRET` env var. The Lambda's IAM role additionally has `ssm:GetParameter` scoped to that specific parameter.
- **Long-lived key generation:** `plugin/scripts/generate-keys.mjs` runs locally during `boa init`, reads the same secret, signs the anon and service-role JWTs, and writes them to `.boa/config.json`. These keys can be regenerated by rotating the secret + re-running the script.

### 4.3 Validation path (data requests)

For `/rest/v1/*`:

1. **API Gateway path:** REQUEST-type Lambda authorizer (`authorizer.mjs` → `pgrest.authorizer`) runs first.
   - Verifies `apikey` header JWT (must be anon or service_role, valid signature, unexpired).
   - Verifies `Authorization: Bearer <jwt>` (if present): signature + `exp`.
   - Returns an IAM Allow policy and an authorizer context of `{role, userId, email}`.
   - Result is cached for 300s by the Authorization header value.
2. **ALB path (current default):** There is no API-Gateway-style authorizer; the Lambda itself runs `pgrest.handler`, which performs the same validation inline. The `normalizeEvent` wrapper in `index.mjs` **base64-decodes the JWT payload without verifying the signature** only to pre-fill the `authorizer` object for downstream consumers — the actual signature check happens inside pgrest-lambda before the request is honored. This is worth confirming end-to-end as part of your review (see §9).

### 4.4 Validation path (auth requests)

`/auth/v1/*` is unauthenticated. The handler itself verifies BOA refresh JWTs where applicable and relies on Cognito for password validation.

---

## 5. Where every secret lives

| Secret | Where it lives | At-rest protection | Access control |
|--------|----------------|---------------------|-----------------|
| `JWT_SECRET` (HS256 signing key) | SSM Parameter Store, `SecureString` | KMS (AWS-managed key) | Lambda execution role's `ssm:GetParameter` scoped to the one parameter |
| User passwords | Cognito User Pool | Cognito-managed (bcrypt, not exposed) | Not accessible even to the account owner |
| Cognito refresh tokens | Embedded in BOA refresh token `prt` claim; never persisted server-side | HS256-signed envelope, client-held | Only valid alongside a BOA refresh token |
| DSQL credentials | **None stored.** The Lambda signs short-lived IAM auth tokens via `DsqlSigner` | n/a | Lambda role has `dsql:DbConnect`, `dsql:DbConnectAdmin` |
| S3 access | Presigned URLs only. Bucket Block Public Access on all four settings | SSE-S3 default | Lambda role limited to the one storage bucket |
| `anonKey`, `serviceRoleKey` | `.boa/config.json` on the developer's machine | File-system permissions | Developer's responsibility; service-role must not ship to frontends |
| Google/Apple client secrets (if social login is added) | SSM Parameter Store (pattern, not automated) | KMS | Lambda role extended per extension |

Two things worth highlighting:

- **Nothing in the BOA codebase stores passwords.** Cognito is the password boundary.
- **Nothing in the BOA codebase stores database passwords.** DSQL uses SigV4-signed 15-minute IAM auth tokens, regenerated in-process.

---

## 6. How a client application calls the API securely

### 6.1 The Supabase-client path (recommended)

```javascript
import { createClient } from '@supabase/supabase-js'
import config from './.boa/config.json'

const supabase = createClient(config.apiUrl, config.anonKey)

await supabase.auth.signUp({ email, password })
const { data } = await supabase.from('todos').select('*')
```

What the client does behind the scenes on every request:

```
apikey: <anonKey>                            ← identifies the project + role floor
Authorization: Bearer <access_token>         ← identifies the user (once signed in)
Content-Type: application/json
```

The Supabase client:
- stores the session,
- attaches both headers automatically,
- refreshes the access token ~1 minute before `exp` using the refresh token,
- emits `onAuthStateChange` events (`SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`).

### 6.2 Custom HTTP client (same contract)

```http
POST https://<alb>/rest/v1/todos HTTP/1.1
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<anon>
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<access>
Content-Type: application/json

{"title": "buy milk"}
```

Missing `apikey` → 401 from the authorizer. Missing `Authorization` → request is processed as `role: anon`; Cedar policies decide whether that is allowed.

### 6.3 Server-side (admin) access

```javascript
const admin = createClient(config.apiUrl, config.serviceRoleKey)
// bypasses all Cedar policies — must never run in a browser
```

The `service_role` key is a long-lived JWT; the authorizer recognizes it and sets `role: "service_role"`, which tells pgrest-lambda to skip policy evaluation. Guardrails around this:

- `.boa/config.json` is not committed (the project `.gitignore` excludes it).
- Docs repeat the "never expose service role" warning in three places.
- There is **no technical enforcement** preventing a developer from shipping it to the frontend. This is a documented risk; see §9.

### 6.4 Transport

- **ALB is HTTP on port 80 by default.** TLS is not terminated by BOA because it requires a customer-supplied domain + ACM certificate. The ALB is public. Customers using the default template should add HTTPS before serving real traffic; our launch docs will say so explicitly.
- Cognito, DSQL, and S3 connections are always TLS from inside the Lambda.

---

## 7. Authorization (Cedar) — brief, because it matters to authN posture

After authentication, every data request is evaluated by Cedar policies loaded from S3 (or bundled defaults). Principal is `PgrestLambda::User` with `role` from the JWT; resources are tables/rows. Defaults:

- `service_role` → bypass.
- `anon` → deny-all unless a policy says otherwise.
- `authenticated` → can read/update/delete rows where `user_id == principal`, can insert.
- No matching policy → 403.

Relevant for your review: the **JWT's `role` claim is the sole input to this decision**. A forged JWT with `role: "service_role"` would bypass Cedar — which is why the signing-key boundary in §5 is load-bearing.

---

## 8. Defense in depth (summary table)

| Layer | Control |
|-------|---------|
| Network | WAF rate limit (1000/5min/IP), AWS Managed IP reputation list, AWS Shield Standard |
| Transport | TLS from Lambda to Cognito/DSQL/S3 always; ALB HTTP → customer adds HTTPS |
| Authentication | Cognito password store, pre-signup auto-confirm, HS256 BOA JWTs with `exp` |
| Key management | SSM SecureString, scoped IAM, SigV4 IAM auth for DSQL (15-min tokens) |
| Authorization | Cedar policy-as-code, deny-by-default, `service_role` gate keyed on JWT `role` |
| Storage | S3 BPA on; presigned URLs only; user-scoped S3 prefixes (`uploads/<userId>/…`) |
| Blast radius | Lambda reserved concurrency 50; `DeletionPolicy: Retain` on DSQL / Cognito / S3; `DeletionProtection: ACTIVE` on DSQL and Cognito |

---

## 9. Known open items for security review

These are the items we want your fresh read on. They are not blockers for the assessment — they are deliberate trade-offs we want challenged before 2026-04-28:

1. **HS256 vs. RS256 for BOA JWTs.** Current choice is HS256 because the same Lambda signs and validates. Review: should we move to asymmetric so leaked signing material from a Lambda rotation would not retroactively compromise old tokens? Keys would live in KMS.
2. **No server-side token revocation.** Logout only clears client storage; leaked access tokens remain valid for up to 1 hour and refresh tokens for up to 30 days. Options: denylist in DSQL or a `kid`/`jti` rotation scheme. We have not implemented either.
3. **ALB is plain HTTP by default.** Default template does not terminate TLS; launch doc tells customers to add it. Consider: do we want `boa init` to refuse to complete without HTTPS in production mode?
4. **`normalizeEvent` in `index.mjs`** decodes the JWT without verifying the signature to pre-fill the authorizer object on the ALB event shape. The actual verification happens later in pgrest-lambda. We want you to trace this end-to-end and confirm no code path trusts the pre-filled values for authorization decisions.
5. **Service-role key exposure.** Long-lived JWT in `.boa/config.json`. No enforcement against shipping it to frontend builds. Is a lint rule / CLI check sufficient, or do we need to fetch it from SSM at runtime instead of writing it to disk?
6. **Anon key entropy.** Currently signed with the same `JWT_SECRET`. Knowing the anon key does not let an attacker forge user tokens (the `role: authenticated` claim plus `sub` would still be checked against policies), but the secret is the same. Consider splitting the signing key for anon/service-role keys from user-token signing.
7. **Cognito `update-user-pool` footgun.** The API replaces fields not merged; calling it without `--lambda-config` wipes the pre-signup auto-confirm trigger and can leave new sign-ups stuck `UNCONFIRMED`. BOA only ever mutates the pool through SAM/CloudFormation. Worth confirming we have no operational tooling that calls the CLI form.
8. **Palisade override risk (corp deployments).** Amazon-internal Palisade can flip `AllowAdminCreateUserOnly` back to `true` after our deploy. BOA re-flips it on `boa deploy`, but there is a window. Out of scope for external customers; noting for completeness.

---

## 10. Reference files

- `plugin/lambda-templates/index.mjs` — request router and `normalizeEvent`
- `plugin/lambda-templates/authorizer.mjs` — authorizer entry point
- `plugin/lambda-templates/auth-presignup.mjs` — Cognito pre-signup trigger
- `plugin/lambda-templates/presigned-upload.mjs` — S3 presigned URL handler
- `plans/auth-layer.md` — original auth design (provider-swappable interface)
- `plans/authorization-cedar.md` — Cedar design
- `plugin/docs/AUTH-PATTERNS.md` — Cognito patterns and pitfalls
- `docs/ARCHITECTURE.md` — full system architecture
- `docs/guides/auth/overview.md`, `docs/guides/auth/jwts.md` — customer-facing auth docs
- `github.com/yoshuacas/pgrest-lambda` — upstream REST + GoTrue + Cedar engine

If any of the above is ambiguous or you want to pair-trace a specific code path, ping me — David.
