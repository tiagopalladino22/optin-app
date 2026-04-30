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

  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, role, client_id, created_at')
    .order('created_at', { ascending: false })

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  const { data: authData, error: authError } =
    await supabase.auth.admin.listUsers({ perPage: 1000 })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const emailMap = new Map(authData.users.map((u) => [u.id, u.email]))

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')

  const clientMap = new Map(
    (clients || []).map((c: { id: string; name: string }) => [c.id, c.name])
  )

  // Pull every user_clients row so we can attach an assigned_clients[] per user.
  const { data: userClients } = await supabase
    .from('user_clients')
    .select('user_id, client_id, is_primary')

  const assignmentsByUser = new Map<
    string,
    { id: string; name: string; is_primary: boolean }[]
  >()
  for (const row of userClients || []) {
    const list = assignmentsByUser.get(row.user_id as string) || []
    list.push({
      id: row.client_id as string,
      name: clientMap.get(row.client_id as string) || 'Unknown',
      is_primary: row.is_primary as boolean,
    })
    assignmentsByUser.set(row.user_id as string, list)
  }

  const users = (profiles || []).map((p) => ({
    id: p.id,
    email: emailMap.get(p.id) || 'Unknown',
    role: p.role,
    clientId: p.client_id,
    clientName: p.client_id ? clientMap.get(p.client_id) || null : null,
    assigned_clients: assignmentsByUser.get(p.id) || [],
    createdAt: p.created_at,
  }))

  return NextResponse.json({ data: users })
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
  const { email, password, role, clientId, assigned_client_ids, primary_client_id } = body

  if (!email || !password || !role) {
    return NextResponse.json(
      { error: 'Email, password, and role are required' },
      { status: 400 }
    )
  }
  if (role !== 'admin' && role !== 'client') {
    return NextResponse.json({ error: 'Role must be admin or client' }, { status: 400 })
  }

  // For client-role users, accept either the new shape (assigned_client_ids + primary_client_id)
  // or the legacy single clientId for backward compatibility.
  let assignedIds: string[] = []
  let primaryId: string | null = null
  if (role === 'client') {
    if (Array.isArray(assigned_client_ids) && assigned_client_ids.length > 0) {
      assignedIds = assigned_client_ids
      primaryId = primary_client_id || assignedIds[0]
    } else if (clientId) {
      assignedIds = [clientId]
      primaryId = clientId
    } else {
      return NextResponse.json(
        { error: 'At least one assigned client is required for client role' },
        { status: 400 }
      )
    }
    if (!assignedIds.includes(primaryId!)) {
      return NextResponse.json(
        { error: 'Primary client must be one of the assigned clients' },
        { status: 400 }
      )
    }
  }

  const supabase = await createServiceRoleClient()

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      role,
      client_id: role === 'admin' ? null : primaryId,
    })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // Persist client assignments (only meaningful for client-role users)
  if (role === 'client' && assignedIds.length > 0) {
    const rows = assignedIds.map((cid) => ({
      user_id: authData.user.id,
      client_id: cid,
      is_primary: cid === primaryId,
    }))
    const { error: assignError } = await supabase.from('user_clients').insert(rows)
    if (assignError) {
      // Clean up auth user + profile if assignment write fails
      await supabase.from('user_profiles').delete().eq('id', authData.user.id)
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: assignError.message }, { status: 500 })
    }
  }

  return NextResponse.json(
    { data: { id: authData.user.id, email } },
    { status: 201 }
  )
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
  const { id, role, assigned_client_ids, primary_client_id } = body

  if (!id) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const updates: Record<string, unknown> = {}
  if (role === 'admin' || role === 'client') updates.role = role

  if (role === 'client' || (Array.isArray(assigned_client_ids) && assigned_client_ids.length > 0)) {
    if (!Array.isArray(assigned_client_ids) || assigned_client_ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one assigned client is required for client role' },
        { status: 400 }
      )
    }
    const primaryId = primary_client_id || assigned_client_ids[0]
    if (!assigned_client_ids.includes(primaryId)) {
      return NextResponse.json(
        { error: 'Primary client must be one of the assigned clients' },
        { status: 400 }
      )
    }
    updates.client_id = primaryId

    // Replace user_clients rows atomically (delete + insert).
    await supabase.from('user_clients').delete().eq('user_id', id)
    const rows = assigned_client_ids.map((cid: string) => ({
      user_id: id,
      client_id: cid,
      is_primary: cid === primaryId,
    }))
    const { error: insertError } = await supabase.from('user_clients').insert(rows)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  } else if (role === 'admin') {
    // Promoting to admin — clear assignments
    updates.client_id = null
    await supabase.from('user_clients').delete().eq('user_id', id)
  }

  if (Object.keys(updates).length > 0) {
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', id)
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
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
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }
  if (id === session.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // user_clients cascades from user_profiles via FK ON DELETE CASCADE.
  await supabase.from('user_profiles').delete().eq('id', id)

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
