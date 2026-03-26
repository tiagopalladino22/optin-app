-- Publications registry (3-letter codes for each publication)
create table if not exists publications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (client_id, code)
);

create index if not exists idx_publications_client on publications(client_id);

-- Automations (scheduled segment actions)
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  publication_id uuid references publications(id) on delete set null,
  name text not null,
  rules jsonb not null default '[]',
  logic text not null default 'and' check (logic in ('and', 'or')),
  schedule_day integer not null check (schedule_day between 0 and 6),
  schedule_hour integer not null check (schedule_hour between 0 and 23),
  schedule_timezone text not null default 'America/New_York',
  actions jsonb not null default '[]',
  cohort_weeks integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automations_client on automations(client_id);
create index if not exists idx_automations_schedule on automations(is_active, schedule_day, schedule_hour);

-- Automation runs (execution audit log)
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  run_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  action_taken text,
  subscribers_processed integer default 0,
  subscribers_deleted integer default 0,
  subscribers_kept integer default 0,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_runs_automation on automation_runs(automation_id);
create index if not exists idx_automation_runs_run_at on automation_runs(run_at);

-- Automation snapshots (weekly metrics for dashboards)
create table if not exists automation_snapshots (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  run_id uuid references automation_runs(id) on delete set null,
  publication_code text not null,
  list_name text,
  list_id integer,
  week_number integer,
  snapshot_date date not null default current_date,
  total_subscribers integer not null default 0,
  unique_openers integer not null default 0,
  non_openers integer not null default 0,
  kept_count integer not null default 0,
  deleted_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_snapshots_automation on automation_snapshots(automation_id, snapshot_date);
create index if not exists idx_automation_snapshots_pub on automation_snapshots(publication_code, week_number);

-- RLS policies
alter table publications enable row level security;
alter table automations enable row level security;
alter table automation_runs enable row level security;
alter table automation_snapshots enable row level security;

-- Publications policies
create policy "admins_see_all_publications" on publications
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "clients_see_own_publications" on publications
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and client_id = publications.client_id)
  );

-- Automations policies
create policy "admins_see_all_automations" on automations
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "clients_see_own_automations" on automations
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and client_id = automations.client_id)
  );

-- Runs policies
create policy "admins_see_all_runs" on automation_runs
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

-- Snapshots policies
create policy "admins_see_all_snapshots" on automation_snapshots
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );
