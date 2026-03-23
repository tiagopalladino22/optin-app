-- List schemas (custom field definitions per list)
create table if not exists list_schemas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  listmonk_list_id integer not null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, listmonk_list_id)
);

-- Example fields value:
-- [
--   {"key": "company", "label": "Company", "type": "text", "required": false},
--   {"key": "job_title", "label": "Job Title", "type": "text", "required": false},
--   {"key": "tags", "label": "Tags", "type": "array", "required": false}
-- ]

alter table list_schemas enable row level security;

create policy "admins_see_all_schemas" on list_schemas
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "clients_see_own_schemas" on list_schemas
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.client_id = list_schemas.client_id
    )
  );
