import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listmonkFetch } from '@/lib/listmonk'
import { createServerSupabaseClient } from '@/lib/supabase-server'

interface Subscriber {
  id: number
  email: string
  name: string
  attribs: Record<string, unknown>
  lists: { id: number; name: string }[]
  created_at: string
}

interface SegmentRule {
  field: string
  operator: string
  value: string
}


// POST export segment: creates a new Listmonk list with matching subscribers
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()

  // Fetch the segment
  const { data: segment, error: segError } = await supabase
    .from('segments')
    .select('*')
    .eq('id', params.id)
    .single()

  if (segError || !segment) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
  }

  // Verify ownership
  if (session.role !== 'admin' && session.clientId !== segment.client_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rules = segment.rules as SegmentRule[]
  const logic = segment.logic as 'and' | 'or'

  try {
    const matchingSubscribers = await getMatchingSubscribers(
      rules,
      logic,
      session.clientId,
      session.role === 'admin',
      supabase
    )

    if (matchingSubscribers.length === 0) {
      return NextResponse.json({ error: 'No matching subscribers to export' }, { status: 400 })
    }

    // Create a new list in Listmonk
    const listName = `Segment: ${segment.name} (${new Date().toISOString().slice(0, 10)})`
    const createListRes = await listmonkFetch('lists', {
      method: 'POST',
      body: JSON.stringify({
        name: listName,
        type: 'private',
        optin: 'single',
        description: `Auto-generated from segment "${segment.name}"`,
      }),
    })

    if (!createListRes.ok) {
      return NextResponse.json({ error: 'Failed to create list in Listmonk' }, { status: 500 })
    }

    const listData = await createListRes.json()
    const newListId = listData.data.id

    // Add matching subscribers to the new list
    const subscriberIds = matchingSubscribers.map((s) => s.id)

    const addRes = await listmonkFetch('subscribers/lists', {
      method: 'PUT',
      body: JSON.stringify({
        ids: subscriberIds,
        action: 'add',
        target_list_ids: [newListId],
        status: 'confirmed',
      }),
    })

    if (!addRes.ok) {
      return NextResponse.json({ error: 'Failed to add subscribers to list' }, { status: 500 })
    }

    // Update segment with exported list ID and count
    await supabase
      .from('segments')
      .update({
        exported_list_id: newListId,
        subscriber_count: subscriberIds.length,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // Register the new list as a client resource
    if (segment.client_id) {
      await supabase.from('client_resources').insert({
        client_id: segment.client_id,
        resource_type: 'list',
        listmonk_id: newListId,
        label: listName,
      })
    }

    return NextResponse.json({
      listId: newListId,
      listName,
      subscriberCount: subscriberIds.length,
    })
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

async function getMatchingSubscribers(
  rules: SegmentRule[],
  logic: 'and' | 'or',
  clientId: string | null,
  isAdmin: boolean,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<Subscriber[]> {
  let allowedListIds: number[] = []

  if (!isAdmin && clientId) {
    const { data: resources } = await supabase
      .from('client_resources')
      .select('listmonk_id')
      .eq('client_id', clientId)
      .eq('resource_type', 'list')

    allowedListIds = resources?.map((r) => r.listmonk_id) || []
    if (allowedListIds.length === 0) return []
  }

  // Build Listmonk query
  const queryParts = buildQuery(rules)
  const joiner = logic === 'and' ? ' AND ' : ' OR '
  const queryStr = queryParts.length > 0 ? queryParts.join(joiner) : ''

  const listRule = rules.find((r) => r.field === 'from_lists')
  const targetListIds = listRule?.value
    ? listRule.value.split(',').map(Number).filter(Boolean)
    : []

  let allSubscribers: Subscriber[] = []

  if (targetListIds.length > 0) {
    for (const listId of targetListIds) {
      let page = 1
      while (true) {
        let url = `subscribers?list_id=${listId}&page=${page}&per_page=100`
        if (queryStr) url += `&query=${encodeURIComponent(queryStr)}`
        const res = await listmonkFetch(url)
        if (!res.ok) break
        const data = await res.json()
        const results: Subscriber[] = data.data?.results || []
        if (results.length === 0) break
        allSubscribers.push(...results)
        if (results.length < 100) break
        page++
      }
    }

    const seen = new Set<number>()
    allSubscribers = allSubscribers.filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
  } else {
    let page = 1
    while (true) {
      let url = `subscribers?page=${page}&per_page=100`
      if (queryStr) url += `&query=${encodeURIComponent(queryStr)}`
      const res = await listmonkFetch(url)
      if (!res.ok) break
      const data = await res.json()
      const results: Subscriber[] = data.data?.results || []
      if (results.length === 0) break
      allSubscribers.push(...results)
      if (results.length < 100) break
      page++
    }
  }

  if (allowedListIds.length > 0) {
    allSubscribers = allSubscribers.filter((sub) =>
      sub.lists?.some((l) => allowedListIds.includes(l.id))
    )
  }

  // Apply client-side filters (tags, attribs)
  const clientSideRules = rules.filter(
    (r) => r.field === 'attribs.tags' || (r.field.startsWith('attribs.') && r.field !== 'attribs.tags')
  )

  if (clientSideRules.length > 0) {
    allSubscribers = allSubscribers.filter((sub) => {
      const results = clientSideRules.map((rule) => matchClientSide(sub, rule))
      return logic === 'and' ? results.every(Boolean) : results.some(Boolean)
    })
  }

  return allSubscribers
}

function buildQuery(rules: SegmentRule[]): string[] {
  const parts: string[] = []

  for (const rule of rules) {
    if (rule.field === 'from_lists' || rule.field === 'campaigns_received') continue

    if (rule.field === 'campaigns_opened') {
      const op = sqlOperator(rule.operator)
      const val = parseInt(rule.value) || 0
      parts.push(
        `subscribers.id IN (SELECT subscriber_id FROM campaign_views GROUP BY subscriber_id HAVING COUNT(DISTINCT campaign_id) ${op} ${val})`
      )
    }

    if (rule.field === 'campaigns_clicked') {
      const op = sqlOperator(rule.operator)
      const val = parseInt(rule.value) || 0
      parts.push(
        `subscribers.id IN (SELECT subscriber_id FROM link_clicks GROUP BY subscriber_id HAVING COUNT(DISTINCT campaign_id) ${op} ${val})`
      )
    }

    if (rule.field === 'date.subscribed') {
      if (rule.operator === 'before') parts.push(`subscribers.created_at < '${rule.value}'`)
      if (rule.operator === 'after') parts.push(`subscribers.created_at > '${rule.value}'`)
    }
  }

  return parts
}

function sqlOperator(op: string): string {
  switch (op) {
    case 'eq': return '='
    case 'gt': return '>'
    case 'gte': return '>='
    case 'lt': return '<'
    case 'lte': return '<='
    default: return '>='
  }
}

function matchClientSide(sub: Subscriber, rule: SegmentRule): boolean {
  if (rule.field === 'attribs.tags') {
    const tags = (sub.attribs?.tags as string[]) || []
    const val = rule.value.toLowerCase()
    if (rule.operator === 'includes') return tags.some((t) => String(t).toLowerCase().includes(val))
    if (rule.operator === 'excludes') return !tags.some((t) => String(t).toLowerCase().includes(val))
    return true
  }

  if (rule.field.startsWith('attribs.')) {
    const key = rule.field.split('.')[1]
    const attrVal = String(sub.attribs?.[key] || '').toLowerCase()
    const searchVal = rule.value.toLowerCase()
    if (rule.operator === 'contains') return attrVal.includes(searchVal)
    if (rule.operator === 'equals') return attrVal === searchVal
    if (rule.operator === 'not_equals') return attrVal !== searchVal
    if (rule.operator === 'starts_with') return attrVal.startsWith(searchVal)
    return true
  }

  return true
}
