# Auth Patterns

BOA uses `pgrest-lambda` for GoTrue-compatible auth. New backends use
`AUTH_PROVIDER=better-auth`, with users, sessions, accounts,
verification records, and JWKS stored in the private `better_auth`
schema in Aurora DSQL.

The auth API is compatible with `@supabase/supabase-js`:

```text
POST /auth/v1/signup                         sign up
POST /auth/v1/token?grant_type=password      sign in
POST /auth/v1/token?grant_type=refresh_token refresh
GET  /auth/v1/user                           current user
POST /auth/v1/logout                         sign out
```

## Frontend

Use the same API URL and anon key from `.boa/config.json`.

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(config.apiUrl, config.anonKey);

await supabase.auth.signUp({ email, password });
await supabase.auth.signInWithPassword({ email, password });

const { data: { user } } = await supabase.auth.getUser();
await supabase.auth.signOut();
```

## Backend Configuration

The BOA CloudFormation template sets these Lambda env vars:

```yaml
AUTH_PROVIDER: better-auth
JWT_SECRET: '{{resolve:ssm:/<project>/jwt-secret}}'
BETTER_AUTH_SECRET: '{{resolve:ssm:/<project>/better-auth-secret}}'
DSQL_ENDPOINT: <cluster endpoint>
REGION_NAME: <region>
```

`boa init` creates the secrets in SSM Parameter Store and bootstraps the
`better_auth` schema. Do not put auth secrets in code, `.env`, or
frontend config. The Lambda derives its public base URL from the
incoming request's `Host` and `X-Forwarded-Proto` headers on the first
invocation, so no URL env var is required.

## DSQL Schema

Aurora DSQL does not support PostgreSQL foreign keys. BOA therefore
applies a DSQL-compatible better-auth schema without `REFERENCES`
constraints. Do not edit the `better_auth` schema by hand. User-facing
application tables belong in the public schema through normal BOA
migrations.

## Access Policies

Access policies see authenticated users as
`PgrestLambda::User::<user-id>`. Standard ownership policies use a
`user_id` column on app tables:

```cedar
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };
```

## Common Mistakes

### Editing better_auth Tables

Do not create app relationships to tables in the `better_auth` schema.
Use the authenticated user's ID from the session and store it as
`user_id` in public app tables.

### Missing Auth Schema

If sign-up fails with a missing table error, run:

```bash
boa deploy
boa verify
```

`boa deploy` re-applies the idempotent better-auth schema bootstrap.

### Wrong Authorizer Context Path

BOA passes flat authorizer context keys. Always read:

```javascript
event.requestContext.authorizer.role     // 'anon' | 'authenticated' | 'service_role'
event.requestContext.authorizer.userId   // user UUID or '' for anon
event.requestContext.authorizer.email    // user email or ''
```
