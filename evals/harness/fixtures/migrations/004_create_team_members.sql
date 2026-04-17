-- 004_create_team_members.sql
-- Membership + role assignment: links users to teams with a role
-- Roles: 'admin', 'coach', 'player'
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id TEXT NOT NULL,             -- references teams(id)
  user_id TEXT NOT NULL,             -- references users(id)
  role TEXT NOT NULL DEFAULT 'player',  -- 'admin' | 'coach' | 'player'
  joined_at TIMESTAMPTZ DEFAULT NOW()
);
