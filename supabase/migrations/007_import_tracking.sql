-- Import tracking: logs subscriber imports and tracks weekly unique opens
create table if not exists import_tracking (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  list_id integer not null,
  list_name text not null,
  publication_code text,
  import_date date not null default current_date,
  imported_count integer not null default 0,
  week1_opens integer,
  week2_opens integer,
  week3_opens integer,
  week4_opens integer,
  remaining_subs integer,
  status text not null default 'tracking' check (status in ('tracking', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_tracking_client on import_tracking(client_id);
create index if not exists idx_import_tracking_status on import_tracking(status);
create index if not exists idx_import_tracking_list on import_tracking(list_id);

-- RLS policies
alter table import_tracking enable row level security;

create policy "admins_see_all_import_tracking" on import_tracking
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "clients_see_own_import_tracking" on import_tracking
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and client_id = import_tracking.client_id)
  );
