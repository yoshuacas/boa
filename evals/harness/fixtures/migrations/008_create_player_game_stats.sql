-- 008_create_player_game_stats.sql
-- Per-game per-player statistics
CREATE TABLE IF NOT EXISTS player_game_stats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  game_id TEXT NOT NULL,             -- references games(id)
  player_id TEXT NOT NULL,           -- references players(id)
  team_id TEXT NOT NULL,             -- references teams(id), denormalized for queries
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  started BOOLEAN DEFAULT FALSE,     -- was player in starting lineup
  created_at TIMESTAMPTZ DEFAULT NOW()
);
