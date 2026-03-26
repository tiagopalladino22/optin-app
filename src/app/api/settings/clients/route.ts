import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createServiceRoleClient()
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with assigned resources count and user count
  const { data: resources } = await supabase
    .from('client_resources')
    .select('client_id, resource_type')

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('client_id')
    .eq('role', 'client')

  const resourceCounts = new Map<string, number>()
  const userCounts = new Map<string, number>()

  for (const r of resources || []) {
    resourceCounts.set(r.client_id, (resourceCounts.get(r.client_id) || 0) + 1)
  }
  for (const p of profiles || []) {
    if (p.client_id) {
      userCounts.set(p.client_id, (userCounts.get(p.client_id) || 0) + 1)
    }
  }

  const enriched = (clients || []).map((c: Record<string, unknown>) => ({
    ...c,
    assigned_lists: resourceCounts.get(c.id as string) || 0,
    user_count: userCounts.get(c.id as string) || 0,
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, slug, owner_email, listmonk_url, listmonk_username, listmonk_password } = body

  if (!name || !slug || !owner_email) {
    return NextResponse.json(
      { error: 'Name, slug, and owner_email are required' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name,
      slug,
      owner_email,
      listmonk_url: listmonk_url || process.env.LISTMONK_URL || null,
      listmonk_username: listmonk_username || null,
      listmonk_password: listmonk_password || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, slug, owner_email, listmonk_url, listmonk_username, listmonk_password } = body

  if (!id) {
    return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (slug !== undefined) updates.slug = slug
  if (owner_email !== undefined) updates.owner_email = owner_email
  if (listmonk_url !== undefined) updates.listmonk_url = listmonk_url || null
  if (listmonk_username !== undefined) updates.listmonk_username = listmonk_username || null
  if (listmonk_password !== undefined) updates.listmonk_password = listmonk_password || null

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // Delete client (cascade will remove client_resources)
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
