import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET all publications for the current user's client
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  let query = supabase
    .from('publications')
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

// POST create a new publication
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
  const { code, name } = body

  if (!code || !name?.trim()) {
    return NextResponse.json(
      { error: 'Code and name are required' },
      { status: 400 }
    )
  }

  const upperCode = code.toUpperCase()
  if (!/^[A-Z]{3}$/.test(upperCode)) {
    return NextResponse.json(
      { error: 'Code must be exactly 3 uppercase letters' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from('publications')
    .insert({
      client_id: clientId || null,
      code: upperCode,
      name: name.trim(),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

// PUT update a publication
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, code, name, growth_client_id, sync_grouping, sync_send_days, sync_enabled, sync_match_by } = body

  if (!id) {
    return NextResponse.json({ error: 'Publication ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const updates: Record<string, unknown> = {}
  if (code !== undefined) {
    const upperCode = code.toUpperCase()
    if (!/^[A-Z]{3}$/.test(upperCode)) {
      return NextResponse.json(
        { error: 'Code must be exactly 3 uppercase letters' },
        { status: 400 }
      )
    }
    updates.code = upperCode
  }
  if (name !== undefined) updates.name = name.trim()
  if (growth_client_id !== undefined) updates.growth_client_id = growth_client_id || null
  if (sync_grouping !== undefined) updates.sync_grouping = sync_grouping
  if (sync_send_days !== undefined) updates.sync_send_days = sync_send_days
  if (sync_enabled !== undefined) updates.sync_enabled = sync_enabled
  if (sync_match_by !== undefined) updates.sync_match_by = sync_match_by

  const { data, error } = await supabase
    .from('publications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// DELETE a publication
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'Publication ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { error } = await supabase
    .from('publications')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
