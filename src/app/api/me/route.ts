import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

const DEFAULT_SECTIONS = ['dashboard', 'lists', 'campaigns', 'stats']

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let allowedSections: string[] | null = null
  if (session.role === 'client' && session.clientId) {
    const supabase = await createServiceRoleClient()
    const { data: client } = await supabase
      .from('clients')
      .select('allowed_sections')
      .eq('id', session.clientId)
      .single()
    allowedSections = (client?.allowed_sections as string[] | null) ?? DEFAULT_SECTIONS
  }

  return NextResponse.json({
    id: session.id,
    email: session.email,
    role: session.role,
    clientId: session.clientId,
    allowedSections,
  })
}
