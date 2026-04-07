import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { pushToGrowth } from '@/lib/webhook-client'

// GET /api/cron/sync-growth — daily reconciliation cron (7 AM UTC)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const results: { action: string; status: string }[] = []

  // 1. Retry failed webhook pushes (up to 3 retries)
  const { data: failedLogs } = await supabase
    .from('webhook_sync_log')
    .select('*')
    .eq('status', 'failed')
    .lt('retry_count', 3)
    .order('created_at', { ascending: true })
    .limit(20)

  if (failedLogs && failedLogs.length > 0) {
    for (const log of failedLogs) {
      const payload = log.payload as { type: string; client_id: string; data: Record<string, unknown> }
      if (!payload?.type || !payload?.client_id) continue

      try {
        // Mark as retrying
        await supabase
          .from('webhook_sync_log')
          .update({ status: 'retrying', retry_count: log.retry_count + 1 })
          .eq('id', log.id)

        const result = await pushToGrowth(
          {
            type: payload.type as 'campaign_stats' | 'import_tracking' | 'sourcing',
            client_id: payload.client_id,
            data: payload.data,
          },
          log.publication_code || undefined
        )

        results.push({
          action: `retry ${log.sync_type}`,
          status: result.ok ? 'success' : `failed (attempt ${log.retry_count + 1})`,
        })
      } catch (err) {
        results.push({
          action: `retry ${log.sync_type}`,
          status: `error: ${err instanceof Error ? err.message : 'Unknown'}`,
        })
      }
    }
  }

  // 2. Trigger campaign stats sync for recent campaigns
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const syncRes = await fetch(`${baseUrl}/api/sync/campaign-stats`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    })

    const syncData = await syncRes.json()
    results.push({
      action: 'campaign_stats_sync',
      status: syncRes.ok ? `synced ${syncData.results?.length || 0} issues` : 'failed',
    })
  } catch (err) {
    results.push({
      action: 'campaign_stats_sync',
      status: `error: ${err instanceof Error ? err.message : 'Unknown'}`,
    })
  }

  // 3. Cleanup old sync logs (older than 30 days)
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('webhook_sync_log')
      .delete()
      .lt('created_at', cutoff)
    results.push({ action: 'cleanup_logs', status: 'done' })
  } catch {
    results.push({ action: 'cleanup_logs', status: 'failed' })
  }

  return NextResponse.json({
    message: `Reconciliation complete: ${results.length} actions`,
    results,
  })
}
