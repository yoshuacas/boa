-- 004_create_payments.sql
-- Tracks Stripe checkout payments for league registration fees.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,           -- references users(id), enforced by Cedar policies
  league_id TEXT NOT NULL,         -- references leagues(id), enforced in app
  stripe_session_id TEXT UNIQUE,   -- Stripe Checkout Session ID
  stripe_payment_intent TEXT,      -- Stripe PaymentIntent ID (set by webhook)
  amount_cents INTEGER NOT NULL,   -- amount in cents
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending',   -- pending | paid | failed | refunded
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
