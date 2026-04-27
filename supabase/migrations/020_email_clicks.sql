-- Click events synced from each Listmonk instance via a 1-minute cron job
-- running on each Listmonk server. The cron pushes new rows from Listmonk's
-- local link_clicks table into this table.
--
-- We join this table with email_deliveries (subscriber_email + window) to
-- compute time-since-delivery for click bot detection.
create table if not exists email_clicks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  listmonk_click_id bigint not null,
  campaign_uuid text not null,
  subscriber_uuid text not null,
  subscriber_email text not null,
  url text,
  clicked_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  unique (client_id, listmonk_click_id)
);

create index if not exists idx_email_clicks_campaign on email_clicks (campaign_uuid, clicked_at desc);
create index if not exists idx_email_clicks_email_time on email_clicks (subscriber_email, clicked_at desc);
create index if not exists idx_email_clicks_client_id on email_clicks (client_id, listmonk_click_id);

alter table email_clicks enable row level security;
