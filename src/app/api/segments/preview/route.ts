import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getMatchingSubscribers, type SegmentRule } from '@/lib/automation-engine'

// POST preview segment: returns matching subscriber count + sample rows
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rules, logic, returnAll, exportAll } = (await request.json()) as {
    rules: SegmentRule[]
    logic: 'and' | 'or'
    returnAll?: boolean
    exportAll?: boolean
  }

  if (!rules?.length) {
    return NextResponse.json({ error: 'At least one rule is required' }, { status: 400 })
  }

  // Get the client's allowed list IDs for filtering
  let allowedListIds: number[] = []

  if (session.role !== 'admin' && session.clientId) {
    const supabase = await createServiceRoleClient()
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
