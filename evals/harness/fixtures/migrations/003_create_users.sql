-- 003_create_users.sql
-- App users, linked to Cognito via id = sub
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- Cognito sub UUID
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_key TEXT,                   -- S3 file key for profile picture
  created_at TIMESTAMPTZ DEFAULT NOW()
);
