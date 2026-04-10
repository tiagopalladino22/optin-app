-- Add requested_count to sourcing_slots: how many contacts the client wants
-- allocated from this segment (a number <= net_new_count).
alter table sourcing_slots add column if not exists requested_count integer;
