# Soccer Team App — Evolution from Basic to Full-Featured

This document describes a soccer team management app that progresses through five levels of complexity. Each level adds BOA capabilities that didn't exist at the previous level, so by Level 5 the app exercises every major feature of the backend.

Use this as a reference when evaluating the BOA skill. Each level maps to specific assertions that can be checked in generated artifacts.

---

## Level 1 — Game Tracker (CRUD + Auth basics)

**What the user asks for:** "Track my soccer team's games — opponent, date, location, score."

**Tables:**
- `games` — id, opponent, game_date, location, home_score, away_score, notes, user_id, created_at

**BOA capabilities tested:**
- Cognito signup/signin (auth endpoints work immediately)
- Single-table CRUD via PostgREST-compatible REST API
- Ownership-based Cedar policy (user sees only their games)
- DSQL-compatible DDL: TEXT primary keys, gen_random_uuid(), no SERIAL
- Frontend with @supabase/supabase-js

**Assertions:**
- Migration uses `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`
- No `SERIAL`, `BIGSERIAL`, or `REFERENCES` in SQL
- Cedar policy exists granting owner access to games
- Frontend imports `createClient` from `@supabase/supabase-js`

---

## Level 2 — Player Roster (multiple tables, relationships)

**What gets added:** "Add a player roster. Each player has a name, jersey number, and position. Link players to the team."

**New tables:**
- `players` — id, team_name, name, jersey_number, position, user_id, created_at

**BOA capabilities tested:**
- Multi-table schema with logical relationships (no foreign keys — documented in comments)
- Cedar policies for each new table
- Index creation with `CREATE INDEX ASYNC`

**Assertions:**
- Relationship between players and games documented in SQL comments, not `REFERENCES`
- `CREATE INDEX ASYNC` used (not bare `CREATE INDEX`)
- Cedar policy covers `players` table (not just `games`)

---

## Level 3 — Game Stats (junction tables, complex queries)

**What gets added:** "Track individual player stats per game — goals scored, assists, minutes played, yellow/red cards."

**New tables:**
- `game_stats` — id, game_id, player_id, goals, assists, minutes_played, yellow_cards, red_cards, user_id, created_at

**BOA capabilities tested:**
- Junction/association table pattern in DSQL (no FK constraints)
- Multiple indexes on a single table
- Querying related data through the REST API (filtering, ordering)

**Assertions:**
- `game_stats` links to both `games` and `players` via plain TEXT columns
- Multiple `CREATE INDEX ASYNC` statements for game_id and player_id
- No stored procedures or triggers (DSQL limitation respected)

---

## Level 4 — Media Uploads (S3 presigned URLs)

**What gets added:** "Let users upload team photos and player profile pictures."

**New tables/columns:**
- `players` gains `avatar_url` column
- `team_photos` — id, caption, photo_key, uploaded_by, user_id, created_at

**BOA capabilities tested:**
- S3 presigned URL generation (never public buckets)
- Storage integration alongside database
- Presigned upload handler in Lambda

**Assertions:**
- No `PublicRead` or `public-read` in any template
- S3 bucket has `BlockPublicAccess` enabled
- Presigned URL generation used for uploads and downloads
- `photo_key` stored in database, not the full S3 URL

---

## Level 5 — League Management (roles, multi-tenancy, complex policies)

**What gets added:** "Support multiple teams in a league. Team admins manage their roster. Coaches set lineups. Players view their own stats. League admins see everything."

**New tables:**
- `teams` — id, name, league_id, created_by, created_at
- `team_members` — id, team_id, user_id, role (admin | coach | player), created_at
- `leagues` — id, name, created_by, created_at

**Refactored:**
- `games` gains `home_team_id` and `away_team_id`
- `players` gains `team_id`

**BOA capabilities tested:**
- Role-based Cedar policies (not just ownership)
- Multi-tenancy via team/league scoping
- Service role policy for admin operations
- Complex authorization: different permissions per role
- Multiple Cedar policy files organized by concern

**Assertions:**
- Cedar policies differentiate by role (admin, coach, player)
- Service role policy present (`PgrestLambda::ServiceRole`)
- `team_members.role` column exists with constrained values
- Policies enforce team-scoped access (not just user-scoped)

---

## Capability Coverage Matrix

| BOA Capability               | L1 | L2 | L3 | L4 | L5 |
|------------------------------|----|----|----|----|-----|
| Cognito auth (signup/signin) | x  |    |    |    |     |
| Single-table CRUD            | x  |    |    |    |     |
| DSQL-safe DDL                | x  | x  | x  |    |     |
| Owner-based Cedar policy     | x  | x  | x  |    |     |
| Multi-table relationships    |    | x  | x  |    |     |
| CREATE INDEX ASYNC           |    | x  | x  |    |     |
| Junction tables              |    |    | x  |    |     |
| S3 presigned URLs            |    |    |    | x  |     |
| Storage + DB integration     |    |    |    | x  |     |
| Role-based Cedar policies    |    |    |    |    | x   |
| Multi-tenancy                |    |    |    |    | x   |
| Service role policy          |    |    |    |    | x   |
| @supabase/supabase-js        | x  | x  | x  | x  | x   |
