# Realtime for BOA

**Goal.** Ship Supabase-compatible realtime so `supabase.channel(...).on(...).subscribe()` works against a BOA backend unchanged.

**Scope (v1).** Two channel types only:

- `postgres_changes` — INSERT/UPDATE/DELETE events for a table, filtered by Cedar.
- `broadcast` — ephemeral client-to-client messages in a named room.

**Out of scope (v1).**

- `presence` — defer to v2 (state sync, heartbeats, leave/join).
- WAL/logical replication — DSQL doesn't expose it.
- Retroactive event replay / durable subscriptions.
- OAuth or external IdPs for the WebSocket leg.

**Non-goals.**

- Drop-in companion npm package (`events-lambda`). That package doesn't exist; building + publishing it is extra surface area. v1 ships inline in BOA: publisher as a Lambda layer / module in `cli/templates/lambda/`, adapter as a file in `cli/templates/client/` (or wherever the client helper lives).

---

## Design

### Transport: AWS AppSync Events

Chosen for the same reason as the existing architecture sketch (`docs/guides/architecture.md:685`): AppSync Events manages connections, subscriptions, and fan-out to 1M outbound msg/s. A custom API Gateway WebSocket route would require a DynamoDB connection table, a janitor Lambda for stale connections, and hand-rolled fan-out — all avoided here.

**Trade-off vs. API Gateway WebSockets:** AppSync Events is newer (GA 2024-10) and less familiar; it costs per message and per subscription-minute, which differs from API Gateway's per-message billing. For the expected BOA use case (lots of idle subscribers, bursty writes) the AppSync model is cheaper and simpler.

### Publishing: application-layer, not WAL

After a successful write in `pgrest-lambda`, the BOA Lambda publishes a change event to AppSync Events. One write → one publish, regardless of subscriber count. AppSync handles fan-out.

Why not WAL:

- DSQL has no logical replication, no triggers, no `LISTEN`/`NOTIFY`.
- Even on vanilla Postgres, WAL realtime scales badly — 1 insert × 100 subscribers = 100 policy evaluations.

### Channel conventions

| Channel type       | AppSync channel path                | Publish auth          | Subscribe auth |
|--------------------|-------------------------------------|-----------------------|----------------|
| `postgres_changes` | `/db/public/{table}/{event}`        | IAM (Lambda only)     | JWT (see below) |
| `broadcast`        | `/broadcast/{room}/{event}`         | JWT                   | JWT             |

Event values: `INSERT`, `UPDATE`, `DELETE`, or `*` (wildcard subscription).

### Auth rework (deviates from `architecture.md:679-691`)

The existing design sketch calls for a Cognito identity pool for WebSocket auth. **That's stale** — CLAUDE.md critical rule 1 says new projects use `better-auth`; Cognito is legacy-only. Options:

1. **Custom JWT authorizer on AppSync** (recommended). AppSync Events supports Lambda authorizers. The authorizer re-uses the same `BETTER_AUTH_SECRET`-signed JWTs that pgrest-lambda already validates. No identity pool, no Cognito dependency, same tokens the REST API already issues.
2. API-key-only auth (anon role only) — insecure for anything user-scoped; rejected.

**Authorization on subscribe.** The Lambda authorizer:
- Resolves the channel path to `(table, event)` or `(room, event)`.
- For `postgres_changes`: evaluates the existing Cedar policy with action `PgrestLambda::Action::"subscribe"` on resource `PgrestLambda::Table`. Deny-by-default.
- For `broadcast`: evaluates a new Cedar action `PgrestLambda::Action::"broadcast"` on `PgrestLambda::Room` (new resource). Default template grants authenticated users broadcast on any room.
- `service_role` bypasses, same as REST.

**Per-row filtering on `postgres_changes`.** Cedar evaluates the row *after* the publisher fetches it, before fan-out. AppSync doesn't know about row-level policy, so the publisher emits one message per `(row, matching_subscribers_batch)` only if Cedar permits. Simplest first cut: the publisher runs Cedar once per event against the *table* (not the row), and the **client adapter** applies row-level filtering on receive using the JWT it already has. Not ideal but matches Supabase behavior: Supabase also delegates row-level RLS to the server-side realtime worker, but its worker has DB access we don't want to replicate in v1.

  → Flagged as a known v1 limitation: **postgres_changes events leak rows that Cedar would deny on a row-level read.** Document it. Recommend `service_role`-restricted tables or public tables for v1 realtime.

### Publisher integration

`cli/templates/lambda/index.mjs` currently delegates to `pgrest.handler(event)`. Two hook options:

1. **pgrest-lambda event hook** — if pgrest-lambda exposes `afterMutation(row, op, table)` callbacks, register one in `index.mjs`. Needs a pgrest-lambda release.
2. **Wrap the handler** — inspect the response after `pgrest.handler(event)` returns; if it was a successful INSERT/UPDATE/DELETE (path `/rest/v1/{table}`, methods POST/PATCH/DELETE, status 2xx), parse the response body and publish.

