import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET /api/growth-clients — returns the list of 150growth clients pulled from the
// clients table (each client now stores its own growth_client_id).
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const { data: clients, error } = await supabase
    .from('clients')
    .select('name, growth_client_id')
    .not('growth_client_id', 'is', null)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const data = (clients || [])
    .filter((c) => c.growth_client_id)
    .map((c) => ({
      growth_client_id: c.growth_client_id as string,
      label: c.name as string,
    }))

  return NextResponse.json({ data })
}
