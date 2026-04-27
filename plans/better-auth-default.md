# Plan: better-auth Default Provider

## Problem

`pgrest-lambda` is now published to npm as `pgrest-lambda`
and its current package depends on `better-auth`. BOA still
provisions Cognito as the default auth provider:

- The SAM template creates a Cognito user pool, user pool
  client, and pre-signup Lambda.
- `AUTH_PROVIDER` is set to `cognito`.
- `boa init`, `boa deploy`, `boa verify`, and `boa teardown`
  all read or mutate Cognito resources.
- The bundled skill and docs teach agents Cognito-specific
  pitfalls, Vite polyfills, and user-pool repair steps.
- The Lambda dependency is currently installed from GitHub
  instead of the npm package.

This makes new BOA backends depend on an auth service that
is no longer the intended default and keeps launch docs tied
to Cognito operational risks that better-auth should remove.

## Goals

1. Make `better-auth` the default provider for new BOA
   backends.
2. Install `pgrest-lambda` from npm at a pinned version,
   not from an unpinned GitHub dependency.
3. Keep deployments reproducible: every BOA CLI release
   should use a known `pgrest-lambda` package version.
4. Preserve the GoTrue-compatible endpoints that
   `@supabase/supabase-js` and `@boa-cloud/client` expect.
5. Provide an intentional migration path for existing
   Cognito-backed BOA projects.

## Non-Goals

- Do not implement OAuth providers in this migration unless
  `pgrest-lambda` already exposes them through better-auth.
- Do not silently migrate existing Cognito users. User
  migration needs an explicit export/import or dual-provider
  design.
- Do not remove Cognito compatibility from `pgrest-lambda`
  if existing BOA projects still need it.

## Proposed CX

### New Projects

`boa init` creates a backend with database-backed auth:

```text
Creating auth tables...
  [OK] better-auth schema ready
```

Generated `.boa/config.json` should include:

```json
{
  "authProvider": "better-auth",
  "pgrestLambdaVersion": "0.1.0"
}
```

It should not include `userPoolId` or `userPoolClientId` for
new better-auth projects.

### Existing Cognito Projects

Existing config with `userPoolId` remains supported:

```text
This backend uses Cognito auth.
New BOA projects use better-auth, but this project will keep
using Cognito until you run an explicit migration.
```

Add a future explicit command:

```bash
boa auth migrate better
```

That command should require a design for user export, password
reset, session invalidation, and rollback. It should not be
part of the default deploy path.

## Technical Design

### pgrest-lambda Version Pinning

Use an exact npm dependency in the Lambda template:

```json
"pgrest-lambda": "0.1.0"
```

`cli/lib/lambda-deps.mjs` must reject non-exact specs
(`latest`, `^0.1.0`, GitHub URLs) so BOA cannot ship an
unreproducible engine dependency by accident.

Future releases should update this one version intentionally,
then regenerate the Lambda package lockfile and run e2e auth
tests.

### SAM Template

Remove default Cognito resources from
`cli/templates/backend.yaml`:

- `UserPool`
- `UserPoolClient`
- `PreSignUpFunction`
- `PreSignUpPermission`
- Cognito IAM policy statements
- `USER_POOL_ID`
- `USER_POOL_CLIENT_ID`
- Cognito outputs

Set the default auth provider:

```yaml
AUTH_PROVIDER: better-auth
```

Add the environment variables required by `pgrest-lambda` for
better-auth:

- `JWT_SECRET`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `API_BASE_URL`
- `DSQL_ENDPOINT`
- `REGION_NAME`

The `pgrest-lambda@0.1.0` migration file uses PostgreSQL
foreign keys. Aurora DSQL does not support `REFERENCES`, so
BOA bootstraps a DSQL-compatible copy of the better-auth
schema during `boa init` and `boa deploy`.

### CLI Changes

`boa init`:

