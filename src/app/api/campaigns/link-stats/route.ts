import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'

type FetchFn = (path: string, options?: RequestInit) => Promise<Response>

// GET /api/campaigns/link-stats?id=123&instance=xxx
// Returns per-link unique + total clicks for a campaign
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const campaignId = searchParams.get('id')
  const instanceId = searchParams.get('instance')

  if (!campaignId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Resolve Listmonk instance
  let fetchFn: FetchFn = listmonkFetch
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

  // 1. Get total clicks per link from analytics endpoint
  const from = '2020-01-01T00:00:00Z'
  const to = new Date().toISOString()
  const analyticsRes = await fetchFn(
    `campaigns/analytics/links?id=${campaignId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )

  if (!analyticsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch link analytics' }, { status: 502 })
  }

  const analyticsData = await analyticsRes.json()
  const totalLinks: { url: string; count: number }[] = analyticsData.data || []

  // Sort by total clicks descending, limit to top 25
  totalLinks.sort((a, b) => b.count - a.count)
  const topLinks = totalLinks.slice(0, 25)

  // 2. For each link, get unique clickers count via subscriber query
  const results: { url: string; total_clicks: number; unique_clicks: number }[] = []

  // Try multiple query patterns to find the right schema
  for (const link of topLinks) {
    let uniqueCount = 0
    const escapedUrl = link.url.replace(/'/g, "''")

    // Try approach 1: link_clicks has url column directly
    // Try approach 2: link_clicks has link_id referencing campaign_links table
    const queries = [
      `subscribers.id IN (SELECT subscriber_id FROM link_clicks WHERE campaign_id = ${campaignId} AND url = '${escapedUrl}')`,
      `subscribers.id IN (SELECT subscriber_id FROM link_clicks WHERE campaign_id = ${campaignId} AND link_id IN (SELECT id FROM campaign_links WHERE url = '${escapedUrl}'))`,
    ]

    for (const query of queries) {
      try {
        const res = await fetchFn(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          const count = data.data?.total ?? 0
          if (count > 0) {
            uniqueCount = count
            break
          }
        }
      } catch {
        // try next query
      }
    }

    results.push({
      url: link.url,
      total_clicks: link.count,
      unique_clicks: uniqueCount,
    })
  }

  return NextResponse.json({ data: results })
}
