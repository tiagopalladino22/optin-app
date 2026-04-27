# Listmonk Click Sync — Setup SOP

One-time setup per client's Listmonk server. Once configured, the server pushes new click events to OPTIN every minute via cron.

## Prerequisites

Before starting, gather:

- **OPTIN client ID (UUID)** — the client's row in OPTIN's `clients` table. Find it in OPTIN Settings → click into the client → copy the UUID from the URL, or query Supabase:
  ```sql
  select id, name from clients order by name;
  ```
- **`LISTMONK_CLICKS_WEBHOOK_SECRET`** value — from Vercel env vars (already set globally).
- **SSH access to the Listmonk server**.
- **Listmonk's Postgres credentials** — from the server's `.env` file (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`).
- **The Postgres container name** — run `docker ps` on the host. Usually `listmonk_db` (Listmonk's standard compose) or `<project>_db_1`.

---

## Setup steps

### 1. SSH into the host

```bash
ssh root@<listmonk-server-ip>
```

Stay on the host — don't `docker exec` into a container. The cron lives on the host and uses `docker exec` to query Postgres.

### 2. Confirm Postgres container name

```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
```

Look for the row with image `postgres:*`. Note the `NAME` column value (e.g. `listmonk_db`). This is `PG_CONTAINER` in the script.

### 3. Sanity check Postgres access

```bash
docker exec <PG_CONTAINER> psql -U <PG_USER> -d <PG_DB> -At -c "select count(*) from link_clicks;"
```

Should print a number (total clicks ever tracked by this Listmonk). If it errors, fix Postgres access before continuing.

### 4. Create state directory

```bash
sudo mkdir -p /var/lib/optin-sync
sudo touch /var/lib/optin-sync/last_click_id
```

### 5. Install the sync script

Paste the whole block below, then **edit the CONFIG values** in the next step:

```bash
sudo tee /usr/local/bin/listmonk-sync-clicks.sh > /dev/null <<'OUTER_EOF'
#!/usr/bin/env bash
set -euo pipefail

# ── CONFIG (edit per server) ──────────────────────────────────────
OPTIN_URL="https://app.tryoptin.com"
OPTIN_CLIENT_ID=""             # UUID from OPTIN clients table
OPTIN_BEARER=""                # LISTMONK_CLICKS_WEBHOOK_SECRET
PG_CONTAINER="listmonk_db"     # docker ps NAME of the Postgres container
PG_USER="listmonk"
PG_DB="listmonk"
BATCH_LIMIT=500
STATE_FILE="/var/lib/optin-sync/last_click_id"
# ──────────────────────────────────────────────────────────────────

LAST_ID=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
LAST_ID=${LAST_ID:-0}

SQL_FILE=$(mktemp)
cat > "$SQL_FILE" <<SQL_EOF
SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json)::text
FROM (
  SELECT
    lc.id,
    c.uuid AS campaign_uuid,
    s.uuid AS subscriber_uuid,
    s.email,
    l.url,
    to_char(lc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM link_clicks lc
  JOIN subscribers s ON s.id = lc.subscriber_id
  JOIN campaigns   c ON c.id = lc.campaign_id
  LEFT JOIN links  l ON l.id = lc.link_id
  WHERE lc.id > __LAST_ID__
  ORDER BY lc.id
  LIMIT __BATCH_LIMIT__
) t;
SQL_EOF

sed -i "s/__LAST_ID__/$LAST_ID/g; s/__BATCH_LIMIT__/$BATCH_LIMIT/g" "$SQL_FILE"

JSON=$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -At < "$SQL_FILE")
rm -f "$SQL_FILE"

if command -v jq >/dev/null 2>&1; then
  COUNT=$(printf '%s' "$JSON" | jq 'length')
else
  COUNT=$(printf '%s' "$JSON" | grep -o '"id":' | wc -l | tr -d ' ')
fi

if [[ "$COUNT" -eq 0 ]]; then
  echo "[$(date -Iseconds)] No new clicks (cursor=$LAST_ID)"
  exit 0
fi

PAYLOAD_FILE=$(mktemp)
printf '{"clicks":%s}' "$JSON" > "$PAYLOAD_FILE"

