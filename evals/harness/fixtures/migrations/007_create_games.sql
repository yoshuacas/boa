-- 007_create_games.sql
-- Game/match tracking
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  league_id TEXT NOT NULL,           -- references leagues(id)
  home_team_id TEXT NOT NULL,        -- references teams(id)
  away_team_id TEXT NOT NULL,        -- references teams(id)
  game_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'scheduled',   -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
