import { listmonkFetch } from './listmonk'

// ─── Types ──────────────────────────────────────────────────────

export interface SegmentRule {
  id?: string
  field: string
  operator: string
  value: string
}

export interface Subscriber {
  id: number
  email: string
  name: string
  attribs: Record<string, unknown>
  lists: { id: number; name: string }[]
  created_at: string
}

export interface MatchResult {
  count: number
  subscribers: Subscriber[]
}

// ─── Subscriber Query Engine ────────────────────────────────────
// Extracted from segment preview — used by both segments and automations

type FetchFn = typeof listmonkFetch

export async function getMatchingSubscribers(
  rules: SegmentRule[],
  logic: 'and' | 'or',
  options?: {
    allowedListIds?: number[]
    maxResults?: number
    fetchFn?: FetchFn
  }
): Promise<MatchResult> {
  const { allowedListIds = [], maxResults, fetchFn = listmonkFetch } = options || {}

  const queryParts = buildQuery(rules)

  // Check for from_lists rule to scope by list
  const listRule = rules.find((r) => r.field === 'from_lists')
  const targetListIds = listRule?.value
    ? listRule.value.split(',').map(Number).filter(Boolean)
    : []

  // Add list membership as a query part instead of looping per-list
  // This is much faster — one query instead of N sequential list fetches
  if (targetListIds.length > 0) {
    queryParts.push(
      `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id IN (${targetListIds.join(',')}))`
    )
  }

  const joiner = logic === 'and' ? ' AND ' : ' OR '
  const queryStr = queryParts.length > 0 ? queryParts.join(joiner) : ''

  console.log('[Engine] Query parts:', queryParts)
  console.log('[Engine] Full query:', queryStr)
  console.log('[Engine] Target list IDs:', targetListIds)

  let allSubscribers: Subscriber[] = []
  let serverTotal: number | null = null
  let page = 1

  while (true) {
    let url = `subscribers?page=${page}&per_page=100`
    if (queryStr) {
      url += `&query=${encodeURIComponent(queryStr)}`
    }
    const res = await fetchFn(url)
    if (!res.ok) break
    const data = await res.json()
    const results: Subscriber[] = data.data?.results || []
    // Capture the server-reported total on first page
    if (page === 1 && data.data?.total !== undefined) {
      serverTotal = data.data.total
    }
    if (results.length === 0) break
    allSubscribers.push(...results)
    // If we only need a sample, stop early (serverTotal has the real count)
    if (maxResults && allSubscribers.length >= maxResults) break
    if (results.length < 100) break
    page++
  }

  // Filter to allowed lists
  if (allowedListIds.length > 0) {
    allSubscribers = allSubscribers.filter((sub) =>
      sub.lists?.some((l) => allowedListIds.includes(l.id))
    )
  }

  // Apply client-side filters (tags, attribs)
  const clientSideRules = rules.filter(
    (r) =>
      r.field === 'attribs.tags' ||
      (r.field.startsWith('attribs.') && r.field !== 'attribs.tags')
  )

  if (clientSideRules.length > 0) {
    allSubscribers = allSubscribers.filter((sub) => {
      const results = clientSideRules.map((rule) => matchClientSide(sub, rule))
      return logic === 'and' ? results.every(Boolean) : results.some(Boolean)
    })
  }

  // Use server-reported total if we stopped early, otherwise use actual count
  const hasClientSideFilters = allowedListIds.length > 0 || rules.some(
    (r) => r.field === 'attribs.tags' || (r.field.startsWith('attribs.') && r.field !== 'attribs.tags')
  )
  const count = (hasClientSideFilters || serverTotal === null)
    ? allSubscribers.length
    : serverTotal
  const subscribers = maxResults ? allSubscribers.slice(0, maxResults) : allSubscribers

  return { count, subscribers }
}

// ─── Automation Execution ───────────────────────────────────────

interface AutomationRecord {
  id: string
  name: string
  publication_id: string | null
  rules: SegmentRule[]
  logic: 'and' | 'or'
  actions: string[]
  cohort_weeks: number | null
  schedule_day: number
  schedule_hour: number
  schedule_timezone: string
}

