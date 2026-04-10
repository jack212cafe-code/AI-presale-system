-- Add cost tracking fields to agent_logs
alter table agent_logs
  add column if not exists cost_usd numeric(10,6) not null default 0,
  add column if not exists kb_chunks_injected integer not null default 0;
