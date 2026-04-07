import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch, createClientListmonkFetch } from '@/lib/listmonk'
import { pushToGrowth } from '@/lib/webhook-client'

type FetchFn = (path: string, options?: RequestInit) => Promise<Response>

export async function POST() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()
    const results: { id: string; list_id: number; week: number; status: string }[] = []

    const { data: records, error } = await supabase
      .from('import_tracking')
      .select('*')
      .eq('status', 'tracking')

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

        const importDate = new Date(record.import_date)
        const now = new Date()
        const daysSinceImport = Math.floor(
          (now.getTime() - importDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        const week = Math.floor(daysSinceImport / 7) + 1
        const listId = record.list_id

        if (week >= 1 && week <= 4) {
          // Always update current week (overwrite previous value to get latest count)
          const weekColumn = `week${week}_opens`
          const uniqueOpens = await getUniqueOpens(fetchFn, listId)
          await supabase
            .from('import_tracking')
            .update({ [weekColumn]: uniqueOpens, updated_at: new Date().toISOString() })
            .eq('id', record.id)
          results.push({ id: record.id, list_id: listId, week, status: `updated ${weekColumn} = ${uniqueOpens}` })
        } else if (week > 4) {
          // Fill any remaining null week columns
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

          // Push completed tracking to 150growth
          await pushImportTracking(supabase, record, remainingSubs)
        } else {
          results.push({ id: record.id, list_id: listId, week, status: 'too early' })
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
