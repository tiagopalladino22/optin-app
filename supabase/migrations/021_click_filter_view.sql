-- Joins each click with the recipient's most recent prior delivery so we can
-- compute time-since-delivery per click. Used for bot detection: clicks under
-- a few seconds after delivery are almost always email security scanners
-- (Microsoft Defender, Proofpoint, Mimecast, etc.) pre-clicking links.

create or replace view email_clicks_with_delivery as
select
  c.id,
  c.client_id,
  c.campaign_uuid,
  c.subscriber_uuid,
  c.subscriber_email,
  c.url,
  c.clicked_at,
  d.delivered_at,
  case
    when d.delivered_at is null then null
    else extract(epoch from (c.clicked_at - d.delivered_at))::numeric
  end as seconds_since_delivery
from email_clicks c
left join lateral (
  select delivered_at
  from email_deliveries d
  where d.email = c.subscriber_email
    and d.delivered_at <= c.clicked_at
  order by d.delivered_at desc
  limit 1
) d on true;

-- Per-campaign click breakdown for bot filtering.
-- bot_threshold defaults to 5 seconds — configurable per call.
create or replace function campaign_click_breakdown(
  p_campaign_uuid text,
  p_threshold_seconds numeric default 5
)
returns table (
  total bigint,
  bot bigint,
  human bigint,
  unmatched bigint
)
language sql
stable
as $$
  select
    count(*)::bigint as total,
    count(*) filter (where seconds_since_delivery is not null and seconds_since_delivery < p_threshold_seconds)::bigint as bot,
    count(*) filter (where seconds_since_delivery is not null and seconds_since_delivery >= p_threshold_seconds)::bigint as human,
    count(*) filter (where seconds_since_delivery is null)::bigint as unmatched
  from email_clicks_with_delivery
  where campaign_uuid = p_campaign_uuid;
$$;
