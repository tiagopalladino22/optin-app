import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET /api/growth-clients — returns the list of 150growth clients derived from publications
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()
  const { data: publications, error } = await supabase
    .from('publications')
    .select('name, code, growth_client_id')
    .not('growth_client_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by growth_client_id — if multiple publications share one, combine their names
  const grouped = new Map<string, { growth_client_id: string; label: string; publications: string[] }>()
  for (const p of publications || []) {
    if (!p.growth_client_id) continue
    const existing = grouped.get(p.growth_client_id)
    const pubLabel = p.name || p.code
    if (existing) {
      existing.publications.push(pubLabel)
    } else {
      grouped.set(p.growth_client_id, {
        growth_client_id: p.growth_client_id,
        label: pubLabel,
        publications: [pubLabel],
      })
    }
  }

  const clients = Array.from(grouped.values())
    .map((c) => ({
      growth_client_id: c.growth_client_id,
      label: c.publications.length > 1
        ? `${c.publications[0]} (+ ${c.publications.length - 1} more)`
        : c.publications[0],
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return NextResponse.json({ data: clients })
}
