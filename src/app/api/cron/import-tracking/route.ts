import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'

type FetchFn = (path: string, options?: RequestInit) => Promise<Response>

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const results: { id: string; list_id: number; week: number; status: string; error?: string }[] = []

  const { data: records, error } = await supabase
    .from('import_tracking')
    .select('*')
    .eq('status', 'tracking')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ message: 'No records to track', results: [] })
  }

  const clientFetchCache: Record<string, FetchFn> = {}

  for (const record of records) {
    try {
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

      // Get campaigns sent to this list after import date
      const campaignIds = await getCampaignsAfterImport(fetchFn, listId, record.import_date)

      if (campaignIds.length === 0) {
        results.push({ id: record.id, list_id: listId, week: 0, status: 'no sends yet' })
        continue
      }

      // Cumulative unique openers for first N campaigns
      const updates: Record<string, number> = {}
      const maxWeek = Math.min(campaignIds.length, 4)
      for (let w = 1; w <= maxWeek; w++) {
        const firstN = campaignIds.slice(0, w)
        const opens = await getUniqueOpensForCampaigns(fetchFn, listId, firstN)
        updates[`week${w}_opens`] = opens
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('import_tracking')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', record.id)
      }

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
        results.push({ id: record.id, list_id: listId, week: 4, status: `completed (${campaignIds.length} sends)` })
      } else {
        results.push({
          id: record.id,
          list_id: listId,
          week: maxWeek,
          status: `updated weeks 1-${maxWeek} (${campaignIds.length} sends)`,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      results.push({ id: record.id, list_id: record.list_id, week: 0, status: 'failed', error: errorMessage })
    }
  }

  return NextResponse.json({
    message: `Processed ${results.length} import tracking record(s)`,
    results,
  })
}

async function getCampaignsAfterImport(fetchFn: FetchFn, listId: number, importDate: string): Promise<number[]> {
  const campaignDates: { id: number; date: string }[] = []
  let page = 1
  while (true) {
    const res = await fetchFn(`campaigns?status=finished&per_page=100&page=${page}`)
    if (!res.ok) break
    const data = await res.json()
    const results = data.data?.results || []
    for (const c of results) {
      const targetsList = (c.lists || []).some((l: { id: number }) => l.id === listId)
      if (!targetsList) continue
      const sendDate = c.started_at || c.created_at
      if (!sendDate || sendDate < importDate) continue
      campaignDates.push({ id: c.id, date: sendDate })
    }
    if (results.length < 100) break
    page++
  }
  campaignDates.sort((a, b) => a.date.localeCompare(b.date))
  return campaignDates.map((c) => c.id)
}

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
