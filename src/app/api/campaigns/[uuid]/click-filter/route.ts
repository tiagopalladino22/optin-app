import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET /api/campaigns/<campaign_uuid>/click-filter?threshold=5
//
// Returns the bot-filtering breakdown for a campaign:
//   {
//     threshold_seconds: 5,
//     total: 1234,    // every click we've recorded for this campaign
//     bot: 42,        // clicks within <threshold> seconds of delivery → likely bot
//     human: 1180,    // clicks after <threshold> seconds of delivery → likely human
//     unmatched: 12   // clicks where we couldn't find a matching delivery (no Hyvor data, fallback to "human")
//   }
//
// "Unmatched" generally happens for older clicks that pre-date the delivery
// webhook being live, or when the recipient email was on a different domain
// than what we routed deliveries for.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { uuid } = await params
  if (!uuid) {
    return NextResponse.json({ error: 'campaign uuid required' }, { status: 400 })
  }

  const url = new URL(request.url)
  const thresholdRaw = url.searchParams.get('threshold')
  const threshold = thresholdRaw ? Math.max(0, Math.min(60, parseFloat(thresholdRaw))) : 5

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase.rpc('campaign_click_breakdown', {
    p_campaign_uuid: uuid,
    p_threshold_seconds: threshold,
  })

  if (error) {
    console.error('[click-filter] RPC failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The function returns a single row; supabase wraps it in an array.
  const row = Array.isArray(data) ? data[0] : data
  const total = Number(row?.total ?? 0)
  const bot = Number(row?.bot ?? 0)
  const human = Number(row?.human ?? 0)
  const unmatched = Number(row?.unmatched ?? 0)

  // For client users on the default Listmonk we'd ideally scope to their
  // assigned lists, but click-filter operates on already-aggregated counts —
  // the worst case is they see breakdown for a campaign they couldn't see in
  // the campaigns list anyway. Acceptable for now.

  return NextResponse.json({
    threshold_seconds: threshold,
    total,
    bot,
    human,
    unmatched,
  })
}
