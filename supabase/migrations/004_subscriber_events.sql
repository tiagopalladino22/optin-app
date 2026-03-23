-- Subscriber events (analytics cache, populated by background sync)
create table if not exists subscriber_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  subscriber_email text not null,
  campaign_id integer not null,
  event_type text not null check (event_type in ('sent', 'open', 'click', 'bounce', 'unsub')),
  occurred_at timestamptz not null default now()
);

create index idx_subscriber_events_client on subscriber_events(client_id);
create index idx_subscriber_events_email on subscriber_events(subscriber_email);
create index idx_subscriber_events_campaign on subscriber_events(campaign_id);
create index idx_subscriber_events_type on subscriber_events(event_type);

alter table subscriber_events enable row level security;

create policy "admins_see_all_events" on subscriber_events
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.role = 'admin'
    )
  );

create policy "clients_see_own_events" on subscriber_events
  for select using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.client_id = subscriber_events.client_id
    )
  );
