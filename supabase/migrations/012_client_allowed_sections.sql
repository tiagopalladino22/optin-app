-- Per-client nav section visibility. Admin toggles which sections each
-- client can see. Default does NOT include 'sourcing' so new features
-- stay hidden until explicitly enabled.
alter table clients add column if not exists allowed_sections jsonb
  not null default '["dashboard","lists","campaigns","stats"]';
