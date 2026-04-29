# Runtime Lambda as non-admin DB role

## Overview

Security review finding M-12 flagged that the runtime API Lambda
connects to Aurora DSQL with `dsql:DbConnectAdmin` and the `admin`
user, giving it DDL privileges it never exercises. A compromised
Lambda can DROP tables, ALTER schema, and CREATE backdoor
functions, when its real job is SELECT / INSERT / UPDATE / DELETE.

This is a **design-only document**. Implementation is tracked as a
follow-up ticket. The scope touches both repos (`boa/` CloudFormation
and CLI; `pgrest-lambda/` DB connection code) plus the DSQL bootstrap
path, and needs a careful upgrade story for existing deployments.

Security review ID: M-12.

## Current state

`cli/templates/backend.yaml:66-72`:

```yaml
Policies:
  - Statement:
      - Effect: Allow
        Action:
          - dsql:DbConnect
          - dsql:DbConnectAdmin
        Resource: !Sub 'arn:aws:dsql:${AWS::Region}:${AWS::AccountId}:cluster/${DsqlCluster}'
```

`pgrest-lambda/src/rest/db/dsql.mjs:70-87`:

```javascript
const signer = new DsqlSigner({
  hostname: config.dsqlEndpoint,
  region: config.region,
});
const token = await signer.getDbConnectAdminAuthToken();

pool = new Pool({
  host: config.dsqlEndpoint,
  port: 5432,
  user: 'admin',           // <-- DDL-capable
  password: token,
  database: 'postgres',
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 60000,
});
```

The migration CLI (`cli/commands/migrate.mjs`) legitimately needs
admin — it runs user-supplied DDL. The runtime does not.

## Target state

- Runtime API Lambda IAM policy: `dsql:DbConnect` only.
- Runtime connects as a non-admin role (`boa_api`) that owns
  nothing but has DML rights on the public schema.
- Migration CLI keeps `dsql:DbConnectAdmin`, runs as `admin`.
- Bootstrapping the `boa_api` role is idempotent and part of the
  first-deploy flow.

### IAM changes (backend.yaml)

Split the Lambda's policies into two roles:

```yaml
Policies:
  - Statement:
      - Effect: Allow
        Action:
          - dsql:DbConnect           # only, no DbConnectAdmin
        Resource: !Sub 'arn:aws:dsql:${AWS::Region}:${AWS::AccountId}:cluster/${DsqlCluster}'
```

The migration CLI action happens from the developer's host using
the developer's AWS credentials, not from the Lambda role — so no
CloudFormation change is needed on the migration side.

### pgrest-lambda changes (dsql.mjs)

Swap the token call and connect user:

```javascript
const token = await signer.getDbConnectAuthToken();

pool = new Pool({
  host: config.dsqlEndpoint,
  port: 5432,
  user: 'boa_api',         // non-admin
  password: token,
  database: 'postgres',
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 60000,
});
```

The signer already supports `getDbConnectAuthToken()` (non-admin
variant of `getDbConnectAdminAuthToken`); no new SDK dependency.

### Bootstrap SQL

Executed once per cluster, idempotently, by `boa init` / `boa deploy`
(as admin, before the stack handler goes live):

```sql
-- Create the runtime role. DSQL supports CREATE ROLE (scoped).
CREATE ROLE boa_api WITH LOGIN;

-- Grant schema usage so it can resolve table names.
GRANT USAGE ON SCHEMA public TO boa_api;

-- Grant DML but NOT DDL. Table ownership stays with admin.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO boa_api;

-- Make future tables inherit the same grants (so migrations
-- that CREATE TABLE don't leave the runtime without access).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boa_api;

-- Map the AWS IAM principal to this Postgres role so the
-- getDbConnectAuthToken call authenticates as boa_api.
-- DSQL-specific syntax — verify against
-- docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_database-roles.html
AWS IAM GRANT boa_api TO '<lambda-execution-role-arn>';
```

