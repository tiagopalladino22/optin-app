import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'

// Map URL path segments to resource types for filtering
const RESOURCE_TYPE_MAP: Record<string, string> = {
  lists: 'list',
  campaigns: 'campaign',
  templates: 'template',
}

// ── Stale-while-revalidate cache ──
// Serves cached data immediately, refreshes from Listmonk in the background.
// Fresh TTL: 5 minutes (serve directly, no revalidation)
// Stale TTL: 30 minutes (serve stale, trigger background refresh)
// After stale TTL: fetch fresh (blocking)
const cache = new Map<string, { data: unknown; status: number; freshUntil: number; staleUntil: number }>()
const FRESH_TTL = 5 * 60_000   // 5 minutes
const STALE_TTL = 30 * 60_000  // 30 minutes
const revalidating = new Set<string>()

function getCached(key: string): { data: unknown; status: number; isStale: boolean } | null {
  const entry = cache.get(key)
  if (!entry) return null
  const now = Date.now()
  if (now > entry.staleUntil) {
    // Too old, discard
    cache.delete(key)
    return null
  }
  return { data: entry.data, status: entry.status, isStale: now > entry.freshUntil }
}

function setCache(key: string, data: unknown, status: number) {
  const now = Date.now()
  cache.set(key, { data, status, freshUntil: now + FRESH_TTL, staleUntil: now + STALE_TTL })
  // Evict old entries
  if (cache.size > 100) {
    cache.forEach((v, k) => {
      if (now > v.staleUntil) cache.delete(k)
    })
  }
}

// Background revalidation — fetches fresh data without blocking the response
function revalidateInBackground(key: string, fullPath: string, fetchOptions: RequestInit) {
  if (revalidating.has(key)) return // already revalidating
  revalidating.add(key)
  listmonkFetch(fullPath, fetchOptions)
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json()
        setCache(key, data, res.status)
      }
    })
    .catch(() => {})
    .finally(() => revalidating.delete(key))
}

// Invalidate cache for a resource type after mutations
function invalidateCache(resourceSegment: string) {
  const keysToDelete: string[] = []
  cache.forEach((_, key) => {
    if (key.startsWith(resourceSegment)) keysToDelete.push(key)
  })
  keysToDelete.forEach((key) => cache.delete(key))
}

// Fetch lists/campaigns from all client-specific Listmonk instances (for admins only)
// Returns the merged results, prefixed with an instance tag for uniqueness
async function fetchFromClientInstances(
  fullPath: string,
  fetchOptions: RequestInit,
): Promise<Record<string, unknown>[]> {
  const supabase = await createServiceRoleClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, listmonk_url, listmonk_username, listmonk_password')
    .not('listmonk_url', 'is', null)
    .not('listmonk_username', 'is', null)
    .not('listmonk_password', 'is', null)

  if (!clients || clients.length === 0) return []

  const allResults: Record<string, unknown>[] = []

  for (const client of clients) {
    if (!client.listmonk_url || !client.listmonk_username || !client.listmonk_password) continue
    try {
      const clientFetch = createClientListmonkFetch({
        url: client.listmonk_url,
        username: client.listmonk_username,
        password: client.listmonk_password,
      })

      // Fetch all pages from this instance
      let page = 1
      while (true) {
        const pathWithPage = fullPath.includes('page=')
          ? fullPath.replace(/page=\d+/, `page=${page}`)
          : `${fullPath}${fullPath.includes('?') ? '&' : '?'}page=${page}&per_page=100`

        const res = await clientFetch(pathWithPage, fetchOptions)
        if (!res.ok) break
        const data = await res.json()
        const results = data?.data?.results || []

        // Tag each result with the client name so admins know which instance it's from
        for (const item of results) {
          allResults.push({
            ...item,
            _instance: client.name,
            _instance_id: client.id,
          })
        }

        if (results.length < 100) break
        page++
        if (page > 20) break // safety
      }
    } catch (err) {
      console.error(`[Multi-instance] Failed to fetch from ${client.name}:`, err)
    }
  }

  return allResults
}

async function getClientResources(clientId: string, resourceType?: string) {
  // Use service role client to bypass RLS — the proxy already verified auth
  const supabase = await createServiceRoleClient()
  let query = supabase
    .from('client_resources')
    .select('listmonk_id, resource_type')
    .eq('client_id', clientId)

  if (resourceType) {
    query = query.eq('resource_type', resourceType)
  }

  const { data } = await query
  return data || []
}

