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
function revalidateInBackground(
  key: string,
  fullPath: string,
  fetchOptions: RequestInit,
  fetchFn: typeof listmonkFetch,
) {
  if (revalidating.has(key)) return // already revalidating
  revalidating.add(key)
  fetchFn(fullPath, fetchOptions)
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

  // Check for instance override (admin only) — lets admin pick which Listmonk to query
  const instanceId = url.searchParams.get('instance')
  url.searchParams.delete('instance') // don't forward to Listmonk

  let customFetch: typeof listmonkFetch | null = null
  let instanceName: string | null = null

  // Resolve which Listmonk instance to use
  // 1. Admin with instance param — use that client's instance
  // 2. Client user with dedicated instance — use their client's instance
  // 3. Otherwise — use default
  const resolveInstanceId = instanceId && session.role === 'admin'
    ? instanceId
    : session.role !== 'admin' && session.clientId
      ? session.clientId
      : null

  if (resolveInstanceId) {
    const svc = await createServiceRoleClient()
    const { data: client } = await svc
      .from('clients')
      .select('name, listmonk_url, listmonk_username, listmonk_password')
      .eq('id', resolveInstanceId)
      .single()
    if (client?.listmonk_url && client?.listmonk_username && client?.listmonk_password) {
      customFetch = createClientListmonkFetch({
        url: client.listmonk_url,
        username: client.listmonk_username,
        password: client.listmonk_password,
      })
      instanceName = client.name
    } else if (instanceId && session.role === 'admin') {
      // Admin passed instance ID but credentials are incomplete — return empty
      console.warn(`[Proxy] Instance ${instanceId} (${client?.name}) has incomplete credentials`)
      return NextResponse.json({
        data: { results: [], total: 0, per_page: 0, page: 1 },
      })
    }
    // For client users with no credentials on their client record,
    // fall through to use the default instance
  }

  const queryString = url.searchParams.toString()
  const fullPath = queryString ? `${pathStr}?${queryString}` : pathStr
  // Cache key includes instance so different instances don't collide
  const cacheKey = resolveInstanceId ? `${resolveInstanceId}:${fullPath}` : fullPath

  let data: unknown
  let status: number

  const doFetch = customFetch || listmonkFetch

  // Preview endpoint returns raw HTML, not JSON — bypass caching and return directly
  const isPreview = fullPath.match(/campaigns\/\d+\/preview/)
  if (isPreview && method === 'GET') {
    try {
      const lmResponse = await doFetch(fullPath, fetchOptions)
      const html = await lmResponse.text()
      return new NextResponse(html, {
        status: lmResponse.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    } catch (err) {
      console.error(`Listmonk preview failed for ${fullPath}:`, err)
      return new NextResponse('Preview not available', { status: 504 })
    }
  }

  if (method === 'GET') {
    // Stale-while-revalidate: serve cached data instantly, refresh in background
    const cached = getCached(cacheKey)
    if (cached) {
      data = cached.data
      status = cached.status
      if (cached.isStale) {
        revalidateInBackground(cacheKey, fullPath, fetchOptions, doFetch)
      }
    } else {
      try {
        const lmResponse = await doFetch(fullPath, fetchOptions)
        data = await lmResponse.json()
        status = lmResponse.status
        if (status >= 200 && status < 300) {
          setCache(cacheKey, data, status)
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
    try {
      const lmResponse = await doFetch(fullPath, fetchOptions)
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

  // Tag results with instance name so UI can show which instance data came from
  if (instanceName && session.role === 'admin') {
    const typedData = data as { data?: { results?: Record<string, unknown>[] } }
    if (typedData.data?.results) {
      typedData.data.results = typedData.data.results.map((item) => ({
        ...item,
        _instance: instanceName,
      }))
    }
  }

  // Admins see everything
  if (session.role === 'admin') {
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
