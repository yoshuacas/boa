-- 006_add_payment_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_payments_user ON payments(user_id);
