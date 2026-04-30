import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { DEMO_ALLOWED_SECTIONS, isDemoMode } from '@/lib/demo/config'

const DEFAULT_SECTIONS = ['dashboard', 'lists', 'campaigns', 'stats']

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isDemoMode()) {
    return NextResponse.json({
      id: session.id,
      email: session.email,
      role: session.role,
      clientId: session.clientId,
      primaryClientId: session.clientId,
      availableClients: [],
      allowedSections: DEMO_ALLOWED_SECTIONS,
    })
  }

  const supabase = await createServiceRoleClient()

  // Pull the active client's allowed_sections (varies as the user switches).
  let allowedSections: string[] | null = null
  if (session.role === 'client' && session.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('allowed_sections')
      .eq('id', session.clientId)
      .single()
    allowedSections = (client?.allowed_sections as string[] | null) ?? DEFAULT_SECTIONS
  }

  // Pull the dropdown list of clients this user can switch between.
  // Admins handle their own list via /api/settings/clients (existing flow), so
  // we only populate availableClients for client-role users with assignments.
  let availableClients: { id: string; name: string }[] = []
  if (session.role !== 'admin' && session.allowedClientIds.length > 0) {
    const { data: rows } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', session.allowedClientIds)
      .order('name', { ascending: true })
    availableClients = (rows ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
    }))
  }

  return NextResponse.json({
    id: session.id,
    email: session.email,
    role: session.role,
    clientId: session.clientId,
    primaryClientId: session.primaryClientId,
    availableClients,
    allowedSections,
  })
}