interface SupabaseClient {
  from: (table: string) => {
    insert: (data: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } }
    update: (data: Record<string, unknown>) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> }
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: unknown }>
        single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
      }
    }
  }
}

// Find all Listmonk lists whose name starts with a publication code
export async function getListsByPublicationCode(code: string): Promise<{ id: number; name: string }[]> {
  const allLists: { id: number; name: string }[] = []
  let page = 1
  while (true) {
    const res = await listmonkFetch(`lists?page=${page}&per_page=100`)
    if (!res.ok) break
    const data = await res.json()
    const results = data.data?.results || []
    if (results.length === 0) break
    for (const list of results) {
      if (list.name.toUpperCase().startsWith(code.toUpperCase())) {
        allLists.push({ id: list.id, name: list.name })
      }
    }
    if (results.length < 100) break
    page++
  }
  return allLists
}

export async function executeAutomation(
  automation: AutomationRecord,
  supabase: SupabaseClient,
  publicationCode?: string
): Promise<{ processed: number; deleted: number; kept: number; csvData?: string }> {
  let totalProcessed = 0
  let totalDeleted = 0
  let totalKept = 0
  let csvRows: string[] = []

  // If "all lists" is selected or no specific lists in rules, auto-find lists by pub code
  const listRule = automation.rules.find((r) => r.field === 'from_lists')
  const isAllLists = listRule?.value === 'all'
  const hasSpecificLists = listRule && listRule.value && listRule.value !== 'all'
  let listsToProcess: { id: number; name: string }[] = []

  if (publicationCode && (isAllLists || !hasSpecificLists)) {
    listsToProcess = await getListsByPublicationCode(publicationCode)
  }

  if (listsToProcess.length > 0) {
    // Run against each matching list separately
    for (const list of listsToProcess) {
      const rulesWithList: SegmentRule[] = [
        { field: 'from_lists', operator: 'in', value: String(list.id) },
        ...automation.rules.filter((r) => r.field !== 'from_lists'),
      ]

      const result = await runActionsForRules(
        automation, rulesWithList, automation.logic, supabase,
        publicationCode, list.name, list.id
      )

      totalProcessed += result.processed
      totalDeleted += result.deleted
      totalKept += result.kept
      if (result.csvRows) csvRows.push(...result.csvRows)
    }
  } else {
    // Run against the rules as-is (specific lists already selected)
    const result = await runActionsForRules(
      automation, automation.rules, automation.logic, supabase,
      publicationCode
    )
    totalProcessed = result.processed
    totalDeleted = result.deleted
    totalKept = result.kept
    if (result.csvRows) csvRows = result.csvRows
  }

  const csvData = csvRows.length > 0
    ? 'email,name,lists,attributes\n' + csvRows.join('\n')
    : undefined

  return { processed: totalProcessed, deleted: totalDeleted, kept: totalKept, csvData }
}

