-- Hyvor's send.recipient.accepted event doesn't carry the original Listmonk
-- headers (X-Listmonk-Campaign / X-Listmonk-Subscriber) — only the recipient
-- server's response headers. So we identify deliveries by email address +
-- Hyvor's own send UUID, with the Listmonk fields kept optional in case
-- they show up later via another event.

alter table email_deliveries add column if not exists email text;

-- Backfill any existing rows (none expected, table is new) with empty string
-- before we make it required.
update email_deliveries set email = '' where email is null;
alter table email_deliveries alter column email set not null;

-- Listmonk fields become optional.
alter table email_deliveries alter column campaign_uuid drop not null;
alter table email_deliveries alter column subscriber_uuid drop not null;

-- Drop old composite unique (only worked when Listmonk headers were present)
-- and key on Hyvor's send uuid instead — always present, always unique.
alter table email_deliveries drop constraint if exists email_deliveries_campaign_uuid_subscriber_uuid_key;
alter table email_deliveries
  add constraint email_deliveries_hyvor_send_uuid_key unique (hyvor_send_uuid);

create index if not exists idx_email_deliveries_email_time
  on email_deliveries (email, delivered_at desc);
