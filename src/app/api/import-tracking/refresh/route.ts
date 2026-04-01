import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { listmonkFetch } from '@/lib/listmonk'

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

    for (const record of records) {
      try {
        const importDate = new Date(record.import_date)
        const now = new Date()
        const daysSinceImport = Math.floor(
          (now.getTime() - importDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        const week = Math.floor(daysSinceImport / 7) + 1
        const listId = record.list_id

        if (week >= 1 && week <= 4) {
          const weekColumn = `week${week}_opens`
          if (record[weekColumn] === null || record[weekColumn] === undefined) {
            const uniqueOpens = await getUniqueOpens(listId)
            await supabase
              .from('import_tracking')
              .update({ [weekColumn]: uniqueOpens, updated_at: new Date().toISOString() })
              .eq('id', record.id)
            results.push({ id: record.id, list_id: listId, week, status: `updated ${weekColumn}` })
          } else {
            results.push({ id: record.id, list_id: listId, week, status: 'already recorded' })
          }
        } else if (week > 4) {
          for (let w = 1; w <= 4; w++) {
            const col = `week${w}_opens`
            if (record[col] === null || record[col] === undefined) {
              const uniqueOpens = await getUniqueOpens(listId)
              await supabase
                .from('import_tracking')
                .update({ [col]: uniqueOpens, updated_at: new Date().toISOString() })
                .eq('id', record.id)
            }
          }
          const remainingSubs = await getRemainingSubscribers(listId)
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
        const msg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ id: record.id, list_id: record.list_id, week: 0, status: `failed: ${msg}` })
      }
    }

    return NextResponse.json({ message: `Processed ${results.length} records`, results })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getUniqueOpens(listId: number): Promise<number> {
  const query = `subscribers.id IN (SELECT subscriber_id FROM campaign_views WHERE campaign_id IN (SELECT campaign_id FROM campaign_lists WHERE list_id = ${listId})) AND subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id = ${listId})`
  const res = await listmonkFetch(`/api/subscribers?per_page=0&query=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`Listmonk query failed: ${res.status}`)
  const data = await res.json()
  return data.data?.total ?? 0
}

async function getRemainingSubscribers(listId: number): Promise<number> {
  const query = `subscribers.id IN (SELECT subscriber_id FROM subscriber_lists WHERE list_id = ${listId})`
  const res = await listmonkFetch(`/api/subscribers?per_page=0&query=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`Listmonk query failed: ${res.status}`)
  const data = await res.json()
  return data.data?.total ?? 0
}
