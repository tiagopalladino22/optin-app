import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { isDemoMode } from '@/lib/demo/config'
import { getDemoCampaignById } from '@/lib/demo/fixtures/campaigns'

type FetchFn = (path: string, options?: RequestInit) => Promise<Response>

// Cache unique stats for 60 seconds (keyed by instance:id)
const cache = new Map<string, { uniqueOpens: number; uniqueClicks: number; unsubs: number; expires: number }>()
const CACHE_TTL = 60_000

// GET /api/campaigns/unique-stats?ids=260,261,262&instance=xxx
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const idsParam = request.nextUrl.searchParams.get('ids')
  if (!idsParam) {
    return NextResponse.json({ error: 'ids parameter required' }, { status: 400 })
  }

  const campaignIds = idsParam.split(',').map(Number).filter(Boolean)
  if (campaignIds.length === 0) {
    return NextResponse.json({ error: 'No valid campaign IDs' }, { status: 400 })
  }

  if (isDemoMode()) {
    const data: Record<number, { uniqueOpens: number; uniqueClicks: number; unsubs: number }> = {}
    for (const id of campaignIds) {
      const c = getDemoCampaignById(id)
      if (c) {
        data[id] = {
          uniqueOpens: Math.round(c.views * 0.78),
          uniqueClicks: Math.round(c.clicks * 0.85),
          unsubs: Math.round(c.sent * 0.001),
        }
      }
    }
    return NextResponse.json({ data })
  }

  // Resolve which Listmonk to query:
  //  • admin + ?instance=X → that client's Listmonk
  //  • client user → their own client's Listmonk (if credentials set)
  //  • otherwise → default
  const instanceParam = request.nextUrl.searchParams.get('instance')
  const targetClientId = session.role === 'admin' && instanceParam
    ? instanceParam
    : session.role !== 'admin' && session.clientId
      ? session.clientId
      : null

  let fetchFn: FetchFn = listmonkFetch
  if (targetClientId) {
    const svc = await createServiceRoleClient()
    const { data: client } = await svc
      .from('clients')
      .select('listmonk_url, listmonk_username, listmonk_password')
      .eq('id', targetClientId)
      .single()
    if (client?.listmonk_url && client?.listmonk_username && client?.listmonk_password) {
      fetchFn = createClientListmonkFetch({
        url: client.listmonk_url,
        username: client.listmonk_username,
        password: client.listmonk_password,
      })
    }
  }
  const cacheKeyPrefix = targetClientId || 'default'

  const results: Record<number, { uniqueOpens: number; uniqueClicks: number; unsubs: number }> = {}
  const uncachedIds: number[] = []
  const now = Date.now()

  for (const id of campaignIds) {
    const cacheKey = `${cacheKeyPrefix}:${id}`
    const cached = cache.get(cacheKey)
    if (cached && now < cached.expires) {
      results[id] = { uniqueOpens: cached.uniqueOpens, uniqueClicks: cached.uniqueClicks, unsubs: cached.unsubs }
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length > 0) {
    // Fetch campaign details to get list IDs and send dates
    const campaignDetails = await Promise.all(
      uncachedIds.map(async (id) => {
        try {
          const res = await fetchFn(`campaigns/${id}`)
          if (!res.ok) return { id, lists: [] as number[], sentAt: '' }
          const data = await res.json()
          const c = data.data
          return {
            id,
            lists: (c.lists || []).map((l: { id: number }) => l.id),
            sentAt: c.started_at || c.send_at || c.created_at || '',
          }
        } catch {
          return { id, lists: [] as number[], sentAt: '' }
        }
      })
    )

    // Sort campaigns by send date to determine time windows
    const sorted = [...campaignDetails].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    )

    // Build time windows: each campaign's unsubs are counted from its send date
    // until the next campaign's send date (or now if it's the most recent)
    const timeWindows: Record<number, { from: string; to: string }> = {}
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]
      timeWindows[current.id] = {
        from: current.sentAt,
        to: next ? next.sentAt : new Date().toISOString(),
      }
    }

    const batchSize = 5
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (id) => {
          const detail = campaignDetails.find((d) => d.id === id)
          const window = timeWindows[id]

          const [opens, clicks, unsubs] = await Promise.all([
            getUniqueCount(fetchFn, 'campaign_views', id),
            getUniqueCount(fetchFn, 'link_clicks', id),
            detail && window ? getUnsubCount(fetchFn, detail.lists, window.from, window.to) : Promise.resolve(0),
          ])

          results[id] = { uniqueOpens: opens, uniqueClicks: clicks, unsubs }
          cache.set(`${cacheKeyPrefix}:${id}`, { uniqueOpens: opens, uniqueClicks: clicks, unsubs, expires: now + CACHE_TTL })
        })
      )
    }
  }

  // Evict expired entries
  if (cache.size > 200) {
    cache.forEach((v, k) => {
      if (now > v.expires) cache.delete(k)
    })
  }

  return NextResponse.json({ data: results })
}

async function getUniqueCount(fetchFn: FetchFn, table: string, campaignId: number): Promise<number> {
  try {
    const query = `subscribers.id IN (SELECT subscriber_id FROM ${table} WHERE campaign_id=${campaignId})`
    const res = await fetchFn(
      `subscribers?per_page=0&query=${encodeURIComponent(query)}`
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}

async function getUnsubCount(fetchFn: FetchFn, listIds: number[], from: string, to: string): Promise<number> {
  if (listIds.length === 0 || !from) return 0
  try {
    const listFilter = listIds.length === 1
      ? `list_id = ${listIds[0]}`
      : `list_id IN (${listIds.join(',')})`
    const query = `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE ${listFilter} AND status = 'unsubscribed' AND updated_at >= '${from}' AND updated_at < '${to}')`
    const res = await fetchFn(
      `subscribers?per_page=0&query=${encodeURIComponent(query)}`
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}
