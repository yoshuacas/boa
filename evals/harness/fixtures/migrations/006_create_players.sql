-- 006_create_players.sql
-- Player roster: details for each player on a team
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id TEXT NOT NULL,             -- references teams(id)
  user_id TEXT,                      -- references users(id), nullable for players without accounts
  name TEXT NOT NULL,
  jersey_number INTEGER NOT NULL,
  position TEXT NOT NULL,            -- 'GK', 'DEF', 'MID', 'FWD'
  profile_photo_key TEXT,            -- S3 file key for player profile picture
  status TEXT DEFAULT 'active',      -- 'active' | 'injured' | 'suspended'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
