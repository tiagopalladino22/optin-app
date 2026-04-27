-- Per-client Hyvor webhook secret. Each client's Listmonk has its own Hyvor
-- project, which generates its own webhook secret. The new unified webhook
-- endpoint /api/webhooks/hyvor/<clientId> verifies signatures using this
-- per-client secret instead of a single shared env var.
alter table clients add column if not exists hyvor_webhook_secret text;
