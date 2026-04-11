# Scenario: Multi-tenant SaaS

## Prompt

Build a project management SaaS where organizations can invite members, create projects, and track tasks. Each organization should only see its own data. Members can have different roles (owner, admin, member). Deploy to AWS.

## Expected outcome

- DSQL database with users, organizations, org_members, projects, tasks tables
- org_id on all tenant-scoped tables for isolation
- Cognito user pool with self-signup
- Lambda function with CRUD + org membership checks
- REST API Gateway with Cognito authorizer
- Multi-tenancy enforced at application layer (every query filters by org_id)
- Frontend with org switcher, project board, task management
- Stack deployed via SAM
