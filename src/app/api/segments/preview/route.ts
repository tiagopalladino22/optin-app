import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getMatchingSubscribers, type SegmentRule } from '@/lib/automation-engine'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'
import { isDemoMode } from '@/lib/demo/config'

// POST preview segment: returns matching subscriber count + sample rows
export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({
      count: 12480,
      sample: [
        { email: 'jane@example.com', name: 'Jane Cooper' },
        { email: 'tom@example.com', name: 'Tom Reilly' },
        { email: 'priya@example.com', name: 'Priya Singh' },
      ],
    })
  }

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rules, logic, returnAll, exportAll, instanceId } = (await request.json()) as {
    rules: SegmentRule[]
    logic: 'and' | 'or'
    returnAll?: boolean
    exportAll?: boolean
    instanceId?: string
  }

  if (!rules?.length) {
    return NextResponse.json({ error: 'At least one rule is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Resolve which Listmonk to query against:
  //  • admin + instanceId → that client's Listmonk
  //  • client user → their own client's Listmonk (if credentials set)
  //  • otherwise → default
  const targetClientId = session.role === 'admin' && instanceId ? instanceId : session.clientId
  let fetchFn: typeof listmonkFetch = listmonkFetch
  if (targetClientId) {
    const { data: client } = await supabase
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

  // For client users on the default Listmonk, restrict to assigned lists.
  // Clients with their own dedicated Listmonk own everything in that instance.
  let allowedListIds: number[] = []
  if (session.role !== 'admin' && session.clientId && fetchFn === listmonkFetch) {
    const { data: resources } = await supabase
      .from('client_resources')
      .select('listmonk_id')
      .eq('client_id', session.clientId)
      .eq('resource_type', 'list')

    allowedListIds = resources?.map((r) => r.listmonk_id) || []
    if (allowedListIds.length === 0) {
      return NextResponse.json({ count: 0, sample: [] })
    }
  }

  try {
    console.log('[Preview] Rules received:', JSON.stringify(rules))
    console.log('[Preview] Logic:', logic)

    const limit = exportAll ? undefined : returnAll ? 200 : 10
    const { count, subscribers } = await getMatchingSubscribers(rules, logic, {
      allowedListIds,
      maxResults: limit,
      fetchFn,
    })
    console.log('[Preview] Count:', count, 'Sample size:', subscribers.length)

    const sample = subscribers.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      attribs: s.attribs,
      lists: s.lists?.map((l) => l.name) || [],
      created_at: s.created_at,
    }))

    return NextResponse.json({ count, sample })
  } catch (err) {
    console.error('Segment preview failed:', err)
    return NextResponse.json({ error: 'Failed to query subscribers' }, { status: 500 })
  }
}