async function getSessionAndClient() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const serviceClient = await createServiceRoleClient()
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return {
    userId: user.id,
    role: profile.role as string,
    clientId: profile.client_id as string | null,
  }
}

async function handleProxy(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  const session = await getSessionAndClient()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pathStr = params.path.join('/')
  const resourceSegment = params.path[0]
  const resourceType = RESOURCE_TYPE_MAP[resourceSegment]

  // Build fetch options
  const fetchOptions: RequestInit = { method }

  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.json()
      fetchOptions.body = JSON.stringify(body)
    } catch {
      // No body
    }
  }

  // Forward query params
  const url = new URL(request.url)

  // For client users requesting lists or campaigns, fetch all pages so filtering
  // doesn't break pagination (filtered results < per_page would stop the client from paginating)
  if (session.role !== 'admin' && (resourceType === 'list' || resourceType === 'campaign')) {
    url.searchParams.set('per_page', '500')
    url.searchParams.set('page', '1')
  }

  const queryString = url.searchParams.toString()
  const fullPath = queryString ? `${pathStr}?${queryString}` : pathStr

  let data: unknown
  let status: number

  if (method === 'GET') {
    // Stale-while-revalidate: serve cached data instantly, refresh in background
    const cached = getCached(fullPath)
    if (cached) {
      data = cached.data
      status = cached.status
      // If stale, trigger background refresh (response is still instant)
      if (cached.isStale) {
        revalidateInBackground(fullPath, fullPath, fetchOptions)
      }
    } else {
      // No cache at all — must fetch (blocking)
      try {
        const lmResponse = await listmonkFetch(fullPath, fetchOptions)
        data = await lmResponse.json()
        status = lmResponse.status
        if (status >= 200 && status < 300) {
          setCache(fullPath, data, status)
        }
      } catch (err) {
        console.error(`Listmonk fetch failed for ${fullPath}:`, err)
        return NextResponse.json(
          { error: 'Listmonk is not responding. Please try again.', data: { results: [], total: 0 } },
          { status: 504 }
        )
      }
    }
  } else {
    // Mutations: fetch directly and invalidate cache
    try {
      const lmResponse = await listmonkFetch(fullPath, fetchOptions)
      data = await lmResponse.json()
      status = lmResponse.status
      invalidateCache(resourceSegment)
    } catch (err) {
      console.error(`Listmonk mutation failed for ${fullPath}:`, err)
      return NextResponse.json(
        { error: 'Listmonk is not responding. Please try again.' },
        { status: 504 }
      )
    }
  }

  // Admins see everything from ALL instances (default + client-specific)
  if (session.role === 'admin') {
    // Only merge additional instances for list/campaign GET requests
    if (method === 'GET' && (resourceType === 'list' || resourceType === 'campaign')) {
      try {
        const extraResults = await fetchFromClientInstances(fullPath, fetchOptions)
        if (extraResults.length > 0) {
          const typedData = data as { data?: { results?: Record<string, unknown>[]; total?: number } }
          if (typedData.data?.results) {
            typedData.data.results.push(...extraResults)
            typedData.data.total = typedData.data.results.length
          }
        }
      } catch (err) {
        console.error('[Multi-instance] Merge failed:', err)
      }
    }
    return NextResponse.json(data, { status })
  }

  if (!session.clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  // Filter response to client scope
  const typedData = data as { data?: { results?: Record<string, unknown>[]; total?: number } }
  if (typedData.data?.results) {
    // Get the client's assigned lists (only resource type we store)
    const listResources = await getClientResources(session.clientId, 'list')
    const allowedListIds = listResources.map((r) => r.listmonk_id)

    if (resourceType === 'list') {
      // Filter lists directly by assigned IDs
      typedData.data.results = typedData.data.results.filter(
        (item) => typeof item.id === 'number' && allowedListIds.includes(item.id)
      )
    } else if (resourceType === 'campaign') {
      // Auto-filter campaigns: show if the campaign targets any of the client's lists
      typedData.data.results = typedData.data.results.filter((item) => {
        const campaignLists = item.lists as { id: number }[] | undefined
        if (!campaignLists || campaignLists.length === 0) return false
        return campaignLists.some((l) => allowedListIds.includes(l.id))
      })
    } else if (resourceType === 'template') {
      // Templates: show all (no restriction needed, they're just HTML)
    }

    typedData.data.total = typedData.data.results.length
  }

  return NextResponse.json(data, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleProxy(request, params, 'GET')
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleProxy(request, params, 'POST')
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleProxy(request, params, 'PUT')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return handleProxy(request, params, 'DELETE')
}
