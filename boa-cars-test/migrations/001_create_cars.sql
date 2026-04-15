CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
