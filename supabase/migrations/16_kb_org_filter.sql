-- Migration 16: KB org filter for multi-tenant vector search
-- Update match_knowledge_base to filter by org_id:
--   - global KB (org_id IS NULL) is visible to all orgs
--   - org-private KB (org_id = X) is visible only to org X

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding vector(1536),
  match_count integer DEFAULT 5,
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_key text,
  category text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
AS $$
  SELECT
    knowledge_base.id,
    knowledge_base.source_key,
    knowledge_base.category,
    knowledge_base.title,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE knowledge_base.embedding IS NOT NULL
    AND (knowledge_base.org_id IS NULL OR knowledge_base.org_id = p_org_id)
  ORDER BY knowledge_base.embedding <=> query_embedding
  LIMIT match_count;
$$;
