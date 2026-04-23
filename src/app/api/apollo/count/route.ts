import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import {
  createApolloFetch,
  buildSearchBody,
  hasAnyFilter,
  SlotFilters,
  APOLLO_SEARCH_PATH,
  APOLLO_CONTACTS_SEARCH_PATH,
} from '@/lib/apollo'
import { isDemoMode } from '@/lib/demo/config'

// Simple in-memory TTL cache for count responses.
// Key: `${clientId}:${JSON.stringify(filters)}`
const countCache = new Map<string, { count: number; cachedAt: number }>()
const CACHE_TTL = 5 * 60_000 // 5 minutes

function getCached(key: string): number | null {
  const entry = countCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    countCache.delete(key)
    return null
  }
  return entry.count
}

function setCached(key: string, count: number) {
  countCache.set(key, { count, cachedAt: Date.now() })
  // Evict stale entries if cache gets large
  if (countCache.size > 200) {
    const now = Date.now()
    countCache.forEach((v, k) => {
      if (now - v.cachedAt > CACHE_TTL) countCache.delete(k)
    })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const filters: SlotFilters = body.filters || {}

  // Admins can override the client via body.clientId; clients use their own.
  const clientId =
    session.role === 'admin' && body.clientId ? body.clientId : session.clientId
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  if (!hasAnyFilter(filters)) {
    return NextResponse.json({ count: 0 })
  }

  const cacheKey = `${clientId}:${JSON.stringify(filters)}`
  const cached = getCached(cacheKey)
  if (cached !== null) {
    return NextResponse.json({ count: cached, cached: true })
  }

  let apiKey: string | null | undefined
  if (isDemoMode()) {
    apiKey = process.env.DEMO_APOLLO_API_KEY
  } else {
    const supabase = await createServiceRoleClient()
    const { data: client } = await supabase
      .from('clients')
      .select('apollo_api_key')
      .eq('id', clientId)
      .single()
    apiKey = client?.apollo_api_key
  }

  if (!apiKey) {
    return NextResponse.json({ count: null, error: 'no_api_key' })
  }

  try {
    const apolloFetch = createApolloFetch(apiKey)
    const requestBody = buildSearchBody(filters, 1)

    // Call both endpoints in parallel: total matches + already-saved contacts.
    // Net new = total - saved.
    const [totalRes, savedRes] = await Promise.all([
      apolloFetch(APOLLO_SEARCH_PATH, requestBody),
      apolloFetch(APOLLO_CONTACTS_SEARCH_PATH, requestBody),
    ])

    if (!totalRes.ok) {
      const text = await totalRes.text()
      console.error('[Apollo count] Apollo error', totalRes.status, text)
      return NextResponse.json(
        { count: null, error: 'apollo_error', status: totalRes.status },
        { status: 200 }
      )
    }

    const totalJson = await totalRes.json()
    const total = totalJson?.pagination?.total_entries ?? 0

    // contacts/search may fail on some plans; if so, fall back to total.
    let saved = 0
    if (savedRes.ok) {
      const savedJson = await savedRes.json()
      saved = savedJson?.pagination?.total_entries ?? 0
    }

    const netNew = Math.max(0, total - saved)
    setCached(cacheKey, netNew)

    return NextResponse.json({ count: netNew })
  } catch (err) {
    console.error('[Apollo count] fetch failed', err)
    return NextResponse.json({ count: null, error: 'network_error' }, { status: 200 })
  }
}
