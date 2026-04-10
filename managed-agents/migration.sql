-- Run this once in Supabase SQL editor before using managed agents
ALTER TABLE projects ADD COLUMN IF NOT EXISTS managed_session_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS proposal_json JSONB;
