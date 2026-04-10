-- Sourcing Slot System: client-facing Apollo segment builder
-- Clients configure up to 3 Apollo sourcing segments per week.

-- 1. Add Apollo + sourcing window config to clients
alter table clients add column if not exists apollo_api_key text;
alter table clients add column if not exists sourcing_window_day_open smallint;  -- 0=Sun..6=Sat, NULL = always open
alter table clients add column if not exists sourcing_window_day_close smallint; -- 0=Sun..6=Sat

-- 2. sourcing_weeks: one row per (client, ISO week)
create table if not exists sourcing_weeks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,  -- Monday of the ISO week
  week_end date not null,    -- Sunday of the ISO week
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists idx_sourcing_weeks_client on sourcing_weeks(client_id, week_start desc);

-- 3. sourcing_slots: one row per configured segment (up to 3 per week)
create table if not exists sourcing_slots (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references sourcing_weeks(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  slot_number smallint not null check (slot_number between 1 and 3),
  filters jsonb not null default '{}'::jsonb,
  net_new_count integer,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, slot_number)
);

create index if not exists idx_sourcing_slots_client on sourcing_slots(client_id, status);
create index if not exists idx_sourcing_slots_week on sourcing_slots(week_id);

-- 4. RLS policies
alter table sourcing_weeks enable row level security;
alter table sourcing_slots enable row level security;

create policy "admins_see_all_sourcing_weeks" on sourcing_weeks
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "clients_see_own_sourcing_weeks" on sourcing_weeks
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and client_id = sourcing_weeks.client_id)
  );

create policy "admins_see_all_sourcing_slots" on sourcing_slots
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

create policy "clients_see_own_sourcing_slots" on sourcing_slots
  for select using (
    exists (select 1 from user_profiles where id = auth.uid() and client_id = sourcing_slots.client_id)
  );
