# realtime

Adds Supabase-compatible realtime channels backed by AWS AppSync Events.

Ship-in: `postgres_changes` and `broadcast`. Presence is deferred.

## What it provisions

- `AWS::AppSync::Api` (Events type) — WebSocket transport
- `AWS::AppSync::ChannelNamespace` (`default`) — accepts any channel path
- `AWS::AppSync::ApiKey` — subscriber-facing key, published in `.boa/config.json`
- Managed IAM policy — grants `ApiFunction` permission to publish

## What the app Lambda does

After a successful write through `pgrest.handler`, the wrapper in
`lambda/index.mjs` calls `realtime-publisher.mjs` to emit an event to the
`/db/public/{table}/{INSERT|UPDATE|DELETE}` channel.

## Client-side

A compatible realtime adapter for `@supabase/supabase-js` is copied into each
project at `.boa/client/realtime.mjs`. Import it and pass `realtime(...)` to
`createClient`.

## v1 limitations

- **Row-level Cedar filtering runs client-side.** Events for `postgres_changes`
  are not filtered by row on the publisher. A subscriber with a valid JWT will
  see row data that Cedar would deny on a direct read. Use `service_role`-
  restricted or fully public tables for realtime in v1.
- **Auth is API_KEY for subscribers in v1.** A Lambda authorizer that
  validates better-auth JWTs and evaluates Cedar `subscribe`/`broadcast`
  actions lands in M2.
- **No presence.** `supabase.channel(...).track(...)` is a no-op.
