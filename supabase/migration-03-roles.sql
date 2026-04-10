alter table users
  add column if not exists role text not null default 'engineer'
    check (role in ('admin', 'manager', 'engineer'));

create index if not exists idx_users_role on users(role);
