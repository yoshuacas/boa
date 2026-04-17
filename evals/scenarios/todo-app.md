# Scenario: Todo App

## Prompt

Build a todo app where users can sign up, sign in, and manage their tasks. Each user should only see their own todos. Users should be able to create, complete, and delete tasks. Deploy it to my AWS account.

## Expected outcome

- DSQL database with `users` and `todos` tables
- Cognito user pool with self-signup enabled
- Lambda function handling CRUD operations
- REST API Gateway with Cognito authorizer
- Frontend that renders and allows interaction
- Stack deployed via SAM
