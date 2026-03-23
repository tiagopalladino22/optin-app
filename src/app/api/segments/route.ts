import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET all segments for the current user's client
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()

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

  const supabase = await createServerSupabaseClient()

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
