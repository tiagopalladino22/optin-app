-- Add a locked flag to sourcing_weeks so clients can edit submitted slots
-- up until they hit the final "Confirm" button, at which point the whole
-- week becomes read-only.
alter table sourcing_weeks add column if not exists locked boolean not null default false;
