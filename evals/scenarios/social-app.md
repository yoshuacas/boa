# Scenario: Social App

## Prompt

Build a social app where users can create posts, follow other users, like posts, and leave comments. Users should be able to upload images with their posts. Show a feed of posts from people I follow. Deploy it to AWS.

## Expected outcome

- DSQL tables: `posts`, `comments`, `likes`, `follows` (better-auth stores users in its own schema)
- better-auth sign-up and sign-in working through `/auth/v1/*`
- REST API exposing `/rest/v1/*` via pgrest-lambda; feed assembled with resource embedding (`follows(posts(...))`)
- Cedar access policies so each user manages their own posts, likes, and follows
- S3 bucket for image uploads via the built-in presigned URL endpoints
- Frontend showing feed, post creation, profile pages
- CloudFormation stack in `CREATE_COMPLETE` or `UPDATE_COMPLETE`
