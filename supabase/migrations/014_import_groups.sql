-- User-defined groups for organizing import tracking records

create table if not exists import_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_groups_client on import_groups(client_id, sort_order);

-- Optional group assignment for tracking records
alter table import_tracking add column if not exists group_id uuid references import_groups(id) on delete set null;
create index if not exists idx_import_tracking_group on import_tracking(group_id);
