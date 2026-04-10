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

function resolveClientId(session: { role: string; clientId: string | null }, override: string | null): string | null {
  if (session.role === 'admin' && override) return override
  return session.clientId
}

// POST /api/sourcing/confirm — finalizes the current week so that no more
// edits are allowed. Requires at least one submitted segment.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const clientId = resolveClientId(session, body.clientId ?? null)
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()
  const weekStart = currentWeekStart()

  const { data: week } = await supabase
    .from('sourcing_weeks')
    .select('*')
    .eq('client_id', clientId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (!week) {
    return NextResponse.json({ error: 'No week to confirm' }, { status: 404 })
  }
  if (week.locked) {
    return NextResponse.json({ error: 'Week is already confirmed' }, { status: 409 })
  }

  const { data: submittedSlots } = await supabase
    .from('sourcing_slots')
    .select('id')
    .eq('week_id', week.id)
    .eq('status', 'submitted')

  if (!submittedSlots || submittedSlots.length === 0) {
    return NextResponse.json(
      { error: 'No submitted segments to confirm' },
      { status: 400 }
    )
  }

  const { error: updateError } = await supabase
    .from('sourcing_weeks')
    .update({ locked: true })
    .eq('id', week.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, locked: true })
}
