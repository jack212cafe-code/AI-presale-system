-- Add specialist_briefs_json column to projects table
ALTER TABLE projects ADD COLUMN specialist_briefs_json jsonb DEFAULT '[]';
