-- 005_add_daily_reports_indexes.sql
CREATE INDEX ASYNC IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date DESC);
