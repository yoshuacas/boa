# Scenario: Real-time Chat App

## Prompt

Build a chat application with rooms. Users can create rooms, join rooms, and send messages in real time. Messages should persist so you can see history when you rejoin a room. Deploy to AWS.

## Expected outcome

- DSQL tables: `rooms`, `room_members`, `messages`, `ws_connections` (better-auth stores users in its own schema)
- better-auth sign-up and sign-in working through `/auth/v1/*`
- REST API exposing `/rest/v1/*` for room and message management via pgrest-lambda
- WebSocket API Gateway with a Lambda handler for real-time messaging
- Cedar access policies limiting rooms to their members
- Frontend with room list, message history, live updates
- CloudFormation stack in `CREATE_COMPLETE` or `UPDATE_COMPLETE`
