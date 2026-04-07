-- Add 150growth client mapping + sync settings to publications
ALTER TABLE publications ADD COLUMN IF NOT EXISTS growth_client_id text;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS sync_grouping text NOT NULL DEFAULT 'issue_number' CHECK (sync_grouping IN ('issue_number', 'week', 'day'));
ALTER TABLE publications ADD COLUMN IF NOT EXISTS sync_send_days jsonb NOT NULL DEFAULT '[]';
ALTER TABLE publications ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS sync_match_by text NOT NULL DEFAULT 'code' CHECK (sync_match_by IN ('code', 'name'));

-- Webhook sync log for auditing pushes to 150growth
CREATE TABLE IF NOT EXISTS webhook_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('campaign_stats', 'import_tracking', 'sourcing')),
  publication_code text,
  growth_client_id text,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  retry_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_sync_log_status ON webhook_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_webhook_sync_log_type ON webhook_sync_log(sync_type, created_at);