async function runActionsForRules(
  automation: AutomationRecord,
  rules: SegmentRule[],
  logic: 'and' | 'or',
  supabase: SupabaseClient,
  publicationCode?: string,
  listName?: string,
  listId?: number,
): Promise<{ processed: number; deleted: number; kept: number; csvRows?: string[] }> {
  const { count, subscribers } = await getMatchingSubscribers(rules, logic)

  let deleted = 0
  const csvRows: string[] = []

  // 1. Export CSV first (before deletion)
  if (automation.actions.includes('export_csv')) {
    for (const sub of subscribers) {
      const subListNames = sub.lists?.map((l) => l.name).join('; ') || ''
      const attribs = JSON.stringify(sub.attribs || {}).replace(/"/g, '""')
      csvRows.push(`"${sub.email}","${sub.name || ''}","${subListNames}","${attribs}"`)
    }
  }

  // 2. Count unique openers (before deletion)
  let uniqueOpeners = 0
  let nonOpeners = 0
  if (automation.actions.includes('store_data') || automation.actions.includes('store_count')) {
    const hasOpenRule = rules.some((r) => r.field === 'campaigns_opened')
    if (hasOpenRule) {
      uniqueOpeners = count
      nonOpeners = 0
    } else {
      const openerRules: SegmentRule[] = [
        ...rules,
        { field: 'campaigns_opened', operator: 'gte', value: '1' },
      ]
      const openersResult = await getMatchingSubscribers(openerRules, 'and')
      uniqueOpeners = openersResult.count
      nonOpeners = count - uniqueOpeners
    }
  }

  // 3. Delete subscribers
  if (automation.actions.includes('delete_subscribers')) {
    const listRule = rules.find((r) => r.field === 'from_lists')
    const targetListIds = listRule?.value
      ? listRule.value.split(',').map(Number).filter(Boolean)
      : []

    if (targetListIds.length > 0 && subscribers.length > 0) {
      const batchSize = 50
      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize)
        const ids = batch.map((s) => s.id)
        try {
          await listmonkFetch('subscribers/lists', {
            method: 'PUT',
            body: JSON.stringify({
              ids,
              action: 'remove',
              target_list_ids: targetListIds,
            }),
          })
          deleted += batch.length
        } catch {
          // Continue
        }
      }
    } else {
      for (const sub of subscribers) {
        try {
          await listmonkFetch(`subscribers/${sub.id}`, { method: 'DELETE' })
          deleted++
        } catch {
          // Continue
        }
      }
    }
  }

  const kept = count - deleted

  // 4. Store snapshot LAST — with final kept/deleted counts
  if (automation.actions.includes('store_data') || automation.actions.includes('store_count')) {
    await supabase.from('automation_snapshots').insert({
      automation_id: automation.id,
      publication_code: publicationCode || '',
      list_name: listName || null,
      list_id: listId || null,
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_subscribers: count,
      unique_openers: uniqueOpeners,
      non_openers: nonOpeners,
      kept_count: kept,
      deleted_count: deleted,
    }).select().single()
  }

  return { processed: count, deleted, kept, csvRows: csvRows.length > 0 ? csvRows : undefined }
}

// ─── Schedule Check ─────────────────────────────────────────────

export function isDue(automation: AutomationRecord, now: Date): boolean {
  // Convert current time to automation's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: automation.schedule_timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const dayPart = parts.find((p) => p.type === 'weekday')?.value
  const hourPart = parts.find((p) => p.type === 'hour')?.value

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }

  const currentDay = dayMap[dayPart || ''] ?? -1
  const currentHour = parseInt(hourPart || '-1')

  return currentDay === automation.schedule_day && currentHour === automation.schedule_hour
}

// ─── Query Builders (shared with segment preview) ───────────────

