-- Per-client sender domain used to route Hyvor bounce webhooks to the
-- correct Listmonk instance. The shared bounce webhook reads send.from_address
-- from Hyvor, extracts the domain, and looks up the client by this column.
alter table clients add column if not exists sender_domain text;
create index if not exists idx_clients_sender_domain on clients (lower(sender_domain));
