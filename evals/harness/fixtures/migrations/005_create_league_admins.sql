-- 005_create_league_admins.sql
-- League-level admin role (separate from team roles)
CREATE TABLE IF NOT EXISTS league_admins (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  league_id TEXT NOT NULL,           -- references leagues(id)
  user_id TEXT NOT NULL,             -- references users(id)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
