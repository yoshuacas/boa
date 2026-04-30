# Scenario: Multi-tenant SaaS

## Prompt

Build a project management SaaS where organizations can invite members, create projects, and track tasks. Each organization should only see its own data. Members can have different roles (owner, admin, member). Deploy to AWS.

## Expected outcome

- DSQL tables: `organizations`, `org_members`, `projects`, `tasks` (better-auth stores users in its own schema)
- `org_id` on every tenant-scoped table for isolation
- better-auth sign-up and sign-in working through `/auth/v1/*`
- REST API exposing `/rest/v1/*` via pgrest-lambda
- Cedar access policies enforce tenant isolation by comparing `org_members.user_id` against the authenticated principal
- Role column on `org_members` with values `owner`, `admin`, `member`, used in policy conditions
- Frontend with org switcher, project board, task management
- CloudFormation stack in `CREATE_COMPLETE` or `UPDATE_COMPLETE`
