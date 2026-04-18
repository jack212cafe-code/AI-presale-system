ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id uuid;
CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON sessions (org_id);
