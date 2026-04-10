-- Per D-09: Delete all existing projects (test data, clean slate)
delete from agent_logs where project_id is not null;
delete from projects;

-- Per D-10: Add NOT NULL user_id FK to projects
alter table projects add column user_id uuid not null references users(id) on delete cascade;
create index if not exists idx_projects_user_id on projects(user_id);
