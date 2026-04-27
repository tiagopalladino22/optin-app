#!/usr/bin/env bash
#
# Sync new Listmonk link_clicks to OPTIN.
# Runs every minute via cron on each Listmonk server.
#
# Setup:
#   1. Copy this file to /usr/local/bin/listmonk-sync-clicks.sh
#   2. chmod +x /usr/local/bin/listmonk-sync-clicks.sh
#   3. Edit the CONFIG block below — set OPTIN_URL, OPTIN_CLIENT_ID,
#      OPTIN_BEARER, and PG_URL.
#   4. mkdir -p /var/lib/optin-sync && touch /var/lib/optin-sync/last_click_id
#   5. Add to root's crontab:
#        * * * * * /usr/local/bin/listmonk-sync-clicks.sh >> /var/log/optin-sync-clicks.log 2>&1
#
# What it does:
#   - Reads last synced click ID from a state file
#   - Queries Listmonk's local Postgres for click events with id > last
#   - POSTs them to OPTIN as a JSON batch
#   - On success, advances the state file
#
# Idempotent — OPTIN upserts on (client_id, listmonk_click_id) so re-running
# the same range is a no-op.

set -euo pipefail

# ────────────────────────────────────────────────────────────────────
# CONFIG — edit these per-server
# ────────────────────────────────────────────────────────────────────
OPTIN_URL="https://app.tryoptin.com"
OPTIN_CLIENT_ID=""           # the UUID from OPTIN's clients table for THIS Listmonk
OPTIN_BEARER=""              # the LISTMONK_CLICKS_WEBHOOK_SECRET value
PG_URL="postgresql://listmonk:listmonk@localhost:5432/listmonk"  # Listmonk's local Postgres
BATCH_LIMIT=1000             # max clicks per run
STATE_FILE="/var/lib/optin-sync/last_click_id"
# ────────────────────────────────────────────────────────────────────

if [[ -z "$OPTIN_CLIENT_ID" || -z "$OPTIN_BEARER" ]]; then
  echo "[$(date -Iseconds)] ERROR: OPTIN_CLIENT_ID and OPTIN_BEARER must be set in the script" >&2
  exit 1
fi

# Read cursor (default 0 = sync from beginning)
LAST_ID=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
LAST_ID=${LAST_ID:-0}

# Pull new clicks as a JSON array. Joins to subscribers + campaigns to get
# the UUIDs OPTIN keys on, plus links for the URL.
JSON=$(psql "$PG_URL" -At -c "
  SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json)::text
  FROM (
    SELECT
      lc.id,
      c.uuid AS campaign_uuid,
      s.uuid AS subscriber_uuid,
      s.email,
      l.url,
      to_char(lc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at
    FROM link_clicks lc
    JOIN subscribers s ON s.id = lc.subscriber_id
    JOIN campaigns   c ON c.id = lc.campaign_id
    LEFT JOIN links  l ON l.id = lc.link_id
    WHERE lc.id > $LAST_ID
    ORDER BY lc.id
    LIMIT $BATCH_LIMIT
  ) t;
")

# Count items quickly (jq if available, else cheap grep)
if command -v jq >/dev/null 2>&1; then
  COUNT=$(printf '%s' "$JSON" | jq 'length')
else
  COUNT=$(printf '%s' "$JSON" | grep -o '"id":' | wc -l | tr -d ' ')
fi

if [[ "$COUNT" -eq 0 ]]; then
  echo "[$(date -Iseconds)] No new clicks (cursor=$LAST_ID)"
  exit 0
fi

# POST the batch
PAYLOAD=$(printf '{"clicks":%s}' "$JSON")
RESP=$(curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $OPTIN_BEARER" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD" \
  "$OPTIN_URL/api/webhooks/listmonk-clicks?clientId=$OPTIN_CLIENT_ID")

HTTP_CODE=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[$(date -Iseconds)] FAIL: HTTP $HTTP_CODE — $BODY" >&2
  exit 1
fi

# Advance cursor to the max ID OPTIN confirmed receiving
NEW_ID=$(printf '%s' "$BODY" | grep -o '"max_id":[0-9]*' | cut -d: -f2)
if [[ -n "$NEW_ID" ]]; then
  echo "$NEW_ID" > "$STATE_FILE"
  echo "[$(date -Iseconds)] OK: synced $COUNT clicks (cursor $LAST_ID → $NEW_ID)"
else
  echo "[$(date -Iseconds)] WARN: no max_id in response — cursor not advanced. Body: $BODY" >&2
fi
