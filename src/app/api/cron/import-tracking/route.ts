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

      const importDate = new Date(record.import_date)
      const now = new Date()
      const daysSinceImport = Math.floor(
        (now.getTime() - importDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const week = Math.floor(daysSinceImport / 7) + 1
      const listId = record.list_id

      if (week >= 1 && week <= 4) {
        const weekColumn = `week${week}_opens`
        const uniqueOpens = await getUniqueOpens(fetchFn, listId)
        await supabase
          .from('import_tracking')
          .update({ [weekColumn]: uniqueOpens, updated_at: new Date().toISOString() })
          .eq('id', record.id)
        results.push({ id: record.id, list_id: listId, week, status: `updated ${weekColumn}` })
      } else if (week > 4) {
        for (let w = 1; w <= 4; w++) {
          const col = `week${w}_opens`
          if (record[col] === null || record[col] === undefined) {
            const uniqueOpens = await getUniqueOpens(fetchFn, listId)
            await supabase
              .from('import_tracking')
              .update({ [col]: uniqueOpens, updated_at: new Date().toISOString() })
              .eq('id', record.id)
          }
        }
        const remainingSubs = await getRemainingSubscribers(fetchFn, listId)
        await supabase
          .from('import_tracking')
          .update({
            remaining_subs: remainingSubs,
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id)
        results.push({ id: record.id, list_id: listId, week, status: 'completed' })
      } else {
        results.push({ id: record.id, list_id: listId, week, status: 'too early' })
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

async function getUniqueOpens(fetchFn: FetchFn, listId: number): Promise<number> {
  const query = `subscribers.id IN (SELECT subscriber_id FROM campaign_views WHERE campaign_id IN (SELECT campaign_id FROM campaign_lists WHERE list_id = ${listId})) AND subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id = ${listId})`
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
