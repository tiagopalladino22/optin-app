import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listmonkFetch } from '@/lib/listmonk'

// Cache unique stats for 60 seconds — these don't change often
const cache = new Map<number, { uniqueOpens: number; uniqueClicks: number; expires: number }>()
const CACHE_TTL = 60_000

// GET /api/campaigns/unique-stats?ids=260,261,262
// Returns unique opens and clicks per campaign
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

  const results: Record<number, { uniqueOpens: number; uniqueClicks: number }> = {}
  const uncachedIds: number[] = []
  const now = Date.now()

  // Check cache first
  for (const id of campaignIds) {
    const cached = cache.get(id)
    if (cached && now < cached.expires) {
      results[id] = { uniqueOpens: cached.uniqueOpens, uniqueClicks: cached.uniqueClicks }
    } else {
      uncachedIds.push(id)
    }
  }

  // Fetch uncached in parallel (limit concurrency to 5 at a time)
  if (uncachedIds.length > 0) {
    const batchSize = 5
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (id) => {
          const [opens, clicks] = await Promise.all([
            getUniqueCount('campaign_views', id),
            getUniqueCount('link_clicks', id),
          ])
          results[id] = { uniqueOpens: opens, uniqueClicks: clicks }
          cache.set(id, { uniqueOpens: opens, uniqueClicks: clicks, expires: now + CACHE_TTL })
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

async function getUniqueCount(table: string, campaignId: number): Promise<number> {
  try {
    const query = `subscribers.id IN (SELECT subscriber_id FROM ${table} WHERE campaign_id=${campaignId})`
    const res = await listmonkFetch(
      `subscribers?per_page=0&query=${encodeURIComponent(query)}`
    )
    if (!res.ok) return 0
    const data = await res.json()
    return data.data?.total ?? 0
  } catch {
    return 0
  }
}
