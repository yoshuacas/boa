-- 007_add_notification_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_notifications_user ON notifications(user_id);
