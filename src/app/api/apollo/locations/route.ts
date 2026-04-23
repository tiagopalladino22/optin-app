import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createApolloFetch } from '@/lib/apollo'
import { isDemoMode } from '@/lib/demo/config'

// Location validator — confirms that a user-typed location matches something in Apollo's index.
// We can't enumerate all locations, so we probe by sending the query as a person_locations filter
// and checking whether Apollo returns any results. If it does, the string is valid.

const locationCache = new Map<string, { valid: boolean; count: number; cachedAt: number }>()
const CACHE_TTL = 60 * 60_000 // 1 hour

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const clientIdOverride = url.searchParams.get('clientId')
  const clientId =
    session.role === 'admin' && clientIdOverride ? clientIdOverride : session.clientId
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const cacheKey = `${clientId}:${q.toLowerCase()}`
  const cached = locationCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return NextResponse.json({
      suggestions: cached.valid ? [{ label: q, count: cached.count }] : [],
    })
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
    return NextResponse.json({ suggestions: [], error: 'no_api_key' })
  }

  try {
    const apolloFetch = createApolloFetch(apiKey)
    const res = await apolloFetch('mixed_people/search', {
      person_locations: [q],
      page: 1,
      per_page: 1,
    })
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] })
    }
    const json = await res.json()
    const count = json?.pagination?.total_entries ?? 0
    const valid = count > 0
    locationCache.set(cacheKey, { valid, count, cachedAt: Date.now() })
    return NextResponse.json({
      suggestions: valid ? [{ label: q, count }] : [],
    })
  } catch (err) {
    console.error('[Apollo locations] fetch failed', err)
    return NextResponse.json({ suggestions: [] })
  }
}