export function buildQuery(rules: SegmentRule[]): string[] {
  const parts: string[] = []

  // Extract target list IDs to scope campaign queries to only campaigns sent to these lists
  const listRule = rules.find((r) => r.field === 'from_lists')
  const scopeListIds = listRule?.value
    ? listRule.value.split(',').map(Number).filter(Boolean)
    : []
  // Subquery to get campaign IDs that were sent to the selected lists
  const scopedCampaignIds = scopeListIds.length > 0
    ? `SELECT cl.campaign_id FROM campaign_lists cl WHERE cl.list_id IN (${scopeListIds.join(',')})`
    : ''

  for (const rule of rules) {
    if (rule.field === 'from_lists') continue

    if (rule.field === 'campaigns_opened') {
      const val = parseInt(rule.value) || 0
      const campaignScope = scopedCampaignIds
        ? ` AND cv.campaign_id IN (${scopedCampaignIds})`
        : ''

      if (val === 0 && (rule.operator === 'eq' || rule.operator === 'lte')) {
        parts.push(
          `NOT EXISTS (SELECT 1 FROM campaign_views cv WHERE cv.subscriber_id = subscribers.id${campaignScope})`
        )
      } else if (rule.operator === 'lt') {
        parts.push(
          `NOT EXISTS (SELECT 1 FROM campaign_views cv WHERE cv.subscriber_id = subscribers.id${campaignScope} GROUP BY cv.subscriber_id HAVING COUNT(DISTINCT cv.campaign_id) >= ${val})`
        )
      } else {
        const op = sqlOperator(rule.operator)
        if (scopedCampaignIds) {
          parts.push(
            `subscribers.id IN (SELECT cv.subscriber_id FROM campaign_views cv WHERE cv.campaign_id IN (${scopedCampaignIds}) GROUP BY cv.subscriber_id HAVING COUNT(DISTINCT cv.campaign_id) ${op} ${val})`
          )
        } else {
          parts.push(
            `subscribers.id IN (SELECT subscriber_id FROM campaign_views GROUP BY subscriber_id HAVING COUNT(DISTINCT campaign_id) ${op} ${val})`
          )
        }
      }
    }

    if (rule.field === 'campaigns_clicked') {
      const val = parseInt(rule.value) || 0
      const campaignScope = scopedCampaignIds
        ? ` AND lc.campaign_id IN (${scopedCampaignIds})`
        : ''

      if (val === 0 && (rule.operator === 'eq' || rule.operator === 'lte')) {
        parts.push(
          `NOT EXISTS (SELECT 1 FROM link_clicks lc WHERE lc.subscriber_id = subscribers.id${campaignScope})`
        )
      } else if (rule.operator === 'lt') {
        parts.push(
          `NOT EXISTS (SELECT 1 FROM link_clicks lc WHERE lc.subscriber_id = subscribers.id${campaignScope} GROUP BY lc.subscriber_id HAVING COUNT(DISTINCT lc.campaign_id) >= ${val})`
        )
      } else {
        const op = sqlOperator(rule.operator)
        if (scopedCampaignIds) {
          parts.push(
            `subscribers.id IN (SELECT lc.subscriber_id FROM link_clicks lc WHERE lc.campaign_id IN (${scopedCampaignIds}) GROUP BY lc.subscriber_id HAVING COUNT(DISTINCT lc.campaign_id) ${op} ${val})`
          )
        } else {
          parts.push(
            `subscribers.id IN (SELECT subscriber_id FROM link_clicks GROUP BY subscriber_id HAVING COUNT(DISTINCT campaign_id) ${op} ${val})`
          )
        }
      }
    }

    if (rule.field === 'campaigns_received') {
      const val = parseInt(rule.value) || 0
      const op = sqlOperator(rule.operator)
      if (scopeListIds.length > 0) {
        // Count only finished campaigns that targeted the selected lists
        parts.push(
          `subscribers.id IN (SELECT sl.subscriber_id FROM subscriber_lists sl INNER JOIN campaign_lists cl ON cl.list_id = sl.list_id INNER JOIN campaigns c ON c.id = cl.campaign_id AND c.status = 'finished' WHERE cl.list_id IN (${scopeListIds.join(',')}) GROUP BY sl.subscriber_id HAVING COUNT(DISTINCT cl.campaign_id) ${op} ${val})`
        )
      } else {
        parts.push(
          `subscribers.id IN (SELECT sl.subscriber_id FROM subscriber_lists sl INNER JOIN campaign_lists cl ON cl.list_id = sl.list_id INNER JOIN campaigns c ON c.id = cl.campaign_id AND c.status = 'finished' GROUP BY sl.subscriber_id HAVING COUNT(DISTINCT cl.campaign_id) ${op} ${val})`
        )
      }
    }

    if (rule.field === 'date.subscribed') {
      if (rule.operator === 'before') {
        parts.push(`subscribers.created_at < '${rule.value}'`)
      } else if (rule.operator === 'after') {
        parts.push(`subscribers.created_at > '${rule.value}'`)
      }
    }
  }

  return parts
}

export function sqlOperator(op: string): string {
  switch (op) {
    case 'eq': return '='
    case 'gt': return '>'
    case 'gte': return '>='
    case 'lt': return '<'
    case 'lte': return '<='
    default: return '>='
  }
}

export function matchClientSide(sub: Subscriber, rule: SegmentRule): boolean {
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
