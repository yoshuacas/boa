# Scenario: Todo App

## Prompt

Build a todo app where users can sign up, sign in, and manage their tasks. Each user should only see their own todos. Users should be able to create, complete, and delete tasks. Deploy it to my AWS account.

## Expected outcome

- DSQL database with a `todos` table (better-auth stores users in its own schema)
- better-auth sign-up and sign-in working through `/auth/v1/*`
- REST API exposing `/rest/v1/todos` via pgrest-lambda
- Cedar access policy limiting each row to its owner
- Frontend that renders and allows interaction
- CloudFormation stack in `CREATE_COMPLETE` or `UPDATE_COMPLETE`