Option 2 is self-contained (no pgrest-lambda change) at the cost of re-parsing. Start with option 2, migrate to option 1 if pgrest-lambda grows a hook.

### Client adapter

`@supabase/supabase-js` accepts a custom `realtime` option (per its source). The adapter implements the `RealtimeClient` surface: `channel()`, `on()`, `subscribe()`, `unsubscribe()`. Underneath it opens a single AppSync Events WebSocket connection per client, multiplexes channels, and dispatches `postgres_changes` / `broadcast` events to the right callbacks.

Ship the adapter as a file the user imports:

```javascript
import { createClient } from '@supabase/supabase-js';
import { realtime } from '@boa/realtime'; // bundled with cli/templates/client

const supabase = createClient(API_URL, ANON_KEY, { realtime: realtime(APPSYNC_URL) });
```

For v1 the adapter lives in the BOA repo and is copied into new projects by `boa init` (like `cli/templates/lambda/`). Publishing to npm is a follow-up.

---

## CLI surface

Realtime ships as an **extension**, not default — matches the ALB pattern, avoids forcing AppSync costs on users who don't need it.

```
boa extend realtime
boa remove realtime
```

`extend realtime` adds:

- `cli/extensions/realtime/fragment.yaml` — AppSync Events API, Lambda authorizer function, IAM role for publisher, outputs (`AppSyncHttpEndpoint`, `AppSyncRealtimeEndpoint`).
- Env vars on `ApiFunction`: `APPSYNC_HTTP_ENDPOINT`, `APPSYNC_API_KEY` (or IAM).
- Wraps `ApiFunction` policy to grant `appsync:EventPublish` on the new API.

`.boa/config.json` gains `appsync: { httpEndpoint, realtimeEndpoint }` so the skill/dashboard can surface it.

---

## File plan

| Path                                                          | What it is                                     | New? |
|---------------------------------------------------------------|------------------------------------------------|------|
| `cli/extensions/realtime/fragment.yaml`                       | SAM fragment: AppSync Events + authorizer      | new  |
| `cli/extensions/realtime/README.md`                           | Extension docs                                 | new  |
| `cli/templates/lambda/realtime-publisher.mjs`                 | Post-response publisher (AWS SDK v3 AppSync)   | new  |
| `cli/templates/lambda/realtime-authorizer.mjs`                | JWT-verifying Lambda authorizer for AppSync    | new  |
| `cli/templates/lambda/index.mjs`                              | Call publisher after successful mutation       | edit |
| `cli/templates/client/realtime.mjs`                           | Client adapter for @supabase/supabase-js       | new  |
| `cli/commands/extend.mjs`                                     | Register `realtime` extension                  | edit |
| `cli/commands/extensions.mjs`                                 | Surface `realtime` in listing                  | edit |
| `cli/templates/policies/default.cedar` (or equiv)             | Add `subscribe` + `broadcast` actions          | edit |
| `plugin/docs/REALTIME-PATTERNS.md`                            | Agent-facing docs                              | new  |
| `plugin/skills/boa/SKILL.md`                                  | Mention realtime extension                     | edit |
| `docs/guides/architecture.md`                                 | Replace "Future: events-lambda" section        | edit |
| `plans/pre-launch-plan.md`                                    | Flip Realtime from "Designed, not implemented" | edit |
| `evals/scenarios/*`                                           | At least one realtime scenario (chat app)      | new  |

---

## Milestones

1. **M1 — Publisher alone** (no client). `boa extend realtime` stands up AppSync. After a REST INSERT on `todos`, the event appears on the AppSync channel. Verify with `aws appsync-events` CLI or a raw WebSocket client. No adapter, no auth yet.
2. **M2 — Lambda authorizer.** JWT-based subscribe auth, Cedar check on `subscribe` action. Unauthorized clients disconnected.
3. **M3 — Client adapter.** `supabase.channel('todos').on('postgres_changes', ...).subscribe()` end-to-end in the `todo-app` sample project.
4. **M4 — Broadcast.** `supabase.channel('room:42').on('broadcast', ...).send(...)` works between two browsers.
5. **M5 — Docs + eval.** REALTIME-PATTERNS.md, chat-app eval scenario, `boa verify` check for the extension.

---

## Decisions

1. **Extension, not default.** Ships behind `boa extend realtime`. No AppSync cost for projects that don't opt in.
2. **Row-leak accepted for v1.** `postgres_changes` may emit rows a Cedar read policy would deny at the row level. Document the limitation; recommend `service_role`-restricted or public tables for realtime in v1. Row-level filtering in the publisher is a v2 item.
3. **Adapter distributed by copy.** `cli/templates/client/realtime.mjs` is copied into each project by `boa init` / `boa extend realtime`. No `@boa/realtime` npm package in v1.
4. **Cedar actions: `subscribe` and `broadcast`.** New actions under the `PgrestLambda` namespace. New resource type `PgrestLambda::Room` for broadcast.