- Stop extracting Cognito outputs.
- Stop calling `aws cognito-idp update-user-pool`.
- Write `authProvider: "better-auth"` and
  `pgrestLambdaVersion` to `.boa/config.json`.
- Generate `CLAUDE.md` without Cognito IDs or Vite polyfill
  guidance.
- Run an auth schema bootstrap step before the first verify
  or smoke test.

`boa deploy`:

- Preserve existing `authProvider`.
- For new better-auth projects, do not touch Cognito.
- For legacy Cognito projects, keep current Cognito handling
  until the migration command exists.
- Refresh `pgrestLambdaVersion` in config after successful
  deploy.

`boa verify`:

- Replace the Cognito self-signup check with an auth smoke
  test.
- Exercise `/auth/v1/signup`, `/auth/v1/token`, and
  `/auth/v1/user` against a throwaway test account when a
  safe test email strategy is available.
- At minimum, verify the auth endpoints do not fail with
  missing-table errors.

`boa teardown`:

- For `authProvider: "better-auth"`, delete DSQL and S3 retained
  resources only.
- For legacy Cognito configs, keep deleting the user pool.
- Do not assume `userPoolId` exists.

### Docs and Skill

Update both `plugin/skills/boa/SKILL.md` and the bundled
`cli/skill/SKILL.md`:

- Architecture: DSQL + Lambda + S3; auth handled by
  `pgrest-lambda` with better-auth.
- Critical rules: remove Cognito self-signup, pre-signup
  trigger, and Vite Cognito polyfill rules.
- Pitfalls: remove Cognito repair guidance from the default
  path; move it to a legacy Cognito section if needed.
- Evals: replace Cognito-specific auth scenarios with
  better-auth signup/session scenarios.

Update website/docs pricing:

- Remove Cognito from default cost calculations.
- Keep a legacy or optional provider note only if BOA still
  offers a Cognito extension.

## Testing Strategy

Unit tests:

- Lambda dependency guard accepts exact npm versions and
  rejects GitHub URLs, ranges, and `latest`.
- SAM template no longer contains Cognito resources for the
  default backend.
- `init`/`deploy` config tests assert `authProvider:
  "better-auth"` and no Cognito IDs for new projects.
- `teardown` handles configs without `userPoolId`.

Integration/e2e tests:

- Fresh `boa init` deploys with `AUTH_PROVIDER=better-auth`.
- `supabase.auth.signUp()` succeeds.
- Password sign-in returns a session.
- Refresh token flow works.
- Authenticated REST request sees `principal` values needed
  by Cedar ownership policies.
- `boa verify` catches a missing better-auth schema.
- `boa teardown` removes retained resources and leaves no
  orphan Cognito resource because none was created.

Legacy tests:

- Existing Cognito config still deploys or fails with a clear
  upgrade message.
- `boa teardown` still cleans up Cognito for legacy projects.

## Implementation Order

1. Pin `pgrest-lambda` to the exact npm version in the Lambda
   template and update the dependency guard.
2. Confirm the better-auth provider contract in
   `pgrest-lambda`: required env vars, bootstrap schema, JWT
   claims, and route compatibility.
3. Update the SAM template to remove Cognito from the default
   path and set `AUTH_PROVIDER=better-auth`.
4. Update `init`, `deploy`, `verify`, and `teardown` for
   provider-aware config.
5. Update skill, plugin docs, architecture docs, website
   pricing, and eval scenarios.
6. Run local unit tests.
7. Run a live e2e deploy/sign-up/sign-in/teardown test in
   `us-east-1` and `us-east-2`.

## Open Questions

1. Should BOA keep its DSQL-compatible copy of the better-auth
   schema, or should `pgrest-lambda` ship a DSQL-compatible
   migration upstream?
2. Are better-auth users stored in public tables, an `auth`
   schema, or provider-owned tables hidden from PostgREST?
3. How should existing Cognito users migrate, and is that
   pre-launch or post-launch?
