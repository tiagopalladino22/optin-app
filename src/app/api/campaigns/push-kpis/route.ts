import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'
import { pushToGrowth } from '@/lib/webhook-client'

interface CampaignData {
  id: number
  name: string
  subject: string
  sent: number
  views: number
  clicks: number
  bounces: number
  started_at: string | null
  created_at: string
  lists: { id: number; name: string }[]
}

// POST /api/campaigns/push-kpis — manually push aggregated KPIs from selected campaigns
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    campaignIds?: number[]
    growthClientId?: string
    issueName?: string
    instanceId?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { campaignIds, growthClientId, issueName, instanceId } = body

  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    return NextResponse.json({ error: 'campaignIds is required' }, { status: 400 })
  }
  if (!growthClientId) {
    return NextResponse.json({ error: 'growthClientId is required' }, { status: 400 })
  }
  if (!issueName || !issueName.trim()) {
    return NextResponse.json({ error: 'issueName is required' }, { status: 400 })
  }

  // Resolve which Listmonk instance to use
  let fetchFn = listmonkFetch
  if (instanceId) {
    const supabase = await createServiceRoleClient()
    const { data: client } = await supabase
      .from('clients')
      .select('listmonk_url, listmonk_username, listmonk_password')
      .eq('id', instanceId)
      .single()

    if (client?.listmonk_url && client.listmonk_username && client.listmonk_password) {
      fetchFn = createClientListmonkFetch({
        url: client.listmonk_url,
        username: client.listmonk_username,
        password: client.listmonk_password,
      })
    }
  }

  // Fetch all selected campaigns
  const campaigns: CampaignData[] = []
  for (const id of campaignIds) {
    try {
      const res = await fetchFn(`campaigns/${id}`)
      if (!res.ok) continue
      const data = await res.json()
      const c = data.data
      if (c) {
        campaigns.push({
          id: c.id,
          name: c.name,
          subject: c.subject || c.name,
          sent: c.sent || 0,
          views: c.views || 0,
          clicks: c.clicks || 0,
          bounces: c.bounces || 0,
          started_at: c.started_at,
          created_at: c.created_at,
          lists: c.lists || [],
        })
      }
    } catch {
      // skip failed fetch
    }
  }

  if (campaigns.length === 0) {
    return NextResponse.json({ error: 'No campaigns found' }, { status: 404 })
  }

  // Aggregate stats: compute unique opens/clicks per campaign, then sum
  let totalSent = 0
  let totalOpens = 0
  let totalClicks = 0
  let totalUnsubs = 0
  let totalBounces = 0
  const subSends: {
    list_name: string
    recipients: number
    opens: number
    clicks: number
    unsubs: number
    bounces: number
    spam_reports: number
    sort_order: number
  }[] = []

  for (const campaign of campaigns) {
    const [uniqueOpens, uniqueClicks] = await Promise.all([
      getUniqueCount(fetchFn, 'campaign_views', campaign.id),
      getUniqueCount(fetchFn, 'link_clicks', campaign.id),
    ])

    const unsubs = await getUnsubCount(
      fetchFn,
      campaign.lists.map((l) => l.id),
      campaign.started_at || campaign.created_at,
      new Date().toISOString()
    )

    totalSent += campaign.sent
    totalOpens += uniqueOpens
    totalClicks += uniqueClicks
    totalUnsubs += unsubs
    totalBounces += campaign.bounces

    // One sub_send per campaign — use the campaign name
    subSends.push({
      list_name: campaign.name,
      recipients: campaign.sent,
      opens: uniqueOpens,
      clicks: uniqueClicks,
      unsubs,
      bounces: campaign.bounces,
      spam_reports: 0,
      sort_order: subSends.length,
    })
  }

  const openRate = totalSent > 0 ? parseFloat(((totalOpens / totalSent) * 100).toFixed(2)) : 0
  const ctr = totalOpens > 0 ? parseFloat(((totalClicks / totalOpens) * 100).toFixed(2)) : 0
  const unsubRate = totalSent > 0 ? parseFloat(((totalUnsubs / totalSent) * 100).toFixed(3)) : 0
  const bounceRate = totalSent > 0 ? parseFloat(((totalBounces / totalSent) * 100).toFixed(2)) : 0

  // Earliest send date
  const sendDates = campaigns
    .map((c) => c.started_at || c.created_at)
    .filter(Boolean)
    .map((d) => new Date(d).toISOString().slice(0, 10))
    .sort()
  const sendDate = sendDates[0] || new Date().toISOString().slice(0, 10)

  const result = await pushToGrowth({
    type: 'campaign_stats',
    client_id: growthClientId,
    data: {
      issue_name: issueName.trim(),
      issue_number: null,
      send_date: sendDate,
      recipients: totalSent,
      opens: totalOpens,
      clicks: totalClicks,
      unsubs: totalUnsubs,
      bounces: totalBounces,
      spam_reports: 0,
      open_rate: openRate,
      ctr,
      unsub_rate: unsubRate,
      spam_rate: 0,
      bounce_rate: bounceRate,
      sub_sends: subSends,
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: `Push failed: ${result.body.slice(0, 200)}` },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    campaigns: campaigns.length,
    recipients: totalSent,
    opens: totalOpens,
    clicks: totalClicks,
  })
}

async function getUniqueCount(
  fetchFn: typeof listmonkFetch,
  table: string,
  campaignId: number
): Promise<number> {
  try {
    const query = `subscribers.id IN (SELECT subscriber_id FROM ${table} WHERE campaign_id=${campaignId})`
    const res = await fetchFn(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}

async function getUnsubCount(
  fetchFn: typeof listmonkFetch,
  listIds: number[],
  from: string,
  to: string
): Promise<number> {
  if (listIds.length === 0 || !from) return 0
  try {
    const listFilter = listIds.length === 1
      ? `list_id = ${listIds[0]}`
      : `list_id IN (${listIds.join(',')})`
    const query = `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE ${listFilter} AND status = 'unsubscribed' AND updated_at >= '${from}' AND updated_at < '${to}')`
    const res = await fetchFn(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}
