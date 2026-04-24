-- Automations now link to a client (Listmonk instance) instead of a publication.
-- The previous publication_id is kept for backward compat; manual data migration
-- can copy over publication.client mappings before it's dropped in a future cleanup.
alter table automations add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists idx_automations_client on automations (client_id);
