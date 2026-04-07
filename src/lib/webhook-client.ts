import { createServiceRoleClient } from './supabase-server'

export interface WebhookPayload {
  type: 'campaign_stats' | 'import_tracking' | 'sourcing'
  client_id: string
  data: Record<string, unknown>
}

export interface WebhookResult {
  ok: boolean
  status: number
  body: string
}

/**
 * Push data to 150growth's webhook endpoint.
 * Logs every attempt to webhook_sync_log for auditing and retry.
 */
export async function pushToGrowth(
  payload: WebhookPayload,
  publicationCode?: string
): Promise<WebhookResult> {
  const url = process.env.GROWTH_WEBHOOK_URL
  const secret = process.env.GROWTH_WEBHOOK_SECRET

  if (!url || !secret) {
    console.warn('[Webhook] GROWTH_WEBHOOK_URL or GROWTH_WEBHOOK_SECRET not configured')
    return { ok: false, status: 0, body: 'Webhook not configured' }
  }

  const supabase = await createServiceRoleClient()
  let logId: string | null = null

  // Create log entry
  try {
    const { data: logEntry } = await supabase
      .from('webhook_sync_log')
      .insert({
        sync_type: payload.type,
        publication_code: publicationCode || null,
        growth_client_id: payload.client_id,
        payload: payload as unknown as Record<string, unknown>,
        status: 'pending',
      })
      .select('id')
      .single()
    logId = logEntry?.id || null
  } catch {
    // Continue even if logging fails
  }

  // Send webhook
  let result: WebhookResult
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const body = await res.text()
    result = { ok: res.ok, status: res.status, body }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    result = { ok: false, status: 0, body: msg }
  }

  // Update log entry
  if (logId) {
    try {
      await supabase
        .from('webhook_sync_log')
        .update({
          response_status: result.status,
          response_body: result.body.slice(0, 1000),
          status: result.ok ? 'success' : 'failed',
          error_message: result.ok ? null : result.body.slice(0, 500),
        })
        .eq('id', logId)
    } catch {
      // Non-critical
    }
  }

  if (!result.ok) {
    console.error(`[Webhook] Push failed: ${result.status} ${result.body.slice(0, 200)}`)
  }

  return result
}
