import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// Returns Monday of the current ISO week (UTC) as YYYY-MM-DD.
function currentWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday))
  return monday.toISOString().slice(0, 10)
}

// GET /api/sourcing/admin?week=YYYY-MM-DD
// Admin-only. Returns all submitted slots for the given week, grouped by client.
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const weekStart = url.searchParams.get('week') || currentWeekStart()

  const supabase = await createServiceRoleClient()

  // Fetch weeks for the target week across all clients
  const { data: weeks, error: weeksError } = await supabase
    .from('sourcing_weeks')
    .select('id, client_id, week_start, week_end')
    .eq('week_start', weekStart)

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 })
  }

  if (!weeks || weeks.length === 0) {
    return NextResponse.json({ week_start: weekStart, clients: [] })
  }

  const weekIds = weeks.map((w) => w.id)

  const [{ data: slots }, { data: clients }] = await Promise.all([
    supabase
      .from('sourcing_slots')
      .select('*')
      .in('week_id', weekIds)
      .eq('status', 'submitted')
      .order('slot_number', { ascending: true }),
    supabase
      .from('clients')
      .select('id, name')
      .in(
        'id',
        weeks.map((w) => w.client_id)
      ),
  ])

  const clientsById = new Map((clients || []).map((c) => [c.id, c]))
  const weekByClient = new Map(weeks.map((w) => [w.client_id, w]))

  type SlotRow = {
    client_id: string
    slot_number: number
    filters: unknown
    net_new_count: number | null
    submitted_at: string | null
  }

  // Group slots by client
  const grouped = new Map<string, { client_name: string; week_end: string; slots: SlotRow[] }>()
  for (const slot of (slots || []) as SlotRow[]) {
    const client = clientsById.get(slot.client_id)
    const week = weekByClient.get(slot.client_id)
    if (!client || !week) continue
    if (!grouped.has(slot.client_id)) {
      grouped.set(slot.client_id, {
        client_name: client.name,
        week_end: week.week_end,
        slots: [],
      })
    }
    grouped.get(slot.client_id)!.slots.push(slot)
  }

  const result = Array.from(grouped.entries()).map(([client_id, info]) => ({
    client_id,
    client_name: info.client_name,
    week_end: info.week_end,
    slots: info.slots,
  }))

  return NextResponse.json({ week_start: weekStart, clients: result })
}
