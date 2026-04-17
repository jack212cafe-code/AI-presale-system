-- Migration 17: Fix vector search returning empty results
-- Root cause: ivfflat index with lists=100 but only a few rows causes
-- probe=1 (default) to miss all rows. Switching to HNSW avoids this.

DROP INDEX IF EXISTS idx_kb_embedding;

CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON knowledge_base USING hnsw (embedding vector_cosine_ops);

-- Also rebuild match_knowledge_base with ivfflat.probes as safety net
-- in case the old index remains on some environments
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
LANGUAGE plpgsql
SET ivfflat.probes = 10
AS $$
BEGIN
  RETURN QUERY
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
END;
$$;
