import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase-server'

// GET single automation by ID with linked client, runs, and snapshots
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = await createServiceRoleClient()

  // Fetch the automation
  const { data: automation, error: automationError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', id)
    .single()

  if (automationError) {
    return NextResponse.json({ error: automationError.message }, { status: 500 })
  }

  if (!automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  // Fetch linked client info if client_id is set
  let client = null
  if (automation.client_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', automation.client_id)
      .single()
    client = c || null
  }

  // Fetch 10 most recent runs
  const { data: runs, error: runsError } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('automation_id', id)
    .order('run_at', { ascending: false })
    .limit(10)

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 })
  }

  // Fetch all snapshots
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('automation_snapshots')
    .select('*')
    .eq('automation_id', id)
    .order('snapshot_date', { ascending: true })

  if (snapshotsError) {
    return NextResponse.json({ error: snapshotsError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...automation,
      client,
      runs: runs || [],
      snapshots: snapshots || [],
    },
  })
}
