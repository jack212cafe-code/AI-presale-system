-- Correction log: human feedback on wrong BOM/solution values
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  field text not null,
  wrong_value text not null,
  correct_value text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_corrections_project_id on corrections(project_id);
create index if not exists idx_corrections_field on corrections(field);
