-- 005_create_notifications.sql
-- Stores notifications/confirmations sent to players (e.g., payment confirmations).
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,           -- references users(id), enforced by Cedar policies
  type TEXT NOT NULL,              -- payment_confirmation | registration_update | etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
