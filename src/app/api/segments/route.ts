import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { isDemoMode } from '@/lib/demo/config'
import { DEMO_SEGMENTS } from '@/lib/demo/fixtures/segments'

// GET all segments for the current user's client
export async function GET() {
  if (isDemoMode()) return NextResponse.json({ data: DEMO_SEGMENTS })

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  let query = supabase
    .from('segments')
    .select('*')
    .order('created_at', { ascending: false })

  if (session.role !== 'admin' && session.clientId) {
    query = query.eq('client_id', session.clientId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST create a new segment
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = session.clientId
  if (!clientId && session.role !== 'admin') {
    return NextResponse.json({ error: 'No client associated' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, rules, logic } = body

  if (!name || !rules?.length) {
    return NextResponse.json(
      { error: 'Name and at least one rule are required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from('segments')
    .insert({
      client_id: clientId,
      name,
      description: description || null,
      rules,
      logic: logic || 'and',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// PUT update a segment
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, name, description, rules, logic } = body

  if (!id) {
    return NextResponse.json({ error: 'Segment ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description || null
  if (rules !== undefined) updates.rules = rules
  if (logic !== undefined) updates.logic = logic

  const { data, error } = await supabase
    .from('segments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// DELETE a segment
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'Segment ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { error } = await supabase
    .from('segments')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
