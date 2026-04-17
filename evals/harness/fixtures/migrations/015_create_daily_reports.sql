-- 004_create_daily_reports.sql
-- Stores nightly aggregated stats summaries for the soccer league
CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_date DATE NOT NULL UNIQUE,
  total_goals INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  avg_goals_per_game NUMERIC(5,2) NOT NULL DEFAULT 0,
  top_scorer_player_id TEXT,          -- references players(id), enforced in app
  top_scorer_name TEXT,
  top_scorer_goals INTEGER DEFAULT 0,
  data JSONB,                         -- full breakdown for dashboard use
  created_at TIMESTAMPTZ DEFAULT NOW()
);
