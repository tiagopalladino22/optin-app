-- Segments: stored segment definitions with filter rules
create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '[]',
  logic text not null default 'and' check (logic in ('and', 'or')),
  subscriber_count integer default 0,
  last_run_at timestamptz,
  exported_list_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_segments_client on segments(client_id);

alter table segments enable row level security;

create policy "admins_see_all_segments" on segments
  for all using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "clients_manage_own_segments" on segments
  for all using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.client_id = segments.client_id
    )
  );
