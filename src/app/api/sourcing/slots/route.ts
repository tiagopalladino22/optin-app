import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createApolloFetch, buildSearchBody, hasAnyFilter, SlotFilters, APOLLO_SEARCH_PATH } from '@/lib/apollo'

interface ClientSourcingConfig {
  sourcing_window_day_open: number | null
  sourcing_window_day_close: number | null
  apollo_api_key: string | null
}

// Returns Monday of the current ISO week (in UTC) as YYYY-MM-DD.
function currentWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun..6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday))
  return monday.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Submission window check. NULL fields on the client → always open.
// Window is inclusive on both ends based on UTC day-of-week.
function isWindowOpen(cfg: ClientSourcingConfig): boolean {
  const open = cfg.sourcing_window_day_open
  const close = cfg.sourcing_window_day_close
  if (open == null || close == null) return true
  const today = new Date().getUTCDay() // 0=Sun..6=Sat
  if (open <= close) {
    return today >= open && today <= close
  }
  // wrap-around window (e.g. Sat..Mon)
  return today >= open || today <= close
}

async function getOrCreateWeek(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>, clientId: string) {
  const weekStart = currentWeekStart()
  const weekEnd = addDays(weekStart, 6)

  const { data: existing } = await supabase
    .from('sourcing_weeks')
    .select('*')
    .eq('client_id', clientId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from('sourcing_weeks')
    .insert({ client_id: clientId, week_start: weekStart, week_end: weekEnd })
    .select()
    .single()

  if (error) throw error
  return created
}

function resolveClientId(session: { role: string; clientId: string | null }, override: string | null): string | null {
  if (session.role === 'admin' && override) return override
  return session.clientId
}

// GET /api/sourcing/slots — returns { week, client, slots: [slot1, slot2, slot3] }
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const clientId = resolveClientId(session, url.searchParams.get('clientId'))
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, apollo_api_key, sourcing_window_day_open, sourcing_window_day_close')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const week = await getOrCreateWeek(supabase, clientId)

  const { data: existingSlots } = await supabase
    .from('sourcing_slots')
    .select('*')
    .eq('week_id', week.id)
    .order('slot_number', { ascending: true })

  // Always return three slots (fill in empty drafts for missing ones)
  const slots = [1, 2, 3].map((n) => {
    const found = existingSlots?.find((s) => s.slot_number === n)
    return (
      found || {
        id: null,
        week_id: week.id,
        client_id: clientId,
        slot_number: n,
        filters: {},
        net_new_count: null,
        requested_count: null,
        status: 'draft',
        submitted_at: null,
      }
    )
  })

  return NextResponse.json({
    week,
    client: {
      id: client.id,
      name: client.name,
      has_apollo_key: Boolean(client.apollo_api_key),
      window_open: client.sourcing_window_day_open,
      window_close: client.sourcing_window_day_close,
    },
    window_is_open: isWindowOpen({
      sourcing_window_day_open: client.sourcing_window_day_open,
      sourcing_window_day_close: client.sourcing_window_day_close,
      apollo_api_key: client.apollo_api_key,
    }),
    is_locked: Boolean(week.locked),
    slots,
  })
}

