-- Client resources mapping (tenant isolation layer)
create table if not exists client_resources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  resource_type text not null check (resource_type in ('list', 'campaign', 'template')),
  listmonk_id integer not null,
  label text,
  created_at timestamptz not null default now(),
  unique (client_id, resource_type, listmonk_id)
);

alter table client_resources enable row level security;

create policy "admins_see_all_resources" on client_resources
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "clients_see_own_resources" on client_resources
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.client_id = client_resources.client_id
    )
  );

-- Admins can insert/update/delete resources
create policy "admins_manage_resources" on client_resources
  for all using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );
