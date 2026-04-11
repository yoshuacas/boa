# Scenario: Social App

## Prompt

Build a social app where users can create posts, follow other users, like posts, and leave comments. Users should be able to upload images with their posts. Show a feed of posts from people I follow. Deploy it to AWS.

## Expected outcome

- DSQL database with users, posts, comments, likes, follows tables
- Cognito user pool with self-signup
- Lambda function with CRUD + feed query
- S3 bucket for image uploads via presigned URLs
- REST API Gateway with Cognito authorizer
- Frontend showing feed, post creation, profile pages
- Stack deployed via SAM