// PUT /api/sourcing/slots — upsert a draft slot's filters
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slot_number, filters, clientId: bodyClientId } = body

  if (typeof slot_number !== 'number' || slot_number < 1 || slot_number > 3) {
    return NextResponse.json({ error: 'slot_number must be 1, 2, or 3' }, { status: 400 })
  }

  const clientId = resolveClientId(session, bodyClientId)
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  const { data: client } = await supabase
    .from('clients')
    .select('apollo_api_key, sourcing_window_day_open, sourcing_window_day_close')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  if (!isWindowOpen(client)) {
    return NextResponse.json({ error: 'Submission window is closed' }, { status: 409 })
  }

  const week = await getOrCreateWeek(supabase, clientId)

  // Reject if the week has been confirmed (final lock)
  if (week.locked) {
    return NextResponse.json({ error: 'Week is confirmed and locked' }, { status: 409 })
  }

  // PUT is the draft-save path. When editing a previously-submitted slot,
  // overwrite it back to draft so the UI can let the user resubmit with
  // new values.
  const { data, error } = await supabase
    .from('sourcing_slots')
    .upsert(
      {
        week_id: week.id,
        client_id: clientId,
        slot_number,
        filters: filters || {},
        status: 'draft',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_id,slot_number' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST /api/sourcing/slots — submit a single slot with an allocation.
// Body: { slot_number, requested_count, filters? }
// Filters are optional — if provided, they're saved as the final filter state
// before locking. This lets the client submit draft + allocation in one call.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slot_number, requested_count, filters, clientId: bodyClientId } = body

  if (typeof slot_number !== 'number' || slot_number < 1 || slot_number > 3) {
    return NextResponse.json({ error: 'slot_number must be 1, 2, or 3' }, { status: 400 })
  }
  if (typeof requested_count !== 'number' || requested_count <= 0) {
    return NextResponse.json(
      { error: 'requested_count must be a positive number' },
      { status: 400 }
    )
  }

  const clientId = resolveClientId(session, bodyClientId)
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  const { data: client } = await supabase
    .from('clients')
    .select('apollo_api_key, sourcing_window_day_open, sourcing_window_day_close')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  if (!isWindowOpen(client)) {
    return NextResponse.json({ error: 'Submission window is closed' }, { status: 409 })
  }

  const week = await getOrCreateWeek(supabase, clientId)

  // Reject if the week has been confirmed (final lock).
  if (week.locked) {
    return NextResponse.json({ error: 'Week is confirmed and locked' }, { status: 409 })
  }

  // If the client passed filters, upsert them first (so submit can be a
  // single call). This also lets us overwrite a previously-submitted slot
  // when the user is re-editing before final confirmation.
  if (filters) {
    await supabase.from('sourcing_slots').upsert(
      {
        week_id: week.id,
        client_id: clientId,
        slot_number,
        filters,
        status: 'draft',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_id,slot_number' }
    )
  }

  const { data: slot } = await supabase
    .from('sourcing_slots')
    .select('*')
    .eq('week_id', week.id)
    .eq('slot_number', slot_number)
    .maybeSingle()

  if (!slot) {
    return NextResponse.json({ error: 'Slot not found — build it first' }, { status: 404 })
  }

  const slotFilters = slot.filters as SlotFilters
  if (!hasAnyFilter(slotFilters)) {
    return NextResponse.json({ error: 'Slot has no filters' }, { status: 400 })
  }

  // Snapshot net_new_count by hitting Apollo (best-effort)
  let netNewCount: number | null = slot.net_new_count
  if (client.apollo_api_key) {
    try {
      const apolloFetch = createApolloFetch(client.apollo_api_key)
      const res = await apolloFetch(APOLLO_SEARCH_PATH, buildSearchBody(slotFilters, 1))
      if (res.ok) {
        const json = await res.json()
        netNewCount = json?.pagination?.total_entries ?? netNewCount
      }
    } catch (err) {
      console.error('[sourcing submit] apollo snapshot failed', err)
    }
  }

  const { data: updated, error } = await supabase
    .from('sourcing_slots')
    .update({
      status: 'submitted',
      net_new_count: netNewCount,
      requested_count,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', slot.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

// DELETE /api/sourcing/slots — clear a slot back to empty draft
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { slot_number, clientId: bodyClientId } = body

  if (typeof slot_number !== 'number' || slot_number < 1 || slot_number > 3) {
    return NextResponse.json({ error: 'slot_number must be 1, 2, or 3' }, { status: 400 })
  }

  const clientId = resolveClientId(session, bodyClientId)
  if (!clientId) {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()

  const { data: client } = await supabase
    .from('clients')
    .select('sourcing_window_day_open, sourcing_window_day_close, apollo_api_key')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }
  if (!isWindowOpen(client)) {
    return NextResponse.json({ error: 'Submission window is closed' }, { status: 409 })
  }

  const week = await getOrCreateWeek(supabase, clientId)

  if (week.locked) {
    return NextResponse.json({ error: 'Week is confirmed and locked' }, { status: 409 })
  }

  const { data: existing } = await supabase
    .from('sourcing_slots')
    .select('*')
    .eq('week_id', week.id)
    .eq('slot_number', slot_number)
    .maybeSingle()

  if (existing) {
    await supabase.from('sourcing_slots').delete().eq('id', existing.id)
  }

  return NextResponse.json({ success: true })
}
