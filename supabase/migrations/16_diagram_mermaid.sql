-- Add Mermaid diagram storage to projects
ALTER TABLE projects ADD COLUMN diagram_mermaid TEXT;
ALTER TABLE projects ADD COLUMN diagram_generated_at TIMESTAMPTZ;