All `CREATE`/`GRANT` statements use `IF NOT EXISTS` where
supported, or are wrapped in `DO $$ BEGIN ... EXCEPTION ... END $$`
blocks so repeated runs are no-ops.

### Upgrade path for existing deployments

Existing clusters currently run the Lambda as `admin`. We cannot
revoke admin without first:

1. Bootstrapping `boa_api` in the same migration pass.
2. Rolling the Lambda to use the new user.
3. Only then updating the IAM policy to drop `DbConnectAdmin`.

Two safe orderings:

- **Phased CloudFormation update.** Ship two stack updates. First
  update: add `boa_api` bootstrap (admin still active). Second
  update: flip the Lambda user and drop `DbConnectAdmin`.
- **Single-update with ordering guarantee.** Use a CloudFormation
  custom resource that runs the bootstrap SQL during stack update
  before the Lambda is reconfigured. Simpler for users, more
  moving parts for us. Preferred if we can own the custom
  resource cleanly.

Either path must tolerate partial failure: the bootstrap step
must be safe to re-run, and if the flip step fails the stack
should roll back to `admin` without leaving data unreadable.

## Risks

| Risk | Mitigation |
|---|---|
| DSQL's `CREATE ROLE` / `AWS IAM GRANT` syntax changes before launch | Gate the bootstrap behind a DSQL version probe; fall back to warning + admin mode if the syntax errors |
| Live traffic during bootstrap (in-flight admin-token connections) | Bootstrap must complete before stack update flips the Lambda user. Existing admin connections drain in < 10 minutes (token TTL) |
| Migrations that expect `admin` context | Migration CLI keeps `admin` — only the runtime changes. Confirmed by re-reading `cli/commands/migrate.mjs` |
| Users' own tables created outside a migration won't have the grants | `ALTER DEFAULT PRIVILEGES` covers future tables owned by `admin`. If a user creates a table as `boa_api` (which shouldn't happen, they don't have CREATE), it would fail — acceptable |
| Rollback complexity if a cluster gets stuck between phases | Document manual recovery: connect as admin, drop `boa_api`, re-deploy |

## Estimate

- Bootstrap SQL + idempotent wrapper in `cli/commands/deploy.mjs`: 1 day.
- `pgrest-lambda` connection swap + regression test that the pool
  user is `boa_api` when env indicates non-admin: 0.5 day.
- Backend.yaml IAM diff + stack update ordering: 1 day.
- Upgrade path for existing deployments (design choice: phased vs
  custom resource) + migration runbook: 1-2 days.
- End-to-end test against a real DSQL cluster: 0.5 day.
- Total: **4-5 engineer-days**.

## Rollout

Phase 1 (the follow-up ticket):
- Ship the bootstrap + new runtime user behind a feature flag in
  `.boa/config.json` (`useNonAdminRuntimeRole: true`).
- New deploys default to the flag on. Existing deploys stay on
  `admin` until the operator opts in.

Phase 2 (a release later):
- Flip the default to on for everyone.
- Add a `boa verify` check that the Lambda role does not have
  `DbConnectAdmin`.

Phase 3:
- Remove the flag. `boa` refuses to deploy without the non-admin
  role.

## Out of scope

- Row-level security: already handled by Cedar. Not affected by
  this change.
- Migration CLI hardening: separate ticket. `migrate.mjs` admin
  token usage is legitimate.
- Schema introspection queries run by pgrest-lambda: those only
  need `SELECT` on `pg_catalog` views, which `boa_api` gets via
  default role grants. Verify during implementation.

## Related findings

- M-7: sql-builder quoteIdent (landed). Independent defense layer.
- M-11: on_conflict column validation (already landed upstream).
- M-14: router identifier regex (landed). Also independent.

Together these form a multi-layer mitigation. M-12 is the
least-privilege layer at the DB level; M-7 / M-14 are SQL-layer
guards. None of them replaces the others.
