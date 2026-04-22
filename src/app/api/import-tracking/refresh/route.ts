import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'
import { pushToGrowth } from '@/lib/webhook-client'

type FetchFn = (path: string, options?: RequestInit) => Promise<Response>

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Optional: only refresh specific records
    let filterIds: string[] | null = null
    try {
      const body = await request.json()
      if (Array.isArray(body?.ids) && body.ids.length > 0) {
        filterIds = body.ids
      }
    } catch {
      // No body = refresh all tracking records
    }

    const supabase = await createServiceRoleClient()
    const results: { id: string; list_id: number; week: number; status: string }[] = []

    let query = supabase
      .from('import_tracking')
      .select('*')
      .eq('status', 'tracking')

    if (filterIds) {
      query = query.in('id', filterIds)
    }

    const { data: records, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!records || records.length === 0) {
      return NextResponse.json({ message: 'No records to track', results: [] })
    }

    // Cache client fetch functions to avoid repeated DB lookups
    const clientFetchCache: Record<string, FetchFn> = {}

    for (const record of records) {
      try {
        // Determine which Listmonk instance to use
        let fetchFn: FetchFn = listmonkFetch
        if (record.client_id) {
          if (!clientFetchCache[record.client_id]) {
            const { data: client } = await supabase
              .from('clients')
              .select('listmonk_url, listmonk_username, listmonk_password')
              .eq('id', record.client_id)
              .single()
            if (client?.listmonk_url && client?.listmonk_username && client?.listmonk_password) {
              clientFetchCache[record.client_id] = createClientListmonkFetch({
                url: client.listmonk_url,
                username: client.listmonk_username,
                password: client.listmonk_password,
              })
            }
          }
          if (clientFetchCache[record.client_id]) {
            fetchFn = clientFetchCache[record.client_id]
          }
        }

        const listId = record.list_id

        // Get campaigns sent to this list after import date, ordered by send date
        const campaignIds = await getCampaignsAfterImport(fetchFn, listId, record.import_date)

        if (campaignIds.length === 0) {
          results.push({ id: record.id, list_id: listId, week: 0, status: 'no sends yet' })
          continue
        }

        // For each week (1-4), count unique openers across the first N campaigns
        const updates: Record<string, number> = {}
        const maxWeek = Math.min(campaignIds.length, 4)

        for (let w = 1; w <= maxWeek; w++) {
          const firstNCampaigns = campaignIds.slice(0, w)
          const uniqueOpens = await getUniqueOpensForCampaigns(fetchFn, listId, firstNCampaigns)
          updates[`week${w}_opens`] = uniqueOpens
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('import_tracking')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', record.id)
        }

        // Mark as completed when we have 4+ sends
        if (campaignIds.length >= 4) {
          const remainingSubs = await getRemainingSubscribers(fetchFn, listId)
          await supabase
            .from('import_tracking')
            .update({
              remaining_subs: remainingSubs,
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id)

          // Push completed tracking to 150growth
          const updatedRecord = { ...record, ...updates }
          await pushImportTracking(supabase, updatedRecord, remainingSubs)

          results.push({ id: record.id, list_id: listId, week: 4, status: `completed — ${campaignIds.length} sends` })
        } else {
          results.push({
            id: record.id,
            list_id: listId,
            week: maxWeek,
            status: `updated weeks 1-${maxWeek} (${campaignIds.length} sends)`,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ id: record.id, list_id: record.list_id, week: 0, status: `failed: ${msg}` })
      }
    }

    return NextResponse.json({ message: `Processed ${results.length} records`, results })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fetch campaign IDs sent to this list after the import date, ordered chronologically
async function getCampaignsAfterImport(fetchFn: FetchFn, listId: number, importDate: string): Promise<number[]> {
  const ids: number[] = []
  const campaignDates: { id: number; date: string }[] = []
  let page = 1

  while (true) {
    const res = await fetchFn(`campaigns?status=finished&per_page=100&page=${page}`)
    if (!res.ok) break
    const data = await res.json()
    const results = data.data?.results || []

    for (const c of results) {
      // Must target this list
      const targetsList = (c.lists || []).some((l: { id: number }) => l.id === listId)
      if (!targetsList) continue
      // Must be sent on or after import date
      const sendDate = c.started_at || c.created_at
      if (!sendDate) continue
      if (sendDate < importDate) continue
      campaignDates.push({ id: c.id, date: sendDate })
    }

    if (results.length < 100) break
    page++
  }

  // Sort by send date ascending (earliest first)
  campaignDates.sort((a, b) => a.date.localeCompare(b.date))
  for (const c of campaignDates) ids.push(c.id)
  return ids
}

// Count unique subscribers from the list who opened at least one of the given campaigns
async function getUniqueOpensForCampaigns(
  fetchFn: FetchFn,
  listId: number,
  campaignIds: number[],
): Promise<number> {
  if (campaignIds.length === 0) return 0
  const idList = campaignIds.join(',')
  const query = `subscribers.id IN (SELECT subscriber_id FROM campaign_views WHERE campaign_id IN (${idList})) AND subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id = ${listId})`
  const res = await fetchFn(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`Listmonk query failed: ${res.status}`)
  const data = await res.json()
  return data.data?.total ?? 0
}

async function getRemainingSubscribers(fetchFn: FetchFn, listId: number): Promise<number> {
  const query = `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id = ${listId})`
  const res = await fetchFn(`subscribers?per_page=0&query=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`Listmonk query failed: ${res.status}`)
  const data = await res.json()
  return data.data?.total ?? 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pushImportTracking(supabase: any, record: any, remainingSubs: number) {
  if (!record.publication_code) return

  try {
    const { data: pub } = await supabase
      .from('publications')
      .select('growth_client_id')
      .eq('code', record.publication_code)
      .not('growth_client_id', 'is', null)
      .limit(1)
      .single()

    if (!pub?.growth_client_id) return

    const imported = record.imported_count || 0
    const sends = []
    for (let i = 1; i <= 4; i++) {
      const openers = record[`week${i}_opens`]
      if (openers !== null && openers !== undefined) {
        sends.push({
          send_number: i,
          openers,
          open_rate: imported > 0 ? parseFloat(((openers / imported) * 100).toFixed(1)) : 0,
          confirmed: true,
        })
      }
    }

    await pushToGrowth({
      type: 'import_tracking',
      client_id: pub.growth_client_id,
      data: {
        name: record.list_name,
        import_date: record.import_date,
        week_number: 0,
        imported,
        total_openers: record.week4_opens || record.week3_opens || record.week2_opens || record.week1_opens || 0,
        purged: imported - remainingSubs,
        status: 'complete',
        sends,
      },
    }, record.publication_code)
  } catch (err) {
    console.error('[ImportTracking] Failed to push to 150growth:', err)
  }
}
