-- Per-recipient delivery timestamps captured from Hyvor's send.recipient.accepted webhook.
-- Used as the baseline timestamp when computing time-since-delivery for click bot
-- detection. (Listmonk's campaign.started_at is when the send job began, which can
-- be many minutes before any specific recipient actually got the email.)
create table if not exists email_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  campaign_uuid text not null,
  subscriber_uuid text not null,
  delivered_at timestamptz not null,
  hyvor_send_uuid text,
  created_at timestamptz not null default now(),
  unique (campaign_uuid, subscriber_uuid)
);

create index if not exists idx_email_deliveries_lookup
  on email_deliveries (campaign_uuid, subscriber_uuid);
create index if not exists idx_email_deliveries_client
  on email_deliveries (client_id);

-- RLS: this table is only ever touched server-side via the service role
-- (which bypasses RLS). Enabling RLS with no policies blocks any access
-- via the anon or authenticated key.
alter table email_deliveries enable row level security;
