-- Migration for SaaS Multi-Tenancy (Phase 2.1)
-- 1. Create Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tier TEXT DEFAULT 'growth' CHECK (tier IN ('entry', 'growth', 'enterprise')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add org_id to existing tables
ALTER TABLE users ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE projects ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE messages ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE knowledge_base ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE user_preferences ADD COLUMN org_id UUID REFERENCES organizations(id);

-- 3. Setup Default Organization for existing data
INSERT INTO organizations (name, tier) VALUES ('Default Organization', 'growth');

-- Update all existing records to the default org
UPDATE users SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);
UPDATE projects SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);
UPDATE conversations SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);
UPDATE messages SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);
UPDATE knowledge_base SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);
UPDATE user_preferences SET org_id = (SELECT id FROM organizations WHERE name = 'Default Organization' LIMIT 1);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- 5. Define RLS Policies
-- Organization: Only members can see their org
CREATE POLICY "Org isolation" ON organizations
    USING (id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Users: Only members of the same org can see each other
CREATE POLICY "User isolation" ON users
    USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- Projects: Isolation by org_id
CREATE POLICY "Project isolation" ON projects
    USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- Conversations: Isolation by org_id
CREATE POLICY "Conversation isolation" ON conversations
    USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- Messages: Isolation by org_id
CREATE POLICY "Message isolation" ON messages
    USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- Knowledge Base: Private vs Global logic
-- Global KB: org_id is NULL, Private KB: org_id is set
CREATE POLICY "KB isolation" ON knowledge_base
    USING (org_id IS NULL OR org_id = (SELECT org_id FROM users WHERE id = auth.uid()))
    WITH CHECK (org_id IS NULL OR org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- User Preferences: Isolation by user_id (already exists) and org_id
CREATE POLICY "Preference isolation" ON user_preferences
    USING (user_id = auth.uid() AND org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
