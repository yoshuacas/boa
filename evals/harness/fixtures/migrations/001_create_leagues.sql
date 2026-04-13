-- 001_create_leagues.sql
-- Top-level entity: a league contains multiple teams
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  season TEXT NOT NULL,              -- e.g. '2026 Spring'
  description TEXT,
  created_by TEXT NOT NULL,          -- references users(id), league creator
  created_at TIMESTAMPTZ DEFAULT NOW()
);
