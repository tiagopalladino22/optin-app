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

  // Get all user profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, role, client_id, created_at')
    .order('created_at', { ascending: false })

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  // Get all auth users to get emails
  const { data: authData, error: authError } =
    await supabase.auth.admin.listUsers({ perPage: 1000 })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const authUsers = authData.users
  const emailMap = new Map(authUsers.map((u) => [u.id, u.email]))

  // Get all clients for name lookup
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')

  const clientMap = new Map(
    (clients || []).map((c: { id: string; name: string }) => [c.id, c.name])
  )

  const users = (profiles || []).map((p) => ({
    id: p.id,
    email: emailMap.get(p.id) || 'Unknown',
    role: p.role,
    clientId: p.client_id,
    clientName: p.client_id ? clientMap.get(p.client_id) || null : null,
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
  const { email, password, role, clientId } = body

  if (!email || !password || !role) {
    return NextResponse.json(
      { error: 'Email, password, and role are required' },
      { status: 400 }
    )
  }

  if (role !== 'admin' && role !== 'client') {
    return NextResponse.json(
      { error: 'Role must be admin or client' },
      { status: 400 }
    )
  }

  if (role === 'client' && !clientId) {
    return NextResponse.json(
      { error: 'Client ID is required for client role' },
      { status: 400 }
    )
  }

  const supabase = await createServiceRoleClient()

  // Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Create user profile
  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      id: authData.user.id,
      role,
      client_id: role === 'admin' ? null : clientId,
    })

  if (profileError) {
    // Clean up auth user if profile creation fails
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(
    { data: { id: authData.user.id, email } },
    { status: 201 }
  )
}
