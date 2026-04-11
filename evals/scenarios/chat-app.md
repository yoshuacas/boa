# Scenario: Real-time Chat App

## Prompt

Build a chat application with rooms. Users can create rooms, join rooms, and send messages in real time. Messages should persist so you can see history when you rejoin a room. Deploy to AWS.

## Expected outcome

- DSQL database with users, rooms, room_members, messages, ws_connections tables
- Cognito user pool with self-signup
- Lambda functions for REST API + WebSocket handlers
- REST API Gateway for room/user management
- WebSocket API Gateway for real-time messaging
- Frontend with room list, message history, live updates
- Stack deployed via SAM
