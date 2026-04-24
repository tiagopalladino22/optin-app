import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET all automations for the current user's client
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  let query = supabase
    .from('automations')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (session.role !== 'admin' && session.clientId) {
    query = query.eq('client_id', session.clientId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the clients join so the UI can show "Linked client: <name>".
  const shaped = data?.map((item: Record<string, unknown>) => {
    const { clients, ...rest } = item
    return { ...rest, client: clients || null }
  })

  return NextResponse.json({ data: shaped })
}

// POST create a new automation
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    rules,
    schedule_day,
    schedule_hour,
    schedule_timezone,
    client_id: bodyClientId,
    logic,
    actions,
    cohort_weeks,
    is_active,
  } = body

  // Admins can target any client; client users always tag with their own.
  const clientId = session.role === 'admin'
    ? (bodyClientId || null)
    : (session.clientId || null)

  if (!clientId) {
    return NextResponse.json({ error: 'A linked client is required' }, { status: 400 })
  }

  if (!name || !rules?.length || schedule_day === undefined || schedule_hour === undefined || !schedule_timezone) {
    return NextResponse.json(
      { error: 'Name, rules, schedule_day, schedule_hour, and schedule_timezone are required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from('automations')
    .insert({
      client_id: clientId,
      name,
      rules,
      schedule_day,
      schedule_hour,
      schedule_timezone,
      logic: logic || 'and',
      actions: actions || [],
      cohort_weeks: cohort_weeks || null,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// PUT update an automation
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ...fields } = body

  if (!id) {
    return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const baseFields = [
    'name', 'rules', 'schedule_day', 'schedule_hour', 'schedule_timezone',
    'logic', 'actions', 'cohort_weeks', 'is_active',
  ]
  // Only admins can re-target an automation to a different client.
  const allowedFields = session.role === 'admin' ? [...baseFields, 'client_id'] : baseFields

  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (fields[key] !== undefined) updates[key] = fields[key]
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('automations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// DELETE an automation
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { error } = await supabase
    .from('automations')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
