create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  status text not null default 'intake',
  intake_json jsonb default '{}'::jsonb,
  requirements_json jsonb,
  solution_json jsonb,
  bom_json jsonb,
  proposal_url text,
  human_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  category text not null,
  title text not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pricing_catalog (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  part_number text not null,
  description text not null,
  unit_price numeric(14, 2) not null,
  currency text not null default 'THB',
  valid_from date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists agent_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  agent_name text not null,
  model_used text not null,
  tokens_used integer not null default 0,
  duration_ms integer not null default 0,
  status text not null default 'success',
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_status on projects(status);
create index if not exists idx_kb_category on knowledge_base(category);
create index if not exists idx_kb_embedding on knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_pricing_vendor on pricing_catalog(vendor);
create index if not exists idx_agent_logs_project_id on agent_logs(project_id);

create or replace function match_knowledge_base(
  query_embedding vector(1536),
  match_count integer default 5
)
returns table (
  id uuid,
  source_key text,
  category text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
as $$
  select
    knowledge_base.id,
    knowledge_base.source_key,
    knowledge_base.category,
    knowledge_base.title,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where knowledge_base.embedding is not null
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
$$;


create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id text not null,
  stage text not null default 'greeting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_project_id on conversations(project_id);
create index if not exists idx_conversations_user_id on conversations(user_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
