-- Wiki pages: structured product knowledge for agent prompt injection
CREATE TABLE wiki_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL UNIQUE,
    vendor TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('server', 'storage', 'network', 'backup', 'software')),
    overview TEXT NOT NULL,
    key_specs TEXT NOT NULL,
    key_features TEXT NOT NULL,
    tor_keywords TEXT NOT NULL,
    positioning TEXT NOT NULL,
    related_products TEXT[] DEFAULT '{}',
    body_markdown TEXT NOT NULL,
    source_document_keys TEXT[] DEFAULT '{}',
    org_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wiki_pages_vendor ON wiki_pages(vendor);
CREATE INDEX idx_wiki_pages_category ON wiki_pages(category);
CREATE INDEX idx_wiki_pages_tor_keywords ON wiki_pages USING gin(to_tsvector('english', tor_keywords));

ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wiki isolation" ON wiki_pages
    USING (org_id IS NULL OR org_id = (SELECT org_id FROM users WHERE id = auth.uid()));