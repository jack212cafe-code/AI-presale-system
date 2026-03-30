create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_users_username on users(username);
