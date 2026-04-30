-- Many-to-many between users and clients. Lets a single client-role user
-- access multiple clients via the navbar instance selector (same UX as admins
-- but limited to their assigned set). user_profiles.client_id is kept as a
-- denormalized cache of the user's primary client.

create table if not exists user_clients (
  user_id     uuid not null references user_profiles(id) on delete cascade,
  client_id   uuid not null references clients(id)       on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- One primary per user (partial unique index)
create unique index if not exists idx_user_clients_one_primary
  on user_clients(user_id)
  where is_primary = true;

create index if not exists idx_user_clients_user on user_clients(user_id);

-- Backfill: every existing client-role user with a client_id gets that
-- as their primary user_clients row.
insert into user_clients (user_id, client_id, is_primary)
select id, client_id, true
from user_profiles
where client_id is not null
on conflict (user_id, client_id) do nothing;

-- RLS — service-role only writes
alter table user_clients enable row level security;
