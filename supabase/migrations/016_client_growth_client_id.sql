-- 150growth client UUID lives on the client profile now (was on publications).
-- Used by /api/campaigns/push-kpis to know which 150growth client to push KPIs to.
alter table clients add column if not exists growth_client_id text;
