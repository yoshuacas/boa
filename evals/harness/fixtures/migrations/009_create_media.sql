-- 009_create_media.sql
-- Media uploads: team photos, player profile pictures, game photos
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id TEXT NOT NULL,             -- references teams(id)
  uploaded_by TEXT NOT NULL,          -- references users(id)
  file_key TEXT NOT NULL,            -- S3 file key
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  category TEXT DEFAULT 'team_photo', -- 'team_photo' | 'player_profile' | 'game_photo'
  caption TEXT,
  game_id TEXT,                      -- references games(id), nullable
  player_id TEXT,                    -- references players(id), nullable
  created_at TIMESTAMPTZ DEFAULT NOW()
);
