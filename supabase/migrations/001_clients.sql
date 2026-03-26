-- Clients table
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_email text not null,
  listmonk_url text not null,
  listmonk_api_key text, -- encrypted API key (optional, we use basic auth by default)
  listmonk_username text,
  listmonk_password text,
  created_at timestamptz not null default now()
);

-- User profiles (extends Supabase auth.users)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('admin', 'client')),
  client_id uuid references clients(id) on delete set null,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table clients enable row level security;
alter table user_profiles enable row level security;

-- Admins can see all clients; client users see only their own
create policy "admins_see_all_clients" on clients
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "clients_see_own" on clients
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.client_id = clients.id
    )
  );

-- Users can read their own profile
create policy "users_read_own_profile" on user_profiles
  for select using (id = auth.uid());