RESP=$(curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $OPTIN_BEARER" \
  -H "Content-Type: application/json" \
  --data-binary @"$PAYLOAD_FILE" \
  "$OPTIN_URL/api/webhooks/listmonk-clicks?clientId=$OPTIN_CLIENT_ID")
rm -f "$PAYLOAD_FILE"

HTTP_CODE=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[$(date -Iseconds)] FAIL: HTTP $HTTP_CODE — $BODY" >&2
  exit 1
fi

NEW_ID=$(printf '%s' "$BODY" | grep -o '"max_id":[0-9]*' | cut -d: -f2)
if [[ -n "$NEW_ID" ]]; then
  echo "$NEW_ID" > "$STATE_FILE"
  echo "[$(date -Iseconds)] OK: synced $COUNT clicks (cursor $LAST_ID → $NEW_ID)"
else
  echo "[$(date -Iseconds)] WARN: no max_id. Body: $BODY" >&2
fi
OUTER_EOF

sudo chmod +x /usr/local/bin/listmonk-sync-clicks.sh
```

### 6. Edit the CONFIG block

```bash
sudo nano /usr/local/bin/listmonk-sync-clicks.sh
```

Set these four values from your prerequisites:
- `OPTIN_CLIENT_ID="..."` — this client's UUID
- `OPTIN_BEARER="..."` — the `LISTMONK_CLICKS_WEBHOOK_SECRET` value
- `PG_CONTAINER="..."` — confirmed Postgres container name from Step 2
- `PG_USER="..."` / `PG_DB="..."` — usually both `listmonk` for default Listmonk installs; verify against the server's `.env` file

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

> **Watch out for smart quotes**: if you paste from Notion/Apple Notes/etc, the quotes around values can get auto-corrupted. Verify with `bash -n /usr/local/bin/listmonk-sync-clicks.sh && echo OK`. If it errors, run:
> ```bash
> sudo sed -i 's/”/"/g; s/“/"/g' /usr/local/bin/listmonk-sync-clicks.sh
> ```

### 7. Run once manually

```bash
sudo /usr/local/bin/listmonk-sync-clicks.sh
```

Expected outcomes:
- `OK: synced N clicks (cursor 0 → ...)` → working. Re-run several times to drain the historical backlog.
- `No new clicks (cursor=0)` → connection works but Listmonk has no clicks yet.
- `FAIL: HTTP 401 — Invalid bearer token` → `OPTIN_BEARER` mismatch.
- `FAIL: HTTP 400 — Unknown clientId` → `OPTIN_CLIENT_ID` mismatch or client doesn't exist in OPTIN.
- `FAIL: HTTP 404 — ...` → OPTIN deploy missing the route. Push + redeploy on OPTIN side.
- `psql: command not found` → script not running via `docker exec` (Step 2). Verify CONFIG.
- `could not translate host name` → Postgres container name in `PG_CONTAINER` is wrong.

### 8. Drain the backlog

For Listmonks with a lot of historical clicks, repeatedly run until caught up:

```bash
while true; do
  out=$(sudo /usr/local/bin/listmonk-sync-clicks.sh)
  echo "$out"
  echo "$out" | grep -q "No new clicks" && break
  sleep 1
done
```

### 9. Install the cron

```bash
sudo crontab -e
```

Pick `1` (nano) on first run. Add this single line:

```
* * * * * /usr/local/bin/listmonk-sync-clicks.sh >> /var/log/optin-sync-clicks.log 2>&1
```

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

Verify:
```bash
sudo crontab -l
```

Should show your line.

### 10. Watch the live log

```bash
sudo tail -f /var/log/optin-sync-clicks.log
```

You'll see one entry per minute — `OK: synced N clicks ...` when there's new activity, or `No new clicks (cursor=...)` when idle. Leave running for a minute or two to confirm cron is firing, then `Ctrl+C` to stop tailing.

---

## Verify in OPTIN (Supabase)

```sql
-- Total clicks ingested for this client
select count(*) as total, max(clicked_at) as latest
from email_clicks
where client_id = '<OPTIN_CLIENT_ID>';

-- All clients at a glance
select c.name, count(ec.*) as clicks, max(ec.clicked_at) as latest
from clients c
left join email_clicks ec on ec.client_id = c.id
group by c.id, c.name
order by clicks desc nulls last;
```

If the latest sync timestamp is within the last few minutes → cron is healthy.

---

## Common gotchas

- **Cron not firing**: check `sudo grep CRON /var/log/syslog | tail` to see if cron tried to run the script. If nothing, restart cron with `sudo systemctl restart cron`.
- **Deploys wipe the script**: this script lives on the host (NOT inside any container), so it survives `docker compose down/up`. Don't put it inside the listmonk_app container.
- **Smart quotes in CONFIG**: see Step 6 note above. Always verify with `bash -n` after editing.
- **`POSTGRES_USER`/`POSTGRES_DB` differ from defaults**: check the Listmonk server's `.env` file for the actual values used by docker-compose.
- **Multiple containers with same Postgres image**: if the server hosts multiple Listmonks, double-check you're pointing at the right one (usually the container name carries the project prefix).

---

---

## Hyvor webhook setup (per Hyvor project)

Each client's Hyvor project needs to point its webhooks at OPTIN. This is independent of the click sync above and powers delivery / bounce / complaint tracking.

### Steps

1. **Find this client's OPTIN client ID** — same UUID as in the click sync prerequisites.

2. **In the client's Hyvor project**, go to **Webhooks → Create webhook** with:
   - **URL**: `https://app.tryoptin.com/api/webhooks/hyvor-bounce/<OPTIN_CLIENT_ID>`
   - **Events**: tick all three:
     - `send.recipient.accepted`
     - `send.recipient.bounced`
     - `send.recipient.complained`
   - **Save** — Hyvor generates a webhook secret. Copy it immediately.

3. **In OPTIN → Settings → Clients → this client → Edit**:
   - Paste the secret into **Hyvor Webhook Secret**
   - Save

4. **Verify**:
   - Send any test campaign through this client's Listmonk
   - Within seconds, check Vercel logs for `hyvor-bounce/<clientId>` — should see `POST 200`
   - Check Supabase: `select count(*) from email_deliveries where client_id = '<id>' and delivered_at > now() - interval '5 minutes'` — count should grow

### Common gotchas

- **`401 Webhook secret not configured for client`** → no `hyvor_webhook_secret` saved in OPTIN for this client. Re-paste in Settings.
- **`401 Invalid signature`** → secret in OPTIN doesn't match the one in Hyvor. Re-copy from Hyvor and re-paste.
- **`404 Unknown clientId`** → URL has the wrong UUID. Verify the client ID in Hyvor's webhook URL matches the OPTIN client.

---

## Per-client checklist

Track which clients are set up:

| Client | OPTIN client ID | Server | Click sync | Cron active | Hyvor webhook | Hyvor secret saved |
|--------|-----------------|--------|------------|-------------|---------------|---------------------|
| (name) | (uuid)          | (host) | ☐          | ☐           | ☐             | ☐                   |

Add a row per client. Once all rows have all checkboxes, you're done.